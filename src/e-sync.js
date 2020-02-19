#!/usr/bin/env node

const childProcess = require('child_process');
const path = require('path');
const program = require('commander');

const evmConfig = require('./evm-config');
const { fatal } = require('./utils/logging');
const { ensureDir } = require('./utils/paths');
const depot = require('./utils/depot-tools');

function setOrigin(cwd, url) {
  const cmd = 'git';
  let args = ['remote', 'set-url', 'origin', url];
  const opts = { cwd };
  childProcess.execFileSync(cmd, args, opts);

  args.splice(-1, 0, '--push');
  childProcess.execFileSync(cmd, args, opts);
}

function runGClientSync(config, syncArgs) {
  const srcdir = path.resolve(config.root, 'src');
  ensureDir(srcdir);

  if (config.env.GIT_CACHE_PATH) {
    ensureDir(config.env.GIT_CACHE_PATH);
  }

  depot.ensure();

  const exec = 'python';
  const args = ['gclient.py', 'sync', '--with_branch_heads', '--with_tags', ...syncArgs];
  const opts = {
    cwd: srcdir,
    env: {
      DEPOT_TOOLS_WIN_TOOLCHAIN: '1',
      DEPOT_TOOLS_WIN_TOOLCHAIN_BASE_URL:
        'https://electron-build-tools.s3-us-west-2.amazonaws.com/win32/toolchains/_',
      GYP_MSVS_HASH_9ff60e43ba91947baca460d0ca3b1b980c3a2c23:
        '6d205e765a23d3cbe0fcc8d1191ae406d8bf9c04',
    },
  };
  depot.execFileSync(config, exec, args, opts);
  setOrigin(path.resolve(srcdir, 'electron'), config.origin.electron);
  setOrigin(path.resolve(srcdir, 'third_party', 'electron_node'), config.origin.node);
}

program
  .arguments('[gclientArgs...]')
  .allowUnknownOption()
  .description('Fetch source / synchronize repository checkouts')
  .parse(process.argv);

try {
  const syncArgs = program.parseOptions(process.argv).unknown;
  runGClientSync(evmConfig.current(), syncArgs);
} catch (e) {
  fatal(e);
}
