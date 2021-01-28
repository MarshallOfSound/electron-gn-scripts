#!/usr/bin/env node

const chalk = require('chalk');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const program = require('commander');
const semver = require('semver');

const { color, fatal } = require('./utils/logging');

const BUILD_TOOLS_INSTALLER_MIN_VERSION = '1.0.4';

program
  .allowUnknownOption()
  .description('Check for build-tools updates')
  .parse(process.argv);

try {
  console.log('Checking for build-tools updates');

  // Check if @electron/build-tools needs to be updated
  let globalNodeModulesPaths = [];

  try {
    globalNodeModulesPaths.push(
      cp
        .execSync('npm root -g')
        .toString('utf8')
        .trim(),
    );
  } catch {}

  try {
    globalNodeModulesPaths.push(
      cp
        .execSync('yarn global dir')
        .toString('utf8')
        .trim(),
    );
  } catch {}

  for (const globalNodeModules of globalNodeModulesPaths) {
    try {
      const buildToolsInstallerPackage = path.resolve(
        globalNodeModules,
        '@electron',
        'build-tools',
        'package.json',
      );
      const version = JSON.parse(fs.readFileSync(buildToolsInstallerPackage)).version;

      if (semver.lt(version, BUILD_TOOLS_INSTALLER_MIN_VERSION)) {
        console.log(
          `\n${chalk.bgWhite.black('NOTE')} Please update ${chalk.greenBright(
            '@electron/build-tools',
          )}\n`,
        );
      }
      break;
    } catch {}
  }

  const execOpts = {
    cwd: path.resolve(__dirname, '..'),
  };

  const headBefore = cp
    .execSync('git rev-parse --verify HEAD', execOpts)
    .toString('utf8')
    .trim();

  const currentBranch = cp
    .execSync('git rev-parse --abbrev-ref HEAD', execOpts)
    .toString('utf8')
    .trim();

  if (currentBranch !== 'master') {
    fatal(
      `build-tools is checked out on ${currentBranch} and not 'master' - please switch and try again.`,
    );
  }

  console.log(color.childExec('git', ['pull', '--rebase', '--autostash'], execOpts));
  cp.execSync('git pull --rebase --autostash', execOpts);
  const headAfter = cp
    .execSync('git rev-parse --verify HEAD', execOpts)
    .toString('utf8')
    .trim();
  if (headBefore !== headAfter) {
    console.log(color.childExec('npx', ['yarn'], execOpts));
    cp.execSync('npx yarn', execOpts);
    console.log('Updated to Latest Build Tools');
  } else {
    console.log('Already Up To Date');
  }
} catch (e) {
  fatal(e);
}
