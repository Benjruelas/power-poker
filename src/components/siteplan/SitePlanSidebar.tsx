"use client";

import type { LucideIcon } from "lucide-react";
import {
  Circle,
  Hexagon,
  MousePointer2,
  Ruler,
  Slash,
  Square,
  Trash2,
  Type,
  Waypoints,
} from "lucide-react";

import { buildLegend, shapeLabel } from "@/lib/siteplan/objects";
import type {
  DrawDefaults,
  EditorTool,
  FreeLabel,
  LegendRow,
  ObjectShape,
  ObjectType,
  ParcelSquareSide,
  SitePlanDocument,
  SitePlanInstance,
} from "@/lib/siteplan/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Selection =
  | { kind: "instance"; id: string }
  | { kind: "instances"; ids: string[] }
  | { kind: "label"; id: string }
  | { kind: "type"; id: string }
  | null;

type Props = {
  doc: SitePlanDocument;
  tool: EditorTool;
  ortho: boolean;
  activeTypeId: string | null;
  selection: Selection;
  measureFt: number | null;
  liveZoom: number | null;
  saving: boolean;
  dirty: boolean;
  onToolChange: (t: EditorTool) => void;
  onOrthoChange: (v: boolean) => void;
  onActiveTypeChange: (id: string | null) => void;
  onPickLibraryType: (id: string) => void;
  onSelectionChange: (s: Selection) => void;
  onDocChange: (doc: SitePlanDocument) => void;
  onSave: () => void;
  onExportPdf: () => void;
  onExportPng: () => void;
  onCreateType: () => void;
  onDeleteSelection: () => void;
  onSquareUp: (side: ParcelSquareSide) => void;
  onResetNorth: () => void;
  onCaptureExportView: () => void;
  onGoToExportView: () => void;
  onRotateSelection: (deltaDeg: number) => void;
  onSetSelectionRotation: (deg: number) => void;
  onResizeSelection: (widthFt: number, heightFt: number) => void;
  onDuplicateSelection: () => void;
  onPromoteToType: () => void;
  drawDefaults: DrawDefaults;
  onDrawDefaultsChange: (d: DrawDefaults) => void;
};

const TOOLS: {
  id: EditorTool;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  { id: "select", label: "Select", hint: "Select / edit", icon: MousePointer2 },
  {
    id: "rect",
    label: "Rectangle",
    hint: "Drag rectangle · Shift = square",
    icon: Square,
  },
  {
    id: "circle",
    label: "Circle",
    hint: "Drag circle",
    icon: Circle,
  },
  {
    id: "line",
    label: "Line",
    hint: "Two-point line · Shift = 90°",
    icon: Slash,
  },
  {
    id: "polyline",
    label: "Multi-line",
    hint: "Polyline · Shift = 90° · Enter to finish",
    icon: Waypoints,
  },
  { id: "polygon", label: "Polygon", hint: "Click vertices", icon: Hexagon },
  { id: "label", label: "Label", hint: "Free text (no legend)", icon: Type },
  { id: "measure", label: "Measure", hint: "Distance ft", icon: Ruler },
  { id: "delete", label: "Delete", hint: "Click to remove", icon: Trash2 },
];

const SHAPES: ObjectShape[] = [
  "rectangle",
  "circle",
  "polygon",
  "line",
  "polyline",
];

const inputClass =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-ring";

function hexColor(value: string | undefined, fallback: string): string {
  if (value && value.startsWith("#") && value.length >= 7) return value.slice(0, 7);
  return fallback;
}

function LegendShapeSwatch({ row }: { row: LegendRow }) {
  const fill = row.fill === "transparent" ? "transparent" : row.fill;
  const stroke = row.stroke;
  const isLine = row.shape === "line" || row.shape === "polyline";
  const isCircle = row.shape === "circle";
  return (
    <span
      className="relative flex size-8 shrink-0 items-center justify-center"
      title={shapeLabel(row.shape)}
    >
      {isLine ? (
        <span
          className="absolute inset-x-1 top-1/2 h-2.5 -translate-y-1/2 rounded-[2px] border"
          style={{
            background: fill !== "transparent" ? fill : stroke,
            borderColor: row.borderColor || stroke,
          }}
        />
      ) : (
        <span
          className={cn(
            "absolute inset-1 border",
            isCircle ? "rounded-full" : "rounded-[3px]",
            row.dashed && "border-dashed"
          )}
          style={{ background: fill, borderColor: stroke }}
        />
      )}
    </span>
  );
}

function LegendListItem({ row }: { row: LegendRow }) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs">
      <LegendShapeSwatch row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate font-semibold text-foreground">
            {row.title}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            {shapeLabel(row.shape)}
          </span>
        </div>
        {row.subtitle ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {row.subtitle}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
        ×{row.count}
      </span>
    </li>
  );
}

