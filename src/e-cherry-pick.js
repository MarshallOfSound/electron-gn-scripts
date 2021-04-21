#!/usr/bin/env node

const d = require('debug')('build-tools:cherry-pick');
const program = require('commander');
const https = require('https');
const { Octokit } = require('@octokit/rest');

const { getGitHubAuthToken } = require('./utils/github-auth');

function fetchBase64(url) {
  return new Promise((resolve, reject) => {
    https
      .request(url, res => {
        let data = '';
        res.setEncoding('ascii');
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(Buffer.from(data, 'base64').toString('utf8'));
        });
        res.on('error', reject);
      })
      .end();
  });
}

program
  .arguments('<patch-url> <target-branch> [additionalBranches...]')
  .option('--security', 'Whether this backport is for security reasons')
  .description('Opens a PR to electron/electron that backport the given CL into our patches folder')
  .action(async (patchUrlStr, targetBranch, additionalBranches) => {
    const octokit = new Octokit({
      auth: await getGitHubAuthToken(),
    });
    try {
      const {
        data: { permissions },
      } = await octokit.repos.get({
        owner: 'electron',
        repo: 'electron',
      });
      if (!permissions || !permissions.push) {
        console.error(
          'The supplied $GITHUB_TOKEN does not have write access to electron/electron, this script will bail now',
        );
        process.exit(1);
      }

      const targetBranches = [targetBranch, ...additionalBranches];

      const gerritUrl = new URL(patchUrlStr);
      if (
        gerritUrl.host !== 'chromium-review.googlesource.com' &&
        gerritUrl.host !== 'skia-review.googlesource.com'
      ) {
        console.error(
          'Expected a gerrit URL (e.g. https://chromium-review.googlesource.com/c/v8/v8/+/2465830)',
        );
        process.exit(1);
      }
      const [, repo, number] = /^\/c\/(.+?)\/\+\/(\d+)/.exec(gerritUrl.pathname);

      d(`fetching patch from gerrit`);
      const changeId = `${repo}~${number}`;
      const patchUrl = new URL(
        `/changes/${encodeURIComponent(changeId)}/revisions/current/patch`,
        gerritUrl,
      );
      const patch = await fetchBase64(patchUrl.toString());

      const [, commitId] = /^From ([0-9a-f]+)/.exec(patch);

      const patchDirName =
        {
          'chromium/src': 'chromium',
          skia: 'skia',
        }[repo] || repo.split('/')[1];

      const shortCommit = commitId.substr(0, 12);
      const patchName = `cherry-pick-${shortCommit}.patch`;
      const patchPath = `patches/${patchDirName}`;
      for (const target of targetBranches) {
        const branchName = `cherry-pick/${target}/${patchDirName}/${shortCommit}`;
        d(`fetching electron base branch info for ${target}`);
        const {
          data: {
            commit: {
              sha: targetSha,
              commit: {
                tree: { sha: targetBaseTreeSha },
              },
            },
          },
        } = await octokit.repos.getBranch({
          owner: 'electron',
          repo: 'electron',
          branch: target,
        });

        d(`fetching base patch list`);
        const { data: patchListData } = await octokit.repos
          .getContent({
            owner: 'electron',
            repo: 'electron',
            path: `${patchPath}/.patches`,
            ref: targetSha,
          })
          .catch(err => {
            console.log(
              `NOTE: No patches existing for ${patchDirName} in ${target}, added a dir under patches/ but you'll need to manually edit patches/config.json`,
            );
            return {
              data: null,
            };
          });
        const patchList = patchListData
          ? Buffer.from(patchListData.content, 'base64').toString('utf8')
          : '';
        const newPatchList = patchList + `${patchName}\n`;

        d(`creating tree base_tree=${targetBaseTreeSha}`);
        const { data: tree } = await octokit.git.createTree({
          owner: 'electron',
          repo: 'electron',
          base_tree: targetBaseTreeSha,
          tree: [
            {
              path: `${patchPath}/.patches`,
              mode: '100644',
              type: 'blob',
              content: newPatchList,
            },
            {
              path: `${patchPath}/${patchName}`,
              mode: '100644',
              type: 'blob',
              content: patch,
            },
          ],
        });

        d(`creating commit tree=${tree.sha} parent=${targetSha}`);
        const { data: commit } = await octokit.git.createCommit({
          owner: 'electron',
          repo: 'electron',
          tree: tree.sha,
          parents: [targetSha],
          message: `chore: cherry-pick ${shortCommit} from ${patchDirName}`,
        });

        d(`creating ref`);
        await octokit.git.createRef({
          owner: 'electron',
          repo: 'electron',
          ref: `refs/heads/${branchName}`,
          sha: commit.sha,
        });

        const bugNumber = (/^Bug: (.+)$/m.exec(patch) || [])[1];

        const commitMessage = /Subject: \[PATCH\] (.+?)^---$/ms.exec(patch)[1];

        d(`creating pr`);
        const { data: pr } = await octokit.pulls.create({
          owner: 'electron',
          repo: 'electron',
          head: `electron:${branchName}`,
          base: target,
          title: `chore: cherry-pick ${shortCommit} from ${patchDirName}`,
          body: `${commitMessage}\n\nNotes: ${
            bugNumber
              ? program.security
                ? `Security: backported fix for ${bugNumber}.`
                : `Backported fix for ${bugNumber}.`
              : `<!-- couldn't find bug number -->`
          }`,
          maintainer_can_modify: true,
        });

        d(`labelling pr`);
        await octokit.issues.update({
          owner: 'electron',
          repo: 'electron',
          issue_number: pr.number,
          labels: [
            target,
            'backport-check-skip',
            'semver/patch',
            ...(program.security ? ['security 🔒'] : []),
          ],
        });

        console.log(`Created cherry-pick PR to ${target}: ${pr.html_url}`);
      }
    } catch (err) {
      console.error('Failed to cherry-pick:', err);
      process.exit(1);
    }
  })
  .parse(process.argv);
