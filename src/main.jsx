import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = "";
const PAGE_SIZE = 18;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function ZoomableCropImage({ src, alt = "" }) {
  const frameRef = useRef(null);
  const [imageZoom, setImageZoom] = useState(1);

  function handleImageWheel(event) {
    event.preventDefault();
    const frame = frameRef.current;
    const rect = frame.getBoundingClientRect();
    const offsetX = event.clientX - rect.left + frame.scrollLeft;
    const offsetY = event.clientY - rect.top + frame.scrollTop;
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = clamp(Math.round((imageZoom + direction * ZOOM_STEP) * 100) / 100, MIN_ZOOM, MAX_ZOOM);
    const ratio = nextZoom / imageZoom;
    setImageZoom(nextZoom);
    requestAnimationFrame(() => {
      frame.scrollLeft = offsetX * ratio - (event.clientX - rect.left);
      frame.scrollTop = offsetY * ratio - (event.clientY - rect.top);
    });
  }

  return (
    <div ref={frameRef} className="zoomableCrop" onWheel={handleImageWheel} title="Scroll to zoom">
      <img loading="lazy" src={src} alt={alt} style={{ width: `${imageZoom * 100}%`, height: `${imageZoom * 100}%` }} />
    </div>
  );
}

function ManifestViewer() {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function loadRecords(nextPage = page) {
    const safePage = clamp(Number(nextPage) || 1, 1, totalPages);
    const res = await fetch(`${API}/api/crops?page=${safePage}&limit=${PAGE_SIZE}`);
    const data = await res.json();
    setRecords(data.items);
    setTotal(data.total);
    setPage(data.page);
    setPageInput(String(data.page));
  }

  useEffect(() => {
    loadRecords(1).catch(() => setStatus("Could not load manifest records."));
  }, []);

  async function saveText(record, text) {
    const res = await fetch(`${API}/api/crops/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setStatus(res.ok ? "Saved text." : "Could not save text.");
    if (res.ok) loadRecords(page);
  }

  function jumpToPage(event) {
    event.preventDefault();
    loadRecords(pageInput);
  }

  function updateLocalText(recordId, text) {
    setRecords((current) => current.map((record) => (record.id === recordId ? { ...record, text } : record)));
  }

  async function deleteRecord(record) {
    const res = await fetch(`${API}/api/crops/${record.id}`, { method: "DELETE" });
    setStatus(res.ok ? "Deleted record." : "Could not delete record.");
    if (res.ok) loadRecords(Math.min(page, Math.max(1, Math.ceil((total - 1) / PAGE_SIZE))));
  }

  return (
    <main className="manifestPage">
      <header className="manifestHeader">
        <div>
          <h1>Manifest Viewer</h1>
          <p>{total} saved crop records in manifest.csv</p>
        </div>
        <Pagination page={page} totalPages={totalPages} pageInput={pageInput} setPageInput={setPageInput} jumpToPage={jumpToPage} loadRecords={loadRecords} />
      </header>
      <section className="manifestGrid">
        {records.map((record) => (
          <article key={record.id} className="recordCard">
            <ZoomableCropImage src={`${API}${record.image_url}`} alt={record.id} />
            <div className="recordId">{record.id}.png</div>
            <textarea value={record.text} onChange={(event) => updateLocalText(record.id, event.target.value)} />
            <div className="cardActions">
              <button className="iconButton saveIcon" title="Save text" aria-label="Save text" onClick={() => saveText(record, record.text)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5V3Zm3 0v6h8V3H8Zm9 16v-7H7v7h10Z" /></svg>
              </button>
              <button className="iconButton dangerIcon" title="Delete record" aria-label="Delete record" onClick={() => deleteRecord(record)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 12H7.7L7 9Zm3 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" /></svg>
              </button>
            </div>
          </article>
        ))}
      </section>
      <div className="manifestFooter">
        <span>{status}</span>
        <Pagination page={page} totalPages={totalPages} pageInput={pageInput} setPageInput={setPageInput} jumpToPage={jumpToPage} loadRecords={loadRecords} compact />
      </div>
    </main>
  );
}

function Pagination({ page, totalPages, pageInput, setPageInput, jumpToPage, loadRecords, compact = false }) {
  return (
    <form className="pager" onSubmit={jumpToPage}>
      <button className="iconButton" type="button" title="Previous page" aria-label="Previous page" onClick={() => loadRecords(page - 1)} disabled={page <= 1}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15.5 5-7 7 7 7 1.4-1.4L11.3 12l5.6-5.6L15.5 5Z" /></svg>
      </button>
      {!compact && <span>Page</span>}
      <input value={pageInput} onChange={(event) => setPageInput(event.target.value)} inputMode="numeric" aria-label="Page number" />
      <span>/ {totalPages}</span>
      <button className="iconButton" type="submit" title="Go to page" aria-label="Go to page">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h11.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H5v-2Z" /></svg>
      </button>
      <button className="iconButton" type="button" title="Next page" aria-label="Next page" onClick={() => loadRecords(page + 1)} disabled={page >= totalPages}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 19 7-7-7-7-1.4 1.4 5.6 5.6-5.6 5.6L8.5 19Z" /></svg>
      </button>
    </form>
  );
}

function Collector() {
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const cropLayerRef = useRef(null);
  const stageRef = useRef(null);
  const [images, setImages] = useState([]);
  const [activeImage, setActiveImage] = useState(null);
  const [recentCrops, setRecentCrops] = useState([]);
  const [box, setBox] = useState(null);
  const [layerSize, setLayerSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");

  async function refresh() {
    const [imageRes, cropRes] = await Promise.all([fetch(`${API}/api/images`), fetch(`${API}/api/crops?page=1&limit=3`)]);
    setImages(await imageRes.json());
    const cropData = await cropRes.json();
    setRecentCrops(cropData.items);
  }

  useEffect(() => {
    refresh().catch(() => setStatus("Start the FastAPI server, then refresh."));
  }, []);

  useEffect(() => {
    drawCanvas();
  }, [activeImage, box, layerSize]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    const syncLayerSize = () => {
      setLayerSize({ width: image.clientWidth, height: image.clientHeight });
    };
    syncLayerSize();

    const observer = new ResizeObserver(syncLayerSize);
    observer.observe(image);
    window.addEventListener("resize", syncLayerSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncLayerSize);
    };
  }, [activeImage]);

  function imageScale() {
    if (!activeImage || !layerSize.width || !layerSize.height) return { sx: 1, sy: 1 };
    return { sx: activeImage.width / layerSize.width, sy: activeImage.height / layerSize.height };
  }

  function point(event) {
    const layer = cropLayerRef.current;
    const rect = layer.getBoundingClientRect();
    const { sx, sy } = imageScale();
    return {
      x: clamp((event.clientX - rect.left) * sx, 0, activeImage.width),
      y: clamp((event.clientY - rect.top) * sy, 0, activeImage.height),
    };
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas || !activeImage || !layerSize.width || !layerSize.height) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(layerSize.width * pixelRatio);
    canvas.height = Math.round(layerSize.height * pixelRatio);
    canvas.style.width = `${layerSize.width}px`;
    canvas.style.height = `${layerSize.height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (box) {
      const sx = layerSize.width / activeImage.width;
      const sy = layerSize.height / activeImage.height;
      ctx.fillStyle = "rgba(37, 99, 235, .16)";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.fillRect(box.x * sx, box.y * sy, box.width * sx, box.height * sy);
      ctx.strokeRect(box.x * sx, box.y * sy, box.width * sx, box.height * sy);
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/api/images`, { method: "POST", body: form });
    const image = await res.json();
    setActiveImage(image);
    setBox(null);
    setZoom(1);
    setText("");
    await refresh();
  }

  function startCrop(event) {
    if (!activeImage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = point(event);
    setDrag({ start });
    setBox(null);
  }

  function moveCrop(event) {
    if (!drag || !activeImage) return;
    event.preventDefault();
    const now = point(event);
    setBox({
      x: Math.min(drag.start.x, now.x),
      y: Math.min(drag.start.y, now.y),
      width: Math.abs(now.x - drag.start.x),
      height: Math.abs(now.y - drag.start.y),
    });
  }

  function finishCrop() {
    setBox((current) => {
      if (!current || current.width < 3 || current.height < 3) return null;
      return current;
    });
    setDrag(null);
  }

  function smartLineCrop() {
    if (!activeImage) return;
    const y = box ? box.y + box.height + 6 : 0;
    const height = Math.max(24, Math.round(activeImage.height / 13));
    setBox({ x: 0, y: clamp(y, 0, activeImage.height - height), width: activeImage.width, height });
  }

  function changeZoom(nextZoom) {
    setZoom(clamp(Math.round(nextZoom * 100) / 100, MIN_ZOOM, MAX_ZOOM));
  }

  function handleWheelZoom(event) {
    if (!activeImage) return;
    event.preventDefault();
    const stage = stageRef.current;
    const rect = stage.getBoundingClientRect();
    const offsetX = event.clientX - rect.left + stage.scrollLeft;
    const offsetY = event.clientY - rect.top + stage.scrollTop;
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = clamp(Math.round((zoom + direction * ZOOM_STEP) * 100) / 100, MIN_ZOOM, MAX_ZOOM);
    const ratio = nextZoom / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      stage.scrollLeft = offsetX * ratio - (event.clientX - rect.left);
      stage.scrollTop = offsetY * ratio - (event.clientY - rect.top);
    });
  }

  async function saveCrop() {
    if (!activeImage || !box || box.width < 2 || box.height < 2) return;
    const res = await fetch(`${API}/api/crops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_image_id: activeImage.id, box, text }),
    });
    if (!res.ok) {
      setStatus("Crop could not be saved.");
      return;
    }
    setText("");
    setStatus("Saved crop and text.");
    await refresh();
  }

  function updateRecentText(cropId, nextText) {
    setRecentCrops((current) => current.map((crop) => (crop.id === cropId ? { ...crop, text: nextText } : crop)));
  }

  async function saveRecentText(crop) {
    const res = await fetch(`${API}/api/crops/${crop.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: crop.text }),
    });
    setStatus(res.ok ? "Saved recent crop text." : "Could not save recent crop text.");
    if (res.ok) refresh();
  }

  async function deleteRecentCrop(crop) {
    const res = await fetch(`${API}/api/crops/${crop.id}`, { method: "DELETE" });
    setStatus(res.ok ? "Deleted recent crop." : "Could not delete recent crop.");
    if (res.ok) refresh();
  }

  async function deleteSourceImage(image) {
    const res = await fetch(`${API}/api/images/${image.id}`, { method: "DELETE" });
    if (res.ok) {
      if (activeImage?.id === image.id) {
        setActiveImage(null);
        setBox(null);
        setZoom(1);
      }
      setStatus("Deleted source image.");
      refresh();
    } else {
      setStatus("Could not delete source image.");
    }
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">OCR Data Collector</div>
        <label className="upload">
          <span className="iconGlyph" aria-hidden="true">+</span>
          <span>Load image</span>
          <input type="file" accept="image/*" onChange={upload} />
        </label>
        <button className="tool" onClick={smartLineCrop} disabled={!activeImage}>
          <span className="iconGlyph" aria-hidden="true">□</span> Smart line crop
        </button>
        <a className="tool" href="/manifest" target="_blank" rel="noreferrer">
          <span className="iconGlyph" aria-hidden="true">≡</span> Open manifest
        </a>
        <div className="imageList">
          {images.slice(0, 3).map((image) => (
            <div key={image.id} className={activeImage?.id === image.id ? "sourceItem active" : "sourceItem"}>
              <button onClick={() => { setActiveImage(image); setBox(null); setZoom(1); }}>
                {image.filename.replace(`${image.id}_`, "")}
              </button>
              <button className="iconButton dangerIcon" title="Delete source image" aria-label="Delete source image" onClick={() => deleteSourceImage(image)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 12H7.7L7 9Zm3 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" /></svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="workspace">
        <div className="zoomBar">
          <textarea className="topTextInput" value={text} onChange={(event) => setText(event.target.value)} placeholder="Text for selected crop" />
          <button className="save topSave" onClick={saveCrop} disabled={!box || !activeImage}>
            <span className="iconGlyph" aria-hidden="true">✓</span> Save
          </button>
          <button className="iconButton" title="Zoom out" aria-label="Zoom out" onClick={() => changeZoom(zoom - ZOOM_STEP)} disabled={!activeImage}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11h14v2H5v-2Z" /></svg>
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="iconButton" title="Zoom in" aria-label="Zoom in" onClick={() => changeZoom(zoom + ZOOM_STEP)} disabled={!activeImage}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" /></svg>
          </button>
          <button className="resetZoom" onClick={() => changeZoom(1)} disabled={!activeImage}>Reset</button>
        </div>
        <div className="stage" ref={stageRef} onWheel={handleWheelZoom}>
          {activeImage ? (
            <div className="imageWrap" style={{ "--crop-layer-width": `${layerSize.width}px`, "--crop-layer-height": `${layerSize.height}px` }}>
              <img
                ref={imageRef}
                src={`${API}${activeImage.url}`}
                style={{ width: `${activeImage.width * zoom}px` }}
                onLoad={() => setLayerSize({ width: imageRef.current.clientWidth, height: imageRef.current.clientHeight })}
              />
              <div
                ref={cropLayerRef}
                className="cropLayer"
                onPointerDown={startCrop}
                onPointerMove={moveCrop}
                onPointerUp={finishCrop}
                onPointerCancel={finishCrop}
              >
                <canvas ref={canvasRef} />
              </div>
            </div>
          ) : (
            <div className="empty">Load a scanned page or text image to begin cropping.</div>
          )}
        </div>
        <div className="panel">
          <span className="status">{status}</span>
        </div>
      </section>
      <aside className="manifest">
        <h2>Recent Crops</h2>
        <div className="recentList">
          {recentCrops.map((crop) => (
            <article key={crop.id} className="recentItem">
              <ZoomableCropImage src={`${API}${crop.image_url}`} alt={crop.id} />
              <div className="recentBody">
                <div className="recentEditRow">
                  <textarea value={crop.text} onChange={(event) => updateRecentText(crop.id, event.target.value)} placeholder="Text" />
                  <div className="cardActions verticalActions">
                    <button className="iconButton saveIcon" title="Save text" aria-label="Save text" onClick={() => saveRecentText(crop)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5V3Zm3 0v6h8V3H8Zm9 16v-7H7v7h10Z" /></svg>
                    </button>
                    <button className="iconButton dangerIcon" title="Delete crop" aria-label="Delete crop" onClick={() => deleteRecentCrop(crop)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 12H7.7L7 9Zm3 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" /></svg>
                    </button>
                  </div>
                </div>
                <div className="meta">{crop.id.slice(0, 10)}.png</div>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </main>
  );
}

function App() {
  return window.location.pathname === "/manifest" ? <ManifestViewer /> : <Collector />;
}

createRoot(document.getElementById("root")).render(<App />);
