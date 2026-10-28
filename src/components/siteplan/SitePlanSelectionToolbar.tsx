"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Geometry, Position } from "geojson";
import type maplibregl from "maplibre-gl";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  BetweenHorizonalStart,
  BetweenVerticalStart,
  BringToFront,
  CopyPlus,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Move,
  MoveDown,
  MoveUp,
  RotateCcw,
  RotateCw,
  SendToBack,
  Trash2,
  Ungroup,
} from "lucide-react";

import type { SitePlanInstance } from "@/lib/siteplan/types";
import { cn } from "@/lib/utils";

type Props = {
  map: maplibregl.Map | null;
  /** All selected instances (1+). Toolbar anchors above their combined box. */
  instances: SitePlanInstance[];
  /** 2+ selected that are not yet one group — show Group. */
  canGroup: boolean;
  /** Selection is an existing group — show Ungroup. */
  isGroup: boolean;
  /** Rigid align/distribute units (nested groups count as one each). */
  alignUnitCount: number;
  onRotate: (deltaDeg: number) => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onAlignHorizontal: () => void;
  onAlignVertical: () => void;
  onDistributeHorizontal: () => void;
  onDistributeVertical: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dxLng: number, dyLat: number) => void;
};

type ScreenPos = { x: number; y: number };

function collectPositions(geometry: Geometry): Position[] {
  if (geometry.type === "Point") return [geometry.coordinates as Position];
  if (geometry.type === "LineString") {
    return geometry.coordinates as Position[];
  }
  if (geometry.type === "Polygon") {
    return (geometry.coordinates[0] ?? []) as Position[];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates.flat(2) as Position[]) ?? [];
  }
  return [];
}

function projectAboveObjects(
  map: maplibregl.Map,
  instances: SitePlanInstance[],
  gapPx = 28
): ScreenPos | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let any = false;
  for (const inst of instances) {
    for (const c of collectPositions(inst.geometry)) {
      const p = map.project([c[0]!, c[1]!]);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      any = true;
    }
  }
  if (!any) return null;
  return {
    x: (minX + maxX) / 2,
    y: minY - gapPx,
  };
}

