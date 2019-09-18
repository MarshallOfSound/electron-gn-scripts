#!/usr/bin/env bash

# constants

declare -r COLOR_CMD='\033[0;33m' # yellow
declare -r COLOR_DIR='\033[0;36m' # cyan -- same as chalk use in common/
declare -r COLOR_ERR='\033[0;31m' # red
declare -r COLOR_OFF='\033[0m' # no-color
declare -r COLOR_OK='\033[0;32m' # green
declare -r COLOR_WARN='\033[1;31m' # light red

declare __basedir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
declare -r ELECTRON_GN_SCRIPTS_ROOT="$(git -C "${__basedir}" rev-parse --show-toplevel)"
declare -r DEPOT_TOOLS_PATH="${ELECTRON_GN_SCRIPTS_ROOT}/third_party/depot_tools"
unset __basedir

# functions

ensure_depot_tools() {
  # if it's missing, install it
  if [[ ! -d "$DEPOT_TOOLS_PATH" ]]; then
    echo -e "\n\nCloning ${COLOR_CMD}depot_tools${COLOR_OFF} into '${COLOR_DIR}$DEPOT_TOOLS_PATH${COLOR_OFF}'"
    git clone -q 'https://chromium.googlesource.com/chromium/tools/depot_tools.git' "$DEPOT_TOOLS_PATH"
    if [[ $? -ne 0 ]]; then
      exit $?
    fi
  fi

  # if it's been awhile, update it
  local -r mtime_age_days="$(perl -e 'print int -M $ARGV[0]' "$DEPOT_TOOLS_PATH")"
  local -r update_interval_days=14
  if (( $mtime_age_days > $update_interval_days )); then
    echo -e "\n\nUpdating ${COLOR_CMD}depot_tools${COLOR_OFF} into '${COLOR_DIR}$DEPOT_TOOLS_PATH${COLOR_OFF}'"
    git -C "${DEPOT_TOOLS_PATH}" pull origin master
    touch "${DEPOT_TOOLS_PATH}"
  fi
}

ensure_node_modules() {
  # if it's missing, install it
  if [[ ! -d "${ELECTRON_GN_SCRIPTS_ROOT}/node_modules" ]]; then
    echo -e "\n\nRunning '${COLOR_CMD}yarn install${COLOR_OFF}' in '${COLOR_DIR}${ELECTRON_GN_SCRIPTS_ROOT}${COLOR_OFF}'"
    npx yarn --cwd "${ELECTRON_GN_SCRIPTS_ROOT}" install --frozen-lockfile
    if [[ $? -ne 0 ]]; then
      exit $?
    fi
  fi
}
