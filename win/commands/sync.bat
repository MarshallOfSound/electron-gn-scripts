@echo off

call "%~dp0"\..\..\generated.env.bat
if %errorlevel%=="1" goto :no-config

echo Running "gclient sync" in "%ELECTRON_GN_ROOT%\src"

cd "%ELECTRON_GN_ROOT%\src" || exit /B 1

call gclient sync --with_branch_heads --with_tags %*
if %errorlevel%=="1" goto :fail

echo Updating git remotes

cd electron
call git remote set-url origin %ELECTRON_GIT_ORIGIN%
if %errorlevel%=="1" goto :fail

call git remote set-url origin --push %ELECTRON_GIT_ORIGIN%
if %errorlevel%=="1" goto :fail

cd ..\third_party\electron_node
call git remote set-url origin %NODE_GIT_ORIGIN%
if %errorlevel%=="1" goto :fail

call git remote set-url origin --push %NODE_GIT_ORIGIN%
if %errorlevel%=="1" goto :fail

exit /B 0

:no-config
echo You configuration has not been generated, please run "generate-config"
exit /B 1

:fail
exit /B 1