export function SitePlanSelectionToolbar({
  map,
  instances,
  canGroup,
  isGroup,
  alignUnitCount,
  onRotate,
  onFlipHorizontal,
  onFlipVertical,
  onAlignHorizontal,
  onAlignVertical,
  onDistributeHorizontal,
  onDistributeVertical,
  onGroup,
  onUngroup,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onDelete,
  onMove,
}: Props) {
  const [pos, setPos] = useState<ScreenPos | null>(null);
  const [dragging, setDragging] = useState(false);
  const instancesRef = useRef(instances);
  const lastLngLatRef = useRef<{ lng: number; lat: number } | null>(null);
  instancesRef.current = instances;

  const updatePos = useCallback(() => {
    const list = instancesRef.current;
    if (!map || !list.length) {
      setPos(null);
      return;
    }
    setPos(projectAboveObjects(map, list));
  }, [map]);

  useEffect(() => {
    if (!map || !instances.length) {
      setPos(null);
      return;
    }
    updatePos();
    map.on("move", updatePos);
    map.on("zoom", updatePos);
    map.on("rotate", updatePos);
    map.on("pitch", updatePos);
    map.on("resize", updatePos);
    return () => {
      map.off("move", updatePos);
      map.off("zoom", updatePos);
      map.off("rotate", updatePos);
      map.off("pitch", updatePos);
      map.off("resize", updatePos);
    };
  }, [map, instances.map((i) => i.id).join(","), updatePos]);

  useEffect(() => {
    updatePos();
  }, [updatePos, instances]);

  const onMovePointerDown = (e: React.PointerEvent) => {
    if (!map || !instances.length) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    map.dragPan.disable();
    setDragging(true);
    const rect = map.getCanvas().getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ll = map.unproject([x, y]);
    lastLngLatRef.current = { lng: ll.lng, lat: ll.lat };
  };

  const onMovePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !map || !instances.length || !lastLngLatRef.current) return;
    e.preventDefault();
    const rect = map.getCanvas().getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ll = map.unproject([x, y]);
    const dx = ll.lng - lastLngLatRef.current.lng;
    const dy = ll.lat - lastLngLatRef.current.lat;
    if (dx === 0 && dy === 0) return;
    onMove(dx, dy);
    lastLngLatRef.current = { lng: ll.lng, lat: ll.lat };
  };

  const onMovePointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    map?.dragPan.enable();
    setDragging(false);
    lastLngLatRef.current = null;
  };

  if (!instances.length || !pos) return null;

  const btn =
    "inline-flex size-8 items-center justify-center rounded-md text-neutral-800 transition hover:bg-neutral-100 active:bg-neutral-200 disabled:pointer-events-none disabled:opacity-35";

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-0.5 rounded-xl border border-neutral-200/80",
          "bg-white/95 px-1 py-1 shadow-lg backdrop-blur-sm",
          dragging && "ring-2 ring-sky-400"
        )}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={cn(
            btn,
            "cursor-grab active:cursor-grabbing",
            dragging && "bg-sky-100 text-sky-800"
          )}
          title="Hold to drag"
          onPointerDown={onMovePointerDown}
          onPointerMove={onMovePointerMove}
          onPointerUp={onMovePointerUp}
          onPointerCancel={onMovePointerUp}
        >
          <Move className="size-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-neutral-200" />
        <button
          type="button"
          className={btn}
          title="Rotate −15°"
          onClick={() => onRotate(-15)}
        >
          <RotateCcw className="size-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          title="Rotate +15°"
          onClick={() => onRotate(15)}
        >
          <RotateCw className="size-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          title="Flip horizontal"
          onClick={onFlipHorizontal}
        >
          <FlipHorizontal2 className="size-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          title="Flip vertical"
          onClick={onFlipVertical}
        >
          <FlipVertical2 className="size-3.5" />
        </button>
        {canGroup || isGroup || alignUnitCount >= 2 ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-neutral-200" />
            {canGroup ? (
              <button
                type="button"
                className={btn}
                title="Group (⌘/Ctrl+G)"
                onClick={onGroup}
              >
                <Group className="size-3.5" />
              </button>
            ) : null}
            {isGroup ? (
              <button
                type="button"
                className={btn}
                title="Ungroup (⌘/Ctrl+Shift+G)"
                onClick={onUngroup}
              >
                <Ungroup className="size-3.5" />
              </button>
            ) : null}
            {alignUnitCount >= 2 ? (
              <>
                <span className="mx-0.5 h-4 w-px bg-neutral-200" />
                <button
                  type="button"
                  className={btn}
                  title="Align groups / items horizontally"
                  onClick={onAlignHorizontal}
                >
                  <AlignCenterHorizontal className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={btn}
                  title="Align groups / items vertically"
                  onClick={onAlignVertical}
                >
                  <AlignCenterVertical className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={btn}
                  title="Space groups / items evenly horizontally"
                  disabled={alignUnitCount < 3}
                  onClick={onDistributeHorizontal}
                >
                  <BetweenVerticalStart className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={btn}
                  title="Space groups / items evenly vertically"
                  disabled={alignUnitCount < 3}
                  onClick={onDistributeVertical}
                >
                  <BetweenHorizonalStart className="size-3.5" />
                </button>
              </>
            ) : null}
          </>
        ) : null}
        <span className="mx-0.5 h-4 w-px bg-neutral-200" />
        <button
          type="button"
          className={btn}
          title="Bring to front"
          onClick={onBringToFront}
        >
          <BringToFront className="size-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          title="Bring forward"
          onClick={onBringForward}
        >
          <MoveUp className="size-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          title="Send backward"
          onClick={onSendBackward}
        >
          <MoveDown className="size-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          title="Send to back"
          onClick={onSendToBack}
        >
          <SendToBack className="size-3.5" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-neutral-200" />
        <button
          type="button"
          className={btn}
          title="Duplicate (⌘/Ctrl+D)"
          onClick={onDuplicate}
        >
          <CopyPlus className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(btn, "text-red-600 hover:bg-red-50 hover:text-red-700")}
          title="Delete"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div
        className="mx-auto mt-0.5 h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-white/95 drop-shadow-sm"
        aria-hidden
      />
    </div>
  );
}