/** Round feet dimensions to 2 decimal places. */
function roundFt2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatFt2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(roundFt2(n));
}

function parseFt2(raw: string): number | null {
  if (raw === "") return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return roundFt2(n);
}

type LineStyleValues = {
  dashed: boolean;
  fill: string;
  stroke: string;
  dashColor: string;
  borderColor: string;
  borderWidth: number;
  widthFt: number | null;
};

type ShapeStyleValues = {
  fill: string;
  stroke: string;
  borderColor: string;
  borderWidth: number;
  dashed: boolean;
};

function ShapeStyleControls({
  values,
  onChange,
}: {
  values: ShapeStyleValues;
  onChange: (patch: Partial<ShapeStyleValues>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">Colors</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Fill</span>
          <input
            type="color"
            className="h-8 w-full"
            value={hexColor(values.fill, "#4ade80")}
            onChange={(e) => onChange({ fill: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Stroke</span>
          <input
            type="color"
            className="h-8 w-full"
            value={hexColor(values.stroke, "#166534")}
            onChange={(e) => onChange({ stroke: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Border color</span>
          <input
            type="color"
            className="h-8 w-full"
            value={hexColor(values.borderColor, hexColor(values.stroke, "#166534"))}
            onChange={(e) => onChange({ borderColor: e.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">
            Border width (px)
          </span>
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={values.borderWidth}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              onChange({
                borderWidth: Number.isFinite(n) ? Math.max(0, n) : 0,
              });
            }}
          />
        </label>
      </div>
      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={values.dashed}
          onChange={(e) => onChange({ dashed: e.target.checked })}
        />
        Dashed stroke
      </label>
    </div>
  );
}

function LineStyleControls({
  values,
  onChange,
}: {
  values: LineStyleValues;
  onChange: (patch: Partial<LineStyleValues>) => void;
}) {
  const color = hexColor(values.stroke, hexColor(values.fill, "#475569"));
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">Line style</p>
      <div className="flex gap-1">
        <button
          type="button"
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-medium",
            !values.dashed ? "bg-neutral-900 text-white" : "bg-muted"
          )}
          onClick={() => onChange({ dashed: false })}
        >
          Solid
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-medium",
            values.dashed ? "bg-neutral-900 text-white" : "bg-muted"
          )}
          onClick={() => onChange({ dashed: true })}
        >
          Dotted
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">
            Line weight (ft)
          </span>
          <input
            type="number"
            min={0.01}
            step={0.01}
            className={inputClass}
            value={formatFt2(values.widthFt)}
            placeholder="e.g. 18"
            onChange={(e) => {
              onChange({ widthFt: parseFt2(e.target.value) });
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Line color</span>
          <input
            type="color"
            className="h-8 w-full"
            value={color}
            onChange={(e) => {
              const c = e.target.value;
              // One color for solid and dotted (fill, stroke, dash, border)
              onChange({
                fill: c,
                stroke: c,
                dashColor: c,
                borderColor: c,
              });
            }}
          />
        </label>
      </div>
    </div>
  );
}

const SIDES: { id: ParcelSquareSide; label: string }[] = [
  { id: "north", label: "N" },
  { id: "south", label: "S" },
  { id: "east", label: "E" },
  { id: "west", label: "W" },
];

export function SitePlanSidebar({
  doc,
  tool,
  ortho,
  activeTypeId,
  selection,
  measureFt,
  liveZoom,
  saving,
  dirty,
  onToolChange,
  onOrthoChange,
  onActiveTypeChange,
  onPickLibraryType,
  onSelectionChange,
  onDocChange,
  onSave,
  onExportPdf,
  onExportPng,
  onCreateType,
  onDeleteSelection,
  onSquareUp,
  onResetNorth,
  onCaptureExportView,
  onGoToExportView,
  onRotateSelection,
  onSetSelectionRotation,
  onResizeSelection,
  onDuplicateSelection,
  onPromoteToType,
  drawDefaults,
  onDrawDefaultsChange,
}: Props) {
  const legend = buildLegend(doc);
  // Only show type editor when explicitly editing a type — not while placing
  const selectedType =
    selection?.kind === "type"
      ? doc.objectTypes.find((t) => t.id === selection.id)
      : null;
  const placingType = activeTypeId
    ? doc.objectTypes.find((t) => t.id === activeTypeId)
    : null;

  const selectedInstance =
    selection?.kind === "instance"
      ? doc.instances.find((i) => i.id === selection.id)
      : null;

  const multiIds =
    selection?.kind === "instances" ? selection.ids : [];
  const multiCount = multiIds.length;
  const multiPrimary =
    multiCount > 0
      ? doc.instances.find((i) => i.id === multiIds[0])
      : null;

  const selectedLabel =
    selection?.kind === "label"
      ? doc.freeLabels.find((l) => l.id === selection.id)
      : null;

  const patchMeta = (partial: Partial<SitePlanDocument>) => {
    onDocChange({ ...doc, ...partial, updatedAt: new Date().toISOString() });
  };

  const patchType = (next: ObjectType) => {
    onDocChange({
      ...doc,
      objectTypes: doc.objectTypes.map((t) => (t.id === next.id ? next : t)),
      updatedAt: new Date().toISOString(),
    });
  };

  const patchInstance = (next: SitePlanInstance) => {
    onDocChange({
      ...doc,
      instances: doc.instances.map((i) => (i.id === next.id ? next : i)),
      updatedAt: new Date().toISOString(),
    });
  };

  const patchSelectedStyles = (
    ids: string[],
    stylePatch: Partial<NonNullable<SitePlanInstance["styleOverride"]>>
  ) => {
    const idSet = new Set(ids);
    onDocChange({
      ...doc,
      instances: doc.instances.map((i) =>
        idSet.has(i.id)
          ? {
              ...i,
              styleOverride: { ...(i.styleOverride || {}), ...stylePatch },
            }
          : i
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const patchLabel = (next: FreeLabel) => {
    onDocChange({
      ...doc,
      freeLabels: doc.freeLabels.map((l) => (l.id === next.id ? next : l)),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <aside className="flex h-full w-full max-w-md flex-col border-r bg-background">
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Site plan drawer</h2>
        <p className="truncate text-xs text-muted-foreground">{doc.address}</p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
          <Button size="sm" variant="outline" onClick={onExportPdf}>
            PDF
          </Button>
          <Button size="sm" variant="outline" onClick={onExportPng}>
            PNG
          </Button>
        </div>
        {measureFt != null ? (
          <div className="rounded-md bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-900">
            Measure: {Math.round(measureFt)} ft
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <section className="space-y-2">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Project title
            </span>
            <input
              className={inputClass}
              value={doc.title}
              onChange={(e) => patchMeta({ title: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Subtitle
            </span>
            <input
              className={inputClass}
              value={doc.subtitle}
              onChange={(e) => patchMeta({ subtitle: e.target.value })}
              placeholder="e.g. 800 x 500 ft site · concept"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </span>
            <textarea
              className="min-h-[56px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring"
              value={doc.notes}
              onChange={(e) => patchMeta({ notes: e.target.value })}
            />
          </label>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Square parcel to viewport
          </p>
          <p className="text-[11px] text-muted-foreground">
            Pick which parcel side lines up with the bottom of the map.
          </p>
          <div className="flex flex-wrap gap-1">
            {SIDES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSquareUp(s.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold",
                  doc.view.squareSide === s.id
                    ? "bg-neutral-900 text-white"
                    : "bg-muted text-foreground hover:bg-muted/80"
                )}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onResetNorth}
              className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium hover:bg-muted/80"
            >
              North up
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Bearing {Math.round(doc.view.bearingDeg)}°
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Export zoom
          </p>
          <p className="text-[11px] text-muted-foreground">
            Edit at any zoom. Capture the frame you want baked into PDF/PNG.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">Live zoom</div>
              <div className="font-medium tabular-nums">
                {liveZoom != null ? liveZoom.toFixed(2) : "—"}
              </div>
            </div>
            <label className="rounded-md border px-2 py-1.5">
              <div className="text-[10px] text-muted-foreground">Export zoom</div>
              <input
                type="number"
                step="0.1"
                min={10}
                max={22}
                className="mt-0.5 w-full bg-transparent text-sm font-medium outline-none tabular-nums"
                value={doc.view.exportZoom ?? ""}
                placeholder="live"
                onChange={(e) => {
                  const v = e.target.value;
                  patchMeta({
                    view: {
                      ...doc.view,
                      exportZoom: v === "" ? null : parseFloat(v),
                    },
                  });
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={onCaptureExportView}>
              Use current view
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onGoToExportView}
              disabled={doc.view.exportZoom == null}
            >
              Go to export view
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            PDF/PNG auto-adds a black/white scale bar (true feet at export zoom)
            with the legend.
          </p>
        </section>

        <section>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tools
          </p>
          <div className="flex flex-wrap gap-1">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={`${t.label} — ${t.hint}`}
                  aria-label={t.label}
                  aria-pressed={tool === t.id}
                  onClick={() => onToolChange(t.id)}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-md transition",
                    tool === t.id
                      ? "bg-neutral-900 text-white"
                      : "bg-muted text-foreground hover:bg-muted/80",
                    t.id === "delete" &&
                      tool !== t.id &&
                      "text-red-600 hover:bg-red-50"
                  )}
                >
                  <Icon className="size-4" strokeWidth={2} />
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Hold <span className="font-medium text-foreground">Shift</span> while
            drawing lines for 90° snaps (view-aligned).
            {ortho ? " Ortho lock is on." : null}
          </div>
          <label className="mt-1 inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={ortho}
              onChange={(e) => onOrthoChange(e.target.checked)}
            />
            Always snap 90° (lines)
          </label>
          {(tool === "rect" ||
            tool === "circle" ||
            tool === "line" ||
            tool === "polyline" ||
            tool === "polygon") &&
          !placingType ? (
            <div className="rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
              Freehand draw — not linked to a library type.
              {tool === "rect" ? " Hold Shift for a square." : null}
            </div>
          ) : null}
          {placingType &&
          (tool === "place" ||
            tool === "polyline" ||
            tool === "line" ||
            tool === "polygon") ? (
            <div className="rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
              {tool === "place"
                ? `Placing “${placingType.name}” — click the map.`
                : `Drawing as “${placingType.name}”.`}
            </div>
          ) : null}
          {tool === "rect" ||
          tool === "circle" ||
          tool === "line" ||
          tool === "polyline" ||
          tool === "polygon" ||
          tool === "place" ? (
            <DrawDefaultsPanel
              tool={tool}
              values={drawDefaults}
              onChange={onDrawDefaultsChange}
              hasLibraryType={Boolean(placingType)}
            />
          ) : null}
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Object library
            </p>
            <Button size="xs" variant="outline" onClick={onCreateType}>
              New type
            </Button>
          </div>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Click a type to place it. Drawn items can use Add to legend or Save
            as type from the selection panel.
          </p>
          <ul className="space-y-1">
            {doc.objectTypes.map((t) => (
              <li key={t.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onPickLibraryType(t.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs",
                    tool === "place" && activeTypeId === t.id
                      ? "border-neutral-900 bg-muted"
                      : "border-transparent hover:bg-muted/60"
                  )}
                >
                  <span
                    className="size-3.5 shrink-0 rounded-sm border"
                    style={{
                      background:
                        t.fill === "transparent" ? "transparent" : t.fill,
                      borderColor: t.stroke,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {t.shape}
                  </span>
                </button>
                <button
                  type="button"
                  title="Edit type"
                  className="shrink-0 rounded-md bg-muted px-2 text-[11px] font-medium hover:bg-muted/80"
                  onClick={() => {
                    onActiveTypeChange(t.id);
                    onSelectionChange({ kind: "type", id: t.id });
                  }}
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selectedType ? (
          <TypeEditor type={selectedType} onChange={patchType} />
        ) : null}

        {multiCount > 0 && multiPrimary ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-semibold">
              {multiCount} objects selected
            </p>
            <p className="text-[10px] text-muted-foreground">
              Shift+click to add/remove · Alt+click cycles stacked items ·
              ⌘/Ctrl+G to group · double-click a member to edit alone
            </p>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={onDuplicateSelection}>
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const needTitle = multiIds.some((id) => {
                    const i = doc.instances.find((x) => x.id === id);
                    return (
                      i &&
                      !i.legendTitle?.trim() &&
                      !i.labelOverride?.trim() &&
                      !i.typeId
                    );
                  });
                  let title: string | null = null;
                  if (needTitle) {
                    title = window.prompt(
                      "Legend title for untitled items:",
                      "Untitled object"
                    );
                    if (title == null) return;
                  }
                  const idSet = new Set(multiIds);
                  const fallback = title?.trim() || "Untitled object";
                  onDocChange({
                    ...doc,
                    instances: doc.instances.map((i) => {
                      if (!idSet.has(i.id)) return i;
                      return {
                        ...i,
                        legend: true,
                        legendTitle:
                          i.legendTitle?.trim() ||
                          i.labelOverride?.trim() ||
                          (needTitle ? fallback : i.legendTitle) ||
                          i.legendTitle,
                        labelOverride:
                          i.labelOverride?.trim() ||
                          (needTitle ? fallback : null) ||
                          i.labelOverride,
                      };
                    }),
                    updatedAt: new Date().toISOString(),
                  });
                }}
              >
                Add to legend
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onDeleteSelection}
              >
                Delete
              </Button>
            </div>
            {(() => {
              const t = multiPrimary.typeId
                ? doc.objectTypes.find((x) => x.id === multiPrimary.typeId)
                : undefined;
              const s = multiPrimary.styleOverride || {};
              const isLine =
                multiPrimary.geometry.type === "LineString" ||
                t?.shape === "line" ||
                t?.shape === "polyline";
              const stroke = s.stroke ?? t?.stroke ?? "#166534";
              const fill = s.fill ?? t?.fill ?? stroke;
              if (isLine) {
                return (
                  <LineStyleControls
                    values={{
                      dashed: Boolean(s.dashed ?? t?.dashed ?? false),
                      fill,
                      stroke,
                      dashColor: s.dashColor ?? t?.dashColor ?? stroke,
                      borderColor: s.borderColor ?? t?.borderColor ?? stroke,
                      borderWidth:
                        s.borderWidth ??
                        t?.borderWidth ??
                        t?.strokeWidth ??
                        s.strokeWidth ??
                        2,
                      widthFt: multiPrimary.widthFt ?? t?.widthFt ?? null,
                    }}
                    onChange={(patch) => {
                      const { widthFt, ...stylePatch } = patch;
                      const idSet = new Set(multiIds);
                      onDocChange({
                        ...doc,
                        instances: doc.instances.map((i) => {
                          if (!idSet.has(i.id)) return i;
                          return {
                            ...i,
                            ...(widthFt !== undefined ? { widthFt } : null),
                            styleOverride: {
                              ...(i.styleOverride || {}),
                              ...stylePatch,
                            },
                          };
                        }),
                        updatedAt: new Date().toISOString(),
                      });
                    }}
                  />
                );
              }
              return (
                <ShapeStyleControls
                  values={{
                    fill,
                    stroke,
                    borderColor: s.borderColor ?? t?.borderColor ?? stroke,
                    borderWidth:
                      s.borderWidth ??
                      t?.borderWidth ??
                      t?.strokeWidth ??
                      s.strokeWidth ??
                      2,
                    dashed: Boolean(s.dashed ?? t?.dashed ?? false),
                  }}
                  onChange={(patch) => patchSelectedStyles(multiIds, patch)}
                />
              );
            })()}
          </div>
        ) : null}

        {selectedInstance ? (
          <InstanceEditor
            instance={selectedInstance}
            type={doc.objectTypes.find((t) => t.id === selectedInstance.typeId)}
            onChange={patchInstance}
            onDelete={onDeleteSelection}
            onRotate={onRotateSelection}
            onSetRotation={onSetSelectionRotation}
            onResize={onResizeSelection}
            onDuplicate={onDuplicateSelection}
            onPromoteToType={onPromoteToType}
          />
        ) : null}

        {selectedLabel ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-semibold">Free label</p>
            <p className="text-[10px] text-muted-foreground">
              Not shown in the legend
            </p>
            <input
              className={inputClass}
              value={selectedLabel.text}
              onChange={(e) =>
                patchLabel({ ...selectedLabel, text: e.target.value })
              }
            />
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Font size</span>
              <input
                type="number"
                className={inputClass}
                value={selectedLabel.fontSize}
                onChange={(e) =>
                  patchLabel({
                    ...selectedLabel,
                    fontSize: parseFloat(e.target.value) || 12,
                  })
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Font color
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(selectedLabel.color, "#0f172a")}
                  onChange={(e) =>
                    patchLabel({ ...selectedLabel, color: e.target.value })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Background
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(selectedLabel.backgroundColor, "#ffffff")}
                  onChange={(e) =>
                    patchLabel({
                      ...selectedLabel,
                      backgroundColor: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <Button size="sm" variant="destructive" onClick={onDeleteSelection}>
              Delete label
            </Button>
          </div>
        ) : null}

        <section>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Auto legend
          </p>
          {legend.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add objects to the legend from a selection, or enable legend on a
              library type.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {legend.map((row) => (
                <LegendListItem key={row.typeId} row={row} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

function DrawDefaultsPanel({
  tool,
  values,
  onChange,
  hasLibraryType,
}: {
  tool: EditorTool;
  values: DrawDefaults;
  onChange: (d: DrawDefaults) => void;
  hasLibraryType: boolean;
}) {
  const isLine = tool === "line" || tool === "polyline";
  const isPoly = tool === "polygon";
  const showSize = tool === "place" || isLine;
  const showHeight = tool === "place" || tool === "rect" || tool === "circle";
  const set = <K extends keyof DrawDefaults>(key: K, value: DrawDefaults[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-sky-200/80 bg-sky-50/40 p-3">
      <p className="text-xs font-semibold text-sky-950">
        New item defaults
      </p>
      <p className="text-[10px] text-muted-foreground">
        Prefill before drawing
        {hasLibraryType ? " · overrides apply to this place/draw" : ""}.
        {tool === "rect" || tool === "circle"
          ? " Size comes from the drag on the map."
          : null}
      </p>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Legend title</span>
        <input
          className={inputClass}
          value={values.legendTitle}
          placeholder="e.g. Compute Module"
          onChange={(e) => set("legendTitle", e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">
          Legend subtitle
        </span>
        <input
          className={inputClass}
          value={values.legendSubtitle}
          placeholder="e.g. outdoor · 2.5 MVA"
          onChange={(e) => set("legendSubtitle", e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Map label</span>
        <input
          className={inputClass}
          value={values.labelOverride}
          placeholder="Optional label on the map"
          onChange={(e) => set("labelOverride", e.target.value)}
        />
      </label>

      {isLine ? (
        <LineStyleControls
          values={{
            dashed: values.dashed,
            fill: values.fill,
            stroke: values.stroke,
            dashColor: values.dashColor,
            borderColor: values.borderColor,
            borderWidth: values.borderWidth,
            widthFt: values.widthFt,
          }}
          onChange={(patch) => {
            onChange({
              ...values,
              ...patch,
              widthFt:
                patch.widthFt !== undefined ? patch.widthFt : values.widthFt,
            });
          }}
        />
      ) : (
        <ShapeStyleControls
          values={{
            fill: values.fill,
            stroke: values.stroke,
            borderColor: values.borderColor,
            borderWidth: values.borderWidth,
            dashed: values.dashed,
          }}
          onChange={(patch) => onChange({ ...values, ...patch })}
        />
      )}

      {showSize && !isLine ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">Width ft</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={inputClass}
              value={formatFt2(values.widthFt)}
              onChange={(e) => set("widthFt", parseFt2(e.target.value))}
            />
          </label>
          {showHeight ? (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Height ft</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className={inputClass}
                value={formatFt2(values.heightFt)}
                onChange={(e) => set("heightFt", parseFt2(e.target.value))}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {!isPoly ? null : (
        <p className="text-[10px] text-muted-foreground">
          Polygon size follows the vertices you click.
        </p>
      )}

      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={values.showLabel}
          onChange={(e) => set("showLabel", e.target.checked)}
        />
        Show centered label
      </label>
      {values.showLabel ? (
        <div className="space-y-2 rounded-md border border-border/70 bg-background/80 p-2">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={values.labelBackground}
              onChange={(e) => set("labelBackground", e.target.checked)}
            />
            Label background fill
          </label>
          {values.labelBackground ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Label fill
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(values.labelBackgroundColor, "#ffffff")}
                  onChange={(e) =>
                    set("labelBackgroundColor", e.target.value)
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Label text
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(values.labelColor, "#0f172a")}
                  onChange={(e) => set("labelColor", e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={values.legend}
          onChange={(e) => set("legend", e.target.checked)}
        />
        Add to legend when drawn
      </label>
    </div>
  );
}

function TypeEditor({
  type,
  onChange,
}: {
  type: ObjectType;
  onChange: (t: ObjectType) => void;
}) {
  const set = <K extends keyof ObjectType>(key: K, value: ObjectType[K]) =>
    onChange({ ...type, [key]: value });
  const isLine = type.shape === "line" || type.shape === "polyline";

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-semibold">Edit type</p>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Legend title</span>
        <input
          className={inputClass}
          value={type.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Compute Module"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">
          Legend subtitle
        </span>
        <input
          className={inputClass}
          value={type.legendSubtitle ?? ""}
          onChange={(e) =>
            set("legendSubtitle", e.target.value || null)
          }
          placeholder="e.g. 2.5 MVA · outdoor"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Shape</span>
        <select
          className={inputClass}
          value={type.shape}
          onChange={(e) => set("shape", e.target.value as ObjectShape)}
        >
          {SHAPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {isLine ? (
        <LineStyleControls
          values={{
            dashed: Boolean(type.dashed),
            fill: type.fill,
            stroke: type.stroke,
            dashColor: type.dashColor || type.stroke,
            borderColor: type.borderColor || type.stroke,
            borderWidth: type.borderWidth ?? type.strokeWidth,
            widthFt: type.widthFt,
          }}
          onChange={(patch) => onChange({ ...type, ...patch })}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">Width ft</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={inputClass}
              value={formatFt2(type.widthFt)}
              placeholder="—"
              onChange={(e) => set("widthFt", parseFt2(e.target.value))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">Height ft</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={inputClass}
              value={formatFt2(type.heightFt)}
              placeholder="—"
              onChange={(e) => set("heightFt", parseFt2(e.target.value))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">Fill</span>
            <input
              type="color"
              className="h-8 w-full"
              value={hexColor(type.fill, "#4ade80")}
              onChange={(e) => set("fill", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">Stroke</span>
            <input
              type="color"
              className="h-8 w-full"
              value={hexColor(type.stroke, "#166534")}
              onChange={(e) => set("stroke", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">
              Border color
            </span>
            <input
              type="color"
              className="h-8 w-full"
              value={hexColor(type.borderColor || type.stroke, "#166534")}
              onChange={(e) => set("borderColor", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">
              Border width (px)
            </span>
            <input
              type="number"
              min={0}
              step={0.5}
              className={inputClass}
              value={type.borderWidth ?? type.strokeWidth}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                set(
                  "borderWidth",
                  Number.isFinite(n) ? Math.max(0, n) : 0
                );
              }}
            />
          </label>
        </div>
      )}

      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={type.showLabel}
          onChange={(e) => set("showLabel", e.target.checked)}
        />
        Show centered label
      </label>
      {type.showLabel ? (
        <div className="space-y-2 rounded-md border border-border/70 p-2">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={Boolean(type.labelBackgroundColor)}
              onChange={(e) =>
                set(
                  "labelBackgroundColor",
                  e.target.checked
                    ? type.labelBackgroundColor || "#ffffff"
                    : null
                )
              }
            />
            Label background fill
          </label>
          {type.labelBackgroundColor ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Label fill
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(type.labelBackgroundColor, "#ffffff")}
                  onChange={(e) =>
                    set("labelBackgroundColor", e.target.value)
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Label text
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(type.labelColor || "#0f172a", "#0f172a")}
                  onChange={(e) => set("labelColor", e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={type.legend}
          onChange={(e) => set("legend", e.target.checked)}
        />
        Include in legend
      </label>
      {!isLine ? (
        <label className="inline-flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={Boolean(type.dashed)}
            onChange={(e) => set("dashed", e.target.checked)}
          />
          Dashed stroke
        </label>
      ) : null}
    </div>
  );
}

function InstanceEditor({
  instance,
  type,
  onChange,
  onDelete,
  onRotate,
  onSetRotation,
  onResize,
  onDuplicate,
  onPromoteToType,
}: {
  instance: SitePlanInstance;
  type: ObjectType | undefined;
  onChange: (i: SitePlanInstance) => void;
  onDelete: () => void;
  onRotate: (deltaDeg: number) => void;
  onSetRotation: (deg: number) => void;
  onResize: (widthFt: number, heightFt: number) => void;
  onDuplicate: () => void;
  onPromoteToType: () => void;
}) {
  const isLine =
    instance.geometry.type === "LineString" ||
    type?.shape === "line" ||
    type?.shape === "polyline";
  const canResize =
    !isLine &&
    type?.shape !== "polygon";
  const inLegend = Boolean(instance.legend || type?.legend);

  const applySize = () => {
    const w = instance.widthFt == null ? null : roundFt2(instance.widthFt);
    const h = instance.heightFt == null ? null : roundFt2(instance.heightFt);
    if (w == null || h == null || !Number.isFinite(w) || !Number.isFinite(h)) {
      return;
    }
    if (w <= 0 || h <= 0) return;
    onResize(w, h);
  };

  const style = instance.styleOverride || {};
  const stroke = style.stroke ?? type?.stroke ?? (isLine ? "#38bdf8" : "#166534");
  const fill = style.fill ?? type?.fill ?? stroke;

  const patchStyle = (
    stylePatch: Partial<NonNullable<SitePlanInstance["styleOverride"]>>,
    extra?: Partial<SitePlanInstance>
  ) => {
    onChange({
      ...instance,
      ...extra,
      styleOverride: {
        ...style,
        ...stylePatch,
      },
    });
  };

  const addToLegend = () => {
    let title =
      instance.legendTitle?.trim() ||
      instance.labelOverride?.trim() ||
      type?.name?.trim() ||
      "";
    if (!title) {
      const entered = window.prompt("Legend title:", "Untitled object");
      if (entered == null) return;
      title = entered.trim() || "Untitled object";
    }
    onChange({
      ...instance,
      legend: true,
      legendTitle: instance.legendTitle?.trim() ? instance.legendTitle : title,
      labelOverride: instance.labelOverride?.trim()
        ? instance.labelOverride
        : title,
    });
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-semibold">
        Selected · {instance.labelOverride?.trim() || type?.name || "Freehand"}
      </p>

      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button
          size="sm"
          variant={inLegend ? "secondary" : "outline"}
          onClick={addToLegend}
          disabled={Boolean(instance.legend)}
          title={
            instance.legend
              ? "Already on the legend"
              : "Add this item to the auto legend"
          }
        >
          {instance.legend ? "On legend" : "Add to legend"}
        </Button>
        <Button size="sm" variant="outline" onClick={onPromoteToType}>
          Save as type
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>
          Delete
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        ⌘/Ctrl+D duplicate · Add to legend without saving a library type
      </p>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Legend title</span>
        <input
          className={inputClass}
          value={instance.legendTitle ?? ""}
          placeholder={
            type?.name ?? instance.labelOverride ?? "e.g. Compute Module"
          }
          onChange={(e) =>
            onChange({
              ...instance,
              legendTitle: e.target.value || null,
            })
          }
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">
          Legend subtitle
        </span>
        <input
          className={inputClass}
          value={instance.legendSubtitle ?? ""}
          placeholder={type?.legendSubtitle ?? "e.g. 40×70 ft · outdoor"}
          onChange={(e) =>
            onChange({
              ...instance,
              legendSubtitle: e.target.value || null,
            })
          }
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">
          Map label override
        </span>
        <input
          className={inputClass}
          value={instance.labelOverride ?? ""}
          placeholder={
            instance.legendTitle || type?.name || "Shown on map when labeled"
          }
          onChange={(e) =>
            onChange({
              ...instance,
              labelOverride: e.target.value || null,
            })
          }
        />
      </label>

      {isLine ? (
        <LineStyleControls
          values={{
            dashed: Boolean(style.dashed ?? type?.dashed ?? false),
            fill,
            stroke,
            dashColor: style.dashColor ?? type?.dashColor ?? stroke,
            borderColor: style.borderColor ?? type?.borderColor ?? stroke,
            borderWidth:
              style.borderWidth ??
              type?.borderWidth ??
              type?.strokeWidth ??
              style.strokeWidth ??
              2,
            widthFt: instance.widthFt ?? type?.widthFt ?? null,
          }}
          onChange={(patch) => {
            const { widthFt, ...stylePatch } = patch;
            patchStyle(stylePatch, widthFt !== undefined ? { widthFt } : undefined);
          }}
        />
      ) : (
        <ShapeStyleControls
          values={{
            fill,
            stroke,
            borderColor: style.borderColor ?? type?.borderColor ?? stroke,
            borderWidth:
              style.borderWidth ??
              type?.borderWidth ??
              type?.strokeWidth ??
              style.strokeWidth ??
              2,
            dashed: Boolean(style.dashed ?? type?.dashed ?? false),
          }}
          onChange={(patch) => patchStyle(patch)}
        />
      )}

      {canResize ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            Size (ft)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Width</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className={inputClass}
                value={formatFt2(instance.widthFt ?? type?.widthFt)}
                onChange={(e) => {
                  const w = parseFt2(e.target.value);
                  if (w == null) return;
                  onChange({ ...instance, widthFt: w });
                }}
                onBlur={applySize}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Height</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                className={inputClass}
                value={formatFt2(instance.heightFt ?? type?.heightFt)}
                onChange={(e) => {
                  const h = parseFt2(e.target.value);
                  if (h == null) return;
                  onChange({ ...instance, heightFt: h });
                }}
                onBlur={applySize}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
              />
            </label>
          </div>
          <Button size="sm" variant="outline" onClick={applySize}>
            Apply size
          </Button>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">
          Rotation
        </p>
        <div className="flex flex-wrap gap-1">
          {([-90, -45, -15, 15, 45, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onRotate(d)}
              className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium hover:bg-muted/80"
            >
              {d > 0 ? `+${d}°` : `${d}°`}
            </button>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Angle °</span>
          <input
            type="number"
            step={1}
            className={inputClass}
            value={Math.round(instance.rotationDeg * 10) / 10}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              onSetRotation(v);
            }}
          />
        </label>
      </div>

      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={instance.showLabel}
          onChange={(e) =>
            onChange({ ...instance, showLabel: e.target.checked })
          }
        />
        Show centered label
      </label>
      {instance.showLabel ? (
        <div className="space-y-2 rounded-md border border-border/70 p-2">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={Boolean(
                instance.labelBackgroundColor ?? type?.labelBackgroundColor
              )}
              onChange={(e) =>
                onChange({
                  ...instance,
                  labelBackgroundColor: e.target.checked
                    ? instance.labelBackgroundColor ||
                      type?.labelBackgroundColor ||
                      "#ffffff"
                    : null,
                  labelColor: e.target.checked
                    ? instance.labelColor || type?.labelColor || "#0f172a"
                    : instance.labelColor ?? null,
                })
              }
            />
            Label background fill
          </label>
          {(instance.labelBackgroundColor ?? type?.labelBackgroundColor) ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Label fill
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(
                    instance.labelBackgroundColor ||
                      type?.labelBackgroundColor ||
                      "#ffffff",
                    "#ffffff"
                  )}
                  onChange={(e) =>
                    onChange({
                      ...instance,
                      labelBackgroundColor: e.target.value,
                    })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">
                  Label text
                </span>
                <input
                  type="color"
                  className="h-8 w-full"
                  value={hexColor(
                    instance.labelColor || type?.labelColor || "#0f172a",
                    "#0f172a"
                  )}
                  onChange={(e) =>
                    onChange({
                      ...instance,
                      labelColor: e.target.value,
                    })
                  }
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={Boolean(instance.legend)}
          onChange={(e) => {
            if (e.target.checked) {
              addToLegend();
              return;
            }
            onChange({ ...instance, legend: false });
          }}
        />
        Include in legend
      </label>
    </div>
  );
}
