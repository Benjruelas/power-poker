import { jsPDF } from "jspdf";
import * as turf from "@turf/turf";
import type maplibregl from "maplibre-gl";

import {
  buildLegend,
  geometryCentroid,
  instanceLabelText,
  resolveInstanceLabelStyle,
  snapScaleLengthFt,
} from "./objects";
import type { LegendRow, SitePlanDocument } from "./types";

/** 11×17 landscape inches at 150 dpi */
const PAPER_W_IN = 17;
const PAPER_H_IN = 11;
const DPI = 150;
const CANVAS_W = PAPER_W_IN * DPI;
const CANVAS_H = PAPER_H_IN * DPI;

/** Map frame share of total width (rest is legend sidebar). */
const MAP_WIDTH_RATIO = 0.85;

function parcelAcres(doc: SitePlanDocument): string | null {
  if (!doc.parcelPolygon) return null;
  try {
    const sqM = turf.area(doc.parcelPolygon);
    const acres = sqM / 4046.8564224;
    return `${acres.toFixed(2)} ac`;
  } catch {
    return null;
  }
}

function drawLegendSidebar(
  ctx: CanvasRenderingContext2D,
  doc: SitePlanDocument,
  rows: LegendRow[],
  x: number,
  y: number,
  w: number,
  h: number
) {
  // Sidebar plate
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  const pad = 16;
  let cy = y + pad;

  // Title block
  ctx.fillStyle = "#000000";
  ctx.font = "bold 16px system-ui, sans-serif";
  const title = doc.title || "Site plan";
  wrapText(ctx, title, x + pad, cy, w - pad * 2, 18).forEach((line, i) => {
    ctx.fillText(line, x + pad, cy + 14 + i * 18);
  });
  cy += 18 * Math.max(1, wrapText(ctx, title, x + pad, cy, w - pad * 2, 18).length) + 8;

  if (doc.subtitle) {
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#334155";
    wrapText(ctx, doc.subtitle, x + pad, cy, w - pad * 2, 15).forEach((line, i) => {
      ctx.fillText(line, x + pad, cy + 12 + i * 15);
    });
    cy += 15 * Math.max(1, wrapText(ctx, doc.subtitle, x + pad, cy, w - pad * 2, 15).length) + 6;
  }

  const acres = parcelAcres(doc);
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "#475569";
  const siteLine = `${doc.address || doc.lrid}${acres ? ` · ${acres}` : ""}`;
  wrapText(ctx, siteLine, x + pad, cy, w - pad * 2, 14).forEach((line, i) => {
    ctx.fillText(line, x + pad, cy + 11 + i * 14);
  });
  cy += 14 * Math.max(1, wrapText(ctx, siteLine, x + pad, cy, w - pad * 2, 14).length) + 12;

  // Divider
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + pad, cy);
  ctx.lineTo(x + w - pad, cy);
  ctx.stroke();
  cy += 14;

  // Legend header
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillStyle = "#000000";
  ctx.fillText("Legend", x + pad, cy + 12);
  cy += 28;

  const swatchW = 28;
  const textX = x + pad + swatchW + 10;
  const textMaxW = w - pad * 2 - swatchW - 10;
  if (!rows.length) {
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("No legend objects yet", x + pad, cy + 10);
    cy += 24;
  } else {
    for (const row of rows) {
      if (cy + 36 > y + h - 90) break;
      const isLine = row.shape === "line" || row.shape === "polyline";
      const isCircle = row.shape === "circle";
      const sx = x + pad;
      const midY = cy + (row.subtitle ? 14 : 10);
      const title = row.title || row.name;
      const shapeName =
        row.shape === "rectangle"
          ? "Rectangle"
          : row.shape === "circle"
            ? "Circle"
            : row.shape === "polygon"
              ? "Polygon"
              : row.shape === "polyline"
                ? "Polyline"
                : "Line";

      if (isLine) {
        const lineColor = row.stroke || row.fill || "#334155";
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.5;
        if (row.dashed) ctx.setLineDash([3, 3]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sx + 2, midY);
        ctx.lineTo(sx + swatchW - 2, midY);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (isCircle) {
        ctx.fillStyle =
          row.fill === "transparent" ? "rgba(0,0,0,0)" : row.fill;
        ctx.strokeStyle = row.stroke;
        ctx.lineWidth = 1.5;
        if (row.dashed) ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(sx + swatchW / 2, midY, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle =
          row.fill === "transparent" ? "rgba(0,0,0,0)" : row.fill;
        ctx.strokeStyle = row.stroke;
        ctx.lineWidth = 1.5;
        if (row.dashed) ctx.setLineDash([4, 3]);
        ctx.fillRect(sx, midY - 9, swatchW, 18);
        ctx.strokeRect(sx, midY - 9, swatchW, 18);
        ctx.setLineDash([]);
      }

      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(title, textX, midY + (row.subtitle ? -2 : 4));
      const titleW = ctx.measureText(title).width;
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(shapeName, textX + titleW + 6, midY + (row.subtitle ? -2 : 4));

      let blockH = 18;
      if (row.subtitle) {
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillStyle = "#475569";
        const subLines = wrapText(ctx, row.subtitle, textX, midY + 12, textMaxW, 12);
        subLines.slice(0, 2).forEach((line, i) => {
          ctx.fillText(line, textX, midY + 12 + i * 12);
        });
        blockH = 18 + subLines.slice(0, 2).length * 12;
      }
      cy += Math.max(28, blockH + 8);
    }
  }

  // Footer notes
  const footerY = y + h - pad - 36;
  ctx.strokeStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.moveTo(x + pad, footerY - 10);
  ctx.lineTo(x + w - pad, footerY - 10);
  ctx.stroke();

  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = "#64748b";
  if (doc.notes) {
    const notes = wrapText(ctx, doc.notes, x + pad, footerY, w - pad * 2, 12);
    notes.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, x + pad, footerY + i * 12);
    });
  }
  ctx.fillText("Concept — not for construction", x + pad, y + h - pad);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  _x: number,
  _y: number,
  maxW: number,
  _lineH: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${cur} ${words[i]}`;
    if (ctx.measureText(next).width <= maxW) {
      cur = next;
    } else {
      lines.push(cur);
      cur = words[i]!;
    }
  }
  lines.push(cur);
  return lines;
}

function drawPlateLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opts: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    padX: number;
    padY: number;
  }
) {
  ctx.font = `600 ${opts.fontSize}px system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const w = metrics.width + opts.padX * 2;
  const h = opts.fontSize + opts.padY * 2;
  const rx = x - w / 2;
  const ry = y - h / 2;

  ctx.fillStyle = opts.backgroundColor;
  ctx.strokeStyle = "rgba(15,23,42,0.2)";
  ctx.lineWidth = 1;
  roundRect(ctx, rx, ry, w, h, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = opts.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

/** Map HTML-marker labels onto the export frame (markers aren't on the GL canvas). */
function drawFreeLabelsOnFrame(
  ctx: CanvasRenderingContext2D,
  map: maplibregl.Map,
  doc: SitePlanDocument,
  mapRect: { dx: number; dy: number; drawW: number; drawH: number }
) {
  const canvas = map.getCanvas();
  const sx = mapRect.drawW / canvas.width;
  const sy = mapRect.drawH / canvas.height;
  const scale = Math.min(sx, sy);

  for (const lb of doc.freeLabels) {
    const p = map.project(lb.position as [number, number]);
    const x = mapRect.dx + p.x * sx;
    const y = mapRect.dy + p.y * sy;
    if (
      x < mapRect.dx ||
      y < mapRect.dy ||
      x > mapRect.dx + mapRect.drawW ||
      y > mapRect.dy + mapRect.drawH
    ) {
      continue;
    }
    drawPlateLabel(ctx, x, y, lb.text, {
      fontSize: Math.max(10, (lb.fontSize || 12) * scale * 1.1),
      color: lb.color || "#0f172a",
      backgroundColor: lb.backgroundColor || "#ffffff",
      padX: 7 * scale,
      padY: 4 * scale,
    });
  }

  // Instance labels with optional background plates
  for (const inst of doc.instances) {
    if (!inst.showLabel || inst.geometry.type === "Point") continue;
    const type = inst.typeId
      ? doc.objectTypes.find((t) => t.id === inst.typeId)
      : undefined;
    const labelStyle = resolveInstanceLabelStyle(inst, type);
    if (!labelStyle.backgroundColor) continue;
    const ll = geometryCentroid(inst.geometry);
    const center = map.project([ll[0]!, ll[1]!]);
    const x = mapRect.dx + center.x * sx;
    const y = mapRect.dy + center.y * sy;
    if (
      x < mapRect.dx ||
      y < mapRect.dy ||
      x > mapRect.dx + mapRect.drawW ||
      y > mapRect.dy + mapRect.drawH
    ) {
      continue;
    }
    drawPlateLabel(ctx, x, y, instanceLabelText(inst, type), {
      fontSize: Math.max(10, 11 * scale * 1.1),
      color: labelStyle.color,
      backgroundColor: labelStyle.backgroundColor,
      padX: 7 * scale,
      padY: 4 * scale,
    });
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function feetPerMapPixel(map: maplibregl.Map): number {
  const lat = map.getCenter().lat * (Math.PI / 180);
  const metersPerPx =
    (156543.03392 * Math.cos(lat)) / Math.pow(2, map.getZoom());
  return metersPerPx * 3.280839895;
}

/**
 * Classic black/white scale bar drawn on the map (bottom-left).
 * Length is true ground feet at the export map zoom.
 */
function drawScaleBarOnMap(
  ctx: CanvasRenderingContext2D,
  map: maplibregl.Map,
  mapDrawScale: number,
  mapRect: { dx: number; dy: number; drawW: number; drawH: number }
) {
  const fppMap = feetPerMapPixel(map);
  const feetPerFramePx = fppMap / mapDrawScale;
  const targetBarPx = Math.min(260, mapRect.drawW * 0.28);
  const lengthFt = snapScaleLengthFt(feetPerFramePx * targetBarPx);
  const barW = lengthFt / feetPerFramePx;
  const segments = 4;
  const segW = barW / segments;
  const barH = 14;
  const pad = 10;
  const boxW = barW + pad * 2;
  const boxH = pad + barH + 28;

  const x = mapRect.dx + 16;
  const y = mapRect.dy + mapRect.drawH - boxH - 16;

  // White plate with black border — high contrast on imagery
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeRect(x, y, boxW, boxH);

  const barX = x + pad;
  const barY = y + pad;

  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(barX + i * segW, barY, segW + 0.5, barH);
  }
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX, barY, barW, barH);

  const midFt = lengthFt / 2;
  const m = lengthFt * 0.3048;
  const midM = m / 2;
  const fmtFt = (n: number) => (n >= 100 ? `${Math.round(n)}` : `${n}`);
  const fmtM = (n: number) =>
    n >= 100 ? `${Math.round(n)}` : `${Math.round(n * 10) / 10}`;

  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("0", barX, barY + barH + 3);
  ctx.fillText(fmtFt(midFt), barX + barW / 2, barY + barH + 3);
  ctx.fillText(`${fmtFt(lengthFt)} ft`, barX + barW, barY + barH + 3);

  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = "#334155";
  ctx.fillText("0", barX, barY + barH + 15);
  ctx.fillText(fmtM(midM), barX + barW / 2, barY + barH + 15);
  ctx.fillText(`${fmtM(m)} m`, barX + barW, barY + barH + 15);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export async function renderSitePlanFrame(
  mapCanvas: HTMLCanvasElement,
  doc: SitePlanDocument,
  map?: maplibregl.Map | null
): Promise<HTMLCanvasElement> {
  const out = document.createElement("canvas");
  out.width = CANVAS_W;
  out.height = CANVAS_H;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  // Page background
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const margin = 20;
  const gap = 12;
  const contentW = CANVAS_W - margin * 2;
  const contentH = CANVAS_H - margin * 2 - 22;
  const mapPanelW = Math.round(contentW * MAP_WIDTH_RATIO);
  const sideW = contentW - mapPanelW - gap;

  const mapX = margin;
  const mapY = margin;
  const sideX = margin + mapPanelW + gap;
  const sideY = margin;

  // Map panel — fill 85% width, full content height
  const srcW = mapCanvas.width;
  const srcH = mapCanvas.height;
  const fit = Math.min(mapPanelW / srcW, contentH / srcH);
  const drawW = srcW * fit;
  const drawH = srcH * fit;
  // Letterbox inside the 85% panel so the image is as large as possible
  const dx = mapX + (mapPanelW - drawW) / 2;
  const dy = mapY + (contentH - drawH) / 2;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(mapX, mapY, mapPanelW, contentH);
  ctx.drawImage(mapCanvas, dx, dy, drawW, drawH);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(mapX, mapY, mapPanelW, contentH);

  const mapRect = { dx, dy, drawW, drawH };
  if (map) {
    drawFreeLabelsOnFrame(ctx, map, doc, mapRect);
    drawScaleBarOnMap(ctx, map, fit, mapRect);
  }

  // Legend / project sidebar (15%)
  drawLegendSidebar(
    ctx,
    doc,
    buildLegend(doc),
    sideX,
    sideY,
    sideW,
    contentH
  );

  ctx.font = "10px system-ui, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(
    `${doc.address || doc.lrid} · Power Poker site plan · ${new Date().toLocaleDateString()}`,
    margin,
    CANVAS_H - 8
  );

  return out;
}

export async function exportSitePlanPng(
  mapCanvas: HTMLCanvasElement,
  doc: SitePlanDocument,
  filename?: string,
  map?: maplibregl.Map | null
): Promise<void> {
  const frame = await renderSitePlanFrame(mapCanvas, doc, map);
  const blob = await new Promise<Blob | null>((resolve) =>
    frame.toBlob(resolve, "image/png")
  );
  if (!blob) throw new Error("PNG export failed");
  downloadBlob(blob, filename ?? `site-plan-${doc.lrid}.png`);
}

export async function exportSitePlanPdf(
  mapCanvas: HTMLCanvasElement,
  doc: SitePlanDocument,
  filename?: string,
  map?: maplibregl.Map | null
): Promise<void> {
  const frame = await renderSitePlanFrame(mapCanvas, doc, map);
  const dataUrl = frame.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: [PAPER_W_IN, PAPER_H_IN],
  });
  pdf.addImage(dataUrl, "JPEG", 0, 0, PAPER_W_IN, PAPER_H_IN);
  pdf.save(filename ?? `site-plan-${doc.lrid}.pdf`);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
