from __future__ import annotations

import csv
import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("OCR_DATA_DIR", BASE_DIR / "data"))
SOURCE_DIR = DATA_DIR / "source_pages"
IMAGES_DIR = DATA_DIR / "images"
MANIFEST_PATH = DATA_DIR / "manifest.csv"
OLD_CROPS_DIR = DATA_DIR / "crops"
OLD_MANIFEST_PATH = DATA_DIR / "manifest.jsonl"
FRONTEND_DIST_DIR = BASE_DIR / "dist"

for directory in (DATA_DIR, SOURCE_DIR, IMAGES_DIR):
    directory.mkdir(parents=True, exist_ok=True)


app = FastAPI(title="OCR Data Collector")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CropBox(BaseModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class CropCreate(BaseModel):
    source_image_id: str
    text: str = ""
    box: CropBox


class CropUpdate(BaseModel):
    text: str


def safe_name(name: str) -> str:
    stem = Path(name).stem[:80] or "image"
    suffix = Path(name).suffix.lower() or ".png"
    return "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in stem) + suffix


def ensure_manifest() -> None:
    if not MANIFEST_PATH.exists():
        with MANIFEST_PATH.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["id", "text"])
            writer.writeheader()


def encode_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n")


def decode_text(text: str) -> str:
    return text.replace("\\n", "\n")


def write_manifest(records: list[dict[str, str]]) -> None:
    with MANIFEST_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "text"])
        writer.writeheader()
        writer.writerows({"id": record["id"], "text": encode_text(record.get("text", ""))} for record in records)


def migrate_old_manifest() -> None:
    if MANIFEST_PATH.exists() or not OLD_MANIFEST_PATH.exists():
        ensure_manifest()
        return

    records: list[dict[str, str]] = []
    with OLD_MANIFEST_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            old_record = json.loads(line)
            crop_id = old_record.get("id")
            if not crop_id:
                continue
            old_image = OLD_CROPS_DIR / f"{crop_id}.png"
            new_image = IMAGES_DIR / f"{crop_id}.png"
            if old_image.exists() and not new_image.exists():
                shutil.copyfile(old_image, new_image)
            records.append({"id": crop_id, "text": old_record.get("text", "")})
    write_manifest(records)


def read_manifest() -> list[dict[str, str]]:
    ensure_manifest()
    with MANIFEST_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return [{"id": row.get("id", ""), "text": decode_text(row.get("text", ""))} for row in reader if row.get("id")]


def crop_record(record: dict[str, str]) -> dict[str, str]:
    return {"id": record["id"], "text": record.get("text", ""), "image_url": f"/api/crops/{record['id']}/image"}


def find_source(image_id: str) -> Path:
    matches = list(SOURCE_DIR.glob(f"{image_id}_*"))
    if not matches:
        raise HTTPException(status_code=404, detail="Source image not found")
    return matches[0]


@app.on_event("startup")
def startup() -> None:
    migrate_old_manifest()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/images")
async def upload_image(file: UploadFile = File(...)) -> dict[str, Any]:
    image_id = uuid.uuid4().hex
    filename = f"{image_id}_{safe_name(file.filename or 'image.png')}"
    output_path = SOURCE_DIR / filename

    with output_path.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)

    try:
        with Image.open(output_path) as image:
            width, height = image.size
    except Exception as exc:
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image") from exc

    return {"id": image_id, "filename": filename, "url": f"/api/images/{image_id}", "width": width, "height": height}


@app.get("/api/images")
def list_images() -> list[dict[str, Any]]:
    images = []
    for path in sorted(SOURCE_DIR.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True):
        if not path.is_file():
            continue
        image_id = path.name.split("_", 1)[0]
        try:
            with Image.open(path) as image:
                width, height = image.size
        except Exception:
            continue
        images.append({"id": image_id, "filename": path.name, "url": f"/api/images/{image_id}", "width": width, "height": height})
    return images


@app.get("/api/images/{image_id}")
def get_image(image_id: str) -> FileResponse:
    return FileResponse(find_source(image_id))


@app.delete("/api/images/{image_id}")
def delete_image(image_id: str) -> dict[str, str]:
    source_path = find_source(image_id)
    source_path.unlink(missing_ok=True)
    return {"status": "deleted"}


@app.get("/api/crops")
def list_crops(page: int = Query(1, ge=1), limit: int = Query(24, ge=1, le=200)) -> dict[str, Any]:
    records = [crop_record(record) for record in reversed(read_manifest())]
    start = (page - 1) * limit
    end = start + limit
    return {"items": records[start:end], "total": len(records), "page": page, "limit": limit}


@app.post("/api/crops")
def create_crop(payload: CropCreate) -> dict[str, str]:
    source_path = find_source(payload.source_image_id)
    records = read_manifest()
    crop_id = uuid.uuid4().hex
    crop_path = IMAGES_DIR / f"{crop_id}.png"

    with Image.open(source_path) as image:
        left = max(0, int(round(payload.box.x)))
        top = max(0, int(round(payload.box.y)))
        right = min(image.width, int(round(payload.box.x + payload.box.width)))
        bottom = min(image.height, int(round(payload.box.y + payload.box.height)))
        if right <= left or bottom <= top:
            raise HTTPException(status_code=400, detail="Crop box is outside the image")
        image.crop((left, top, right, bottom)).save(crop_path)

    record = {"id": crop_id, "text": payload.text}
    records.append(record)
    write_manifest(records)
    return crop_record(record)


@app.patch("/api/crops/{crop_id}")
def update_crop(crop_id: str, payload: CropUpdate) -> dict[str, str]:
    records = read_manifest()
    for record in records:
        if record["id"] == crop_id:
            record["text"] = payload.text
            write_manifest(records)
            return crop_record(record)
    raise HTTPException(status_code=404, detail="Crop not found")


@app.delete("/api/crops/{crop_id}")
def delete_crop(crop_id: str) -> dict[str, str]:
    records = read_manifest()
    remaining = [record for record in records if record["id"] != crop_id]
    if len(remaining) == len(records):
        raise HTTPException(status_code=404, detail="Crop not found")
    (IMAGES_DIR / f"{crop_id}.png").unlink(missing_ok=True)
    write_manifest(remaining)
    return {"status": "deleted"}


@app.get("/api/crops/{crop_id}/image")
def get_crop_image(crop_id: str) -> FileResponse:
    path = IMAGES_DIR / f"{crop_id}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Crop image not found")
    return FileResponse(path)


@app.get("/api/manifest")
def get_manifest() -> dict[str, str]:
    ensure_manifest()
    return {"path": str(MANIFEST_PATH), "format": "csv", "columns": "id,text"}


if FRONTEND_DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="assets")


@app.get("/{path:path}")
def serve_frontend(path: str) -> FileResponse:
    if not FRONTEND_DIST_DIR.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found. Run pnpm run build first.")

    requested_path = FRONTEND_DIST_DIR / path
    if path and requested_path.is_file():
        return FileResponse(requested_path)

    return FileResponse(FRONTEND_DIST_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8765, reload=False)
