$pnpmPath = "C:\Users\hman\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if (Test-Path $pnpmPath) {
  & $pnpmPath install
  & $pnpmPath run build
} else {
  npm install
  npm run build
}
