// The flight shape's bounding box, from Dart.jsx's vane outline:
//   moveTo(0, 0) -> lineTo(0.5, 0.3) -> lineTo(0.5, 0.62)
//   -> lineTo(0.1, 0.8) -> lineTo(0, 0.8) -> close
// x spans 0..0.5, y spans 0..0.8. ShapeGeometry auto-generates UVs by
// normalizing against this box, so any crop must target this aspect ratio
// to avoid stretching. Shared by Dart.jsx (rendering) and FlightEditor.jsx
// (the crop UI), so the two can never silently drift apart.
export const FLIGHT_BOX_ASPECT = 0.5 / 0.8;

// Used whenever a player has an uploaded flight image but no saved crop yet
// (or hits "Reset" in the editor) — covers the flight's bounding box like
// CSS background-size: cover, centered, with no distortion.
export function defaultCoverCrop(imgAspect) {
  if (imgAspect > FLIGHT_BOX_ASPECT) {
    const w = FLIGHT_BOX_ASPECT / imgAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1, scale: 1 };
  }
  const h = imgAspect / FLIGHT_BOX_ASPECT;
  return { x: 0, y: (1 - h) / 2, w: 1, h, scale: 1 };
}

// The flight shape's outline, normalized to a 0..1 x 0..1 box in screen/SVG
// convention (y=0 at top, y=1 at bottom — the flight's outer tip is at the
// top). This is Dart.jsx's shape points with x divided by 0.5, y divided by
// 0.8 and flipped (1 - y), since the shape's own local space has y=0 at the
// dart's shaft end and y=0.8 at the flight's outer tip.
export const FLIGHT_SHAPE_POINTS = [
  [0, 1],
  [1, 0.625],
  [1, 0.225],
  [0.2, 0],
  [0, 0],
];

// SVG path `d` string for the flight outline, positioned at (x, y) with
// size (w, h) — all normalized — inside a `size`x`size` viewBox. Used by
// both the crop editor's overlay (one rect per crop zone) and the
// downloadable templates (one rect covering most of the canvas).
export function flightPathForRect(x, y, w, h, size = 1) {
  return FLIGHT_SHAPE_POINTS
    .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${((x + px * w) * size).toFixed(3)},${((y + py * h) * size).toFixed(3)}`)
    .join(' ') + ' Z';
}

// Crop state (x, y, scale) -> the final {x, y, w, h, scale} saved/rendered.
// w0/h0 (the scale=1 / fully-zoomed-out case) come from defaultCoverCrop,
// which already encodes the aspect ratio needed to avoid distorting the
// image on the flight — scaling both by the same factor preserves that.
export function resolveEditorCrop({ x, y, scale }, imgAspect) {
  const { w: w0, h: h0 } = defaultCoverCrop(imgAspect);
  const w = w0 / scale;
  const h = h0 / scale;
  return {
    x: Math.min(Math.max(x, 0), 1 - w),
    y: Math.min(Math.max(y, 0), 1 - h),
    w,
    h,
    scale,
  };
}
