import { useEffect, useRef, useState } from 'react';
import { Suspense } from 'react';
import Dart from './Dart.jsx';
import { defaultCoverCrop, flightPathForRect, resolveEditorCrop, FLIGHT_SHAPE_POINTS } from '../lib/flightCrop.js';
import './FlightEditor.css';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

function useImageAspect(url) {
  const [aspect, setAspect] = useState(null);
  useEffect(() => {
    if (!url) { setAspect(null); return; }
    let active = true;
    const img = new Image();
    img.onload = () => { if (active) setAspect(img.naturalWidth / img.naturalHeight); };
    img.src = url;
    return () => { active = false; };
  }, [url]);
  return aspect;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSvgTemplate() {
  const margin = 0.05;
  const d = flightPathForRect(margin, margin, 1 - margin * 2, 1 - margin * 2, 1000);
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
    `<path d="${d}" fill="black" stroke="white" stroke-width="4"/>`,
    '</svg>',
  ].join('');
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'flight_template.svg');
}

function downloadPngTemplate() {
  const size = 1024;
  const margin = size * 0.05;
  const area = size - margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = size * 0.006;
  ctx.beginPath();
  FLIGHT_SHAPE_POINTS.forEach(([px, py], i) => {
    const x = margin + px * area;
    const y = margin + py * area;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  canvas.toBlob(blob => downloadBlob(blob, 'flight_template_1024.png'), 'image/png');
}

function Dropzone({ onFile, uploading, error, hasImage }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function pick(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0] ?? e.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={`flighteditor__drop${dragOver ? ' flighteditor__drop--over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={pick}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        hidden
        onChange={pick}
      />
      {uploading ? (
        <span className="flighteditor__spinner" />
      ) : (
        <p className="flighteditor__drop-text">
          {hasImage ? 'Changer la photo' : 'Glisse une photo ici, ou clique pour choisir'}
          <span className="flighteditor__drop-hint">PNG, JPG ou WEBP — 5 Mo max</span>
        </p>
      )}
      {error && <p className="flighteditor__error">{error}</p>}
    </div>
  );
}

// One crop zone: the source photo with a draggable/zoomable kite-shaped
// window overlaid on it. Internally tracked as {x, y, scale} — w/h are
// derived (see resolveEditorCrop) so zooming can never distort the photo
// on the actual 3D flight regardless of the source image's own aspect ratio.
function CropZone({ label, imageUrl, imgAspect, crop, onChange, onReset }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  if (!crop || !imgAspect) return null;

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: crop.x, origY: crop.y };
  }

  function handlePointerMove(e) {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.startX) / rect.width;
    const dy = (e.clientY - dragRef.current.startY) / rect.height;
    onChange(resolveEditorCrop(
      { x: dragRef.current.origX + dx, y: dragRef.current.origY + dy, scale: crop.scale },
      imgAspect
    ));
  }

  function handlePointerUp(e) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function handleWheel(e) {
    e.preventDefault();
    const next = crop.scale + (e.deltaY < 0 ? 0.1 : -0.1);
    onChange(resolveEditorCrop({ x: crop.x, y: crop.y, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)) }, imgAspect));
  }

  function handleZoomSlider(e) {
    onChange(resolveEditorCrop({ x: crop.x, y: crop.y, scale: Number(e.target.value) }, imgAspect));
  }

  const maskId = `flighteditor-mask-${label.replace(/\s+/g, '-')}`;
  const kitePath = flightPathForRect(crop.x, crop.y, crop.w, crop.h, 100);

  return (
    <div className="flighteditor__zone">
      <div className="flighteditor__zone-head">
        <span className="flighteditor__zone-label">{label}</span>
        <button type="button" className="flighteditor__reset" onClick={onReset}>Réinitialiser</button>
      </div>

      <div
        ref={containerRef}
        className="flighteditor__canvas"
        style={{ aspectRatio: imgAspect, backgroundImage: `url(${imageUrl})` }}
        onWheel={handleWheel}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="flighteditor__overlay">
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="100" height="100" fill="white" />
              <path d={kitePath} fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="black" opacity="0.55" mask={`url(#${maskId})`} />
          <path d={kitePath} fill="none" stroke="#fff" strokeWidth="0.6" />
          <rect
            x={crop.x * 100}
            y={crop.y * 100}
            width={crop.w * 100}
            height={crop.h * 100}
            fill="transparent"
            className="flighteditor__handle"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </svg>
      </div>

      <input
        className="flighteditor__zoom"
        type="range"
        min={MIN_SCALE}
        max={MAX_SCALE}
        step={0.01}
        value={crop.scale}
        onChange={handleZoomSlider}
        aria-label={`Zoom — ${label}`}
      />
    </div>
  );
}

export default function FlightEditor({
  currentImageUrl,
  currentCropA,
  currentCropB,
  currentMode = 'symmetric',
  onUpload,
  onSave,
}) {
  const [imageUrl, setImageUrl] = useState(currentImageUrl ?? null);
  const [mode, setMode] = useState(currentMode);
  const [cropA, setCropA] = useState(currentCropA ?? null);
  const [cropB, setCropB] = useState(currentCropB ?? null);
  const imgAspect = useImageAspect(imageUrl);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Fill in a default (cover-fit) crop once we know the image's aspect
  // ratio — covers both a fresh upload and a previously-saved crop that's
  // somehow missing (e.g. switching into "paired" mode for the first time).
  useEffect(() => {
    if (!imgAspect) return;
    setCropA(c => c ?? defaultCoverCrop(imgAspect));
    setCropB(c => c ?? defaultCoverCrop(imgAspect));
  }, [imgAspect]);

  async function handleFile(file) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Format non supporté — PNG, JPG ou WEBP uniquement.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError('Image trop lourde (5 Mo max).');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setSaved(false);
    try {
      const updated = await onUpload(file);
      setImageUrl(updated.flight_image_url);
      // New photo — any previously-saved crop no longer makes sense.
      setCropA(null);
      setCropB(null);
    } catch {
      setUploadError("Échec de l'envoi de l'image.");
    }
    setUploading(false);
  }

  function resetCrop(which) {
    if (!imgAspect) return;
    const next = defaultCoverCrop(imgAspect);
    if (which === 'a') setCropA(next);
    else setCropB(next);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ flightCropA: cropA, flightCropB: cropB, flightMode: mode });
      setSaved(true);
    } catch {
      setSaveError("Échec de l'enregistrement.");
    }
    setSaving(false);
  }

  return (
    <div className="flighteditor">
      <Dropzone onFile={handleFile} uploading={uploading} error={uploadError} hasImage={!!imageUrl} />

      {imageUrl && (
        <>
          <div className="flighteditor__mode">
            <button
              type="button"
              className={mode === 'symmetric' ? 'on' : ''}
              onClick={() => setMode('symmetric')}
            >
              Symétrique
            </button>
            <button
              type="button"
              className={mode === 'paired' ? 'on' : ''}
              onClick={() => setMode('paired')}
            >
              Apparié
            </button>
          </div>

          <div className="flighteditor__zones">
            <CropZone
              label={mode === 'paired' ? 'Ailette A (0, 2)' : 'Toutes les ailettes'}
              imageUrl={imageUrl}
              imgAspect={imgAspect}
              crop={cropA}
              onChange={setCropA}
              onReset={() => resetCrop('a')}
            />
            {mode === 'paired' && (
              <CropZone
                label="Ailette B (1, 3)"
                imageUrl={imageUrl}
                imgAspect={imgAspect}
                crop={cropB}
                onChange={setCropB}
                onReset={() => resetCrop('b')}
              />
            )}
          </div>

          <div className="flighteditor__preview">
            <p className="eyebrow">Aperçu</p>
            <div className="flighteditor__preview-canvas">
              <Suspense fallback={null}>
                <Dart flightImageUrl={imageUrl} flightCropA={cropA} flightCropB={cropB} flightMode={mode} />
              </Suspense>
            </div>
          </div>

          <div className="flighteditor__templates">
            <button type="button" onClick={downloadSvgTemplate}>Modèle SVG</button>
            <button type="button" onClick={downloadPngTemplate}>Modèle PNG</button>
          </div>

          {saveError && <p className="flighteditor__error">{saveError}</p>}
          <button type="button" className="flighteditor__save" onClick={handleSave} disabled={saving}>
            {saving ? '…' : saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
        </>
      )}
    </div>
  );
}
