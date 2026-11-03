import { encodeQr } from "@sbg/engine";

/** QR code as a standalone SVG string (black on white, 4-module quiet zone). */
export function qrSvg(text: string, sizePx = 160): string {
  const m = encodeQr(text, "M");
  const n = m.length + 8;
  let d = "";
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/**
 * Draw a QR code on a canvas at (x, y), `size` px square including a white quiet zone.
 * Modules snap to whole device pixels so phone cameras read it reliably.
 */
export function drawQr(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, scale = 1) {
  const m = encodeQr(text, "M");
  const n = m.length + 8;
  const unit = Math.max(1, Math.floor((size * scale) / n)) / scale;
  const total = unit * n;
  const ox = x + (size - total) / 2;
  const oy = y + (size - total) / 2;
  g.fillStyle = "#fff";
  g.fillRect(x, y, size, size);
  g.fillStyle = "#000";
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) g.fillRect(ox + (c + 4) * unit, oy + (r + 4) * unit, unit, unit);
    }),
  );
}
