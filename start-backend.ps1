$pythonPath = "C:\Users\hman\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (Test-Path $pythonPath) {
  & $pythonPath -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
} else {
  py -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
}
