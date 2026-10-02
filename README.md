# OCR Data Collector

A local FastAPI + React/Vite app for collecting OCR training data from scanned pages or screenshots.

## What It Saves

- Cropped image snippets: `data/images/`
- Text labels: `data/manifest.csv`

The CSV manifest has only two columns:

```csv
id,text
```

Each image file is saved as `data/images/<id>.png`. Uploaded full-page source images used for cropping are kept internally in `data/source_pages/`.

Multiline labels are supported. In `manifest.csv`, line breaks are stored inside the `text` column as visible `\n` markers, so each image stays on one CSV row.

## Run

Install the backend:

```powershell
python -m pip install -r backend/requirements.txt
```

Install and build the frontend when you first set up the app or after editing the React UI:

```powershell
npm install
npm run build
```

Start the single app server:

```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

Open `http://127.0.0.1:8765`.

Click `Open manifest` to open the paginated manifest viewer in a new tab. You can edit label text there; changes are saved back to `data/manifest.csv`.

Do not add `--reload` unless you need live backend reloading. If you see `Will watch for changes`, reload mode is on.

If Windows blocks a port with `WinError 10013`, use another local port:

```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8787
```

If you see `WinError 10048`, that port is already being used. Stop the running server with `Ctrl+C`, or choose another port:

```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8788
```
