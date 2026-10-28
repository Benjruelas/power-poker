"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Feature, Polygon, Position } from "geojson";
import type maplibregl from "maplibre-gl";
import { ArrowLeft } from "lucide-react";
import { SitePlanSelectionToolbar } from "./SitePlanSelectionToolbar";

import {
  HeaderBrand,
  headerActionsClass,
  headerBarClass,
} from "@/components/shared/appHeader";
import {
  createInitialDocument,
  addFreeLabelToDoc,
  addLineInstance,
  addPolygonInstance,
  addPolylineInstance,
  deleteFreeLabel,
  deleteInstance,
  deleteInstances,
  deleteObjectType,
  addViewAlignedDraw,
  createOptionsFromDefaults,
  drawDefaultsFromTool,
  drawDefaultsFromType,
  duplicateInstances,
  expandSelectionIds,
  alignInstances,
  distributeInstances,
  flipInstances,
  groupInstances,
  moveInstances,
  newObjectTypeDraft,
  placeTypeAt,
  promoteInstanceToType,
  reorderInstances,
  rigidAlignUnits,
  rotateInstances,
  selectionIsGroup,
  setInstanceRotation,
  setInstanceSize,
  ungroupInstances,
  upsertObjectType,
  type ZOrderOp,
} from "@/lib/siteplan/documentOps";
import type { ViewAlignedDraw } from "@/lib/siteplan/objects";
import { normalizeSitePlanDocument } from "@/lib/siteplan/defaults";
import {
  exportSitePlanPdf,
  exportSitePlanPng,
} from "@/lib/siteplan/export";
import {
  fallbackParcelRectangle,
  fetchParcelPolygon,
} from "@/lib/siteplan/geometry";
import {
  clearLocalDraft,
  loadLocalDraft,
  saveLocalDraft,
} from "@/lib/siteplan/localDraft";
import {
  distanceFt,
  hitTestInstance,
  resizeInstanceKeepCenter,
} from "@/lib/siteplan/objects";
import type {
  DrawDefaults,
  EditorTool,
  ParcelSquareSide,
  SitePlanDocument,
} from "@/lib/siteplan/types";
import { computeSquareUpBearing } from "@/lib/siteplan/viewport";
import {
  SitePlanSidebar,
} from "./SitePlanSidebar";
import { SitePlanMap, type MapSelection } from "./SitePlanMap";

type Props = {
  lrid: string;
  parcelId: string;
  address: string;
  lat: number;
  lng: number;
  initialPolygon?: Feature<Polygon> | null;
};

type Selection =
  | { kind: "instance"; id: string }
  | { kind: "instances"; ids: string[] }
  | { kind: "label"; id: string }
  | { kind: "type"; id: string }
  | null;

function selectedInstanceIds(sel: Selection): string[] {
  if (!sel) return [];
  if (sel.kind === "instance") return [sel.id];
  if (sel.kind === "instances") return sel.ids;
  return [];
}

function selectionFromIds(ids: string[]): Selection {
  if (ids.length === 0) return null;
  if (ids.length === 1) return { kind: "instance", id: ids[0]! };
  return { kind: "instances", ids };
}

export function SitePlanEditor({
  lrid,
  parcelId,
  address,
  lat,
  lng,
  initialPolygon = null,
}: Props) {
  const [doc, setDoc] = useState<SitePlanDocument | null>(null);
  const [tool, setTool] = useState<EditorTool>("rect");
  const [ortho, setOrtho] = useState(false);
  /** Library type armed for click-to-place. Null = freehand drawing. */
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);
  const [drawDefaults, setDrawDefaults] = useState<DrawDefaults>(() =>
    drawDefaultsFromTool("rect")
  );
  const drawDefaultsRef = useRef(drawDefaults);
  drawDefaultsRef.current = drawDefaults;
  const [selection, setSelection] = useState<Selection>(null);
  const [draftCoords, setDraftCoords] = useState<Position[]>([]);
  const draftCoordsRef = useRef<Position[]>([]);
  draftCoordsRef.current = draftCoords;
  const [measureFt, setMeasureFt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const savedFingerprint = useRef("");
  const selectionRef = useRef(selection);
  const docRef = useRef(doc);
  const editCameraRef = useRef<{
    center: [number, number];
    zoom: number;
    bearing: number;
  } | null>(null);
  selectionRef.current = selection;
  docRef.current = doc;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const draft = loadLocalDraft(lrid, { parcelId, address });
        let serverRaw: unknown = null;
        try {
          const res = await fetch(
            `/api/site-plans?lrid=${encodeURIComponent(lrid)}`
          );
          if (res.ok) {
            const data = (await res.json()) as {
              plan?: { document?: unknown } | null;
            };
            serverRaw = data.plan?.document ?? null;
          }
        } catch {
          /* offline */
        }

        let parcel = initialPolygon;
        if (!parcel) {
          parcel = await fetchParcelPolygon({ lat, lng, lrid });
        }
        if (!parcel) {
          parcel = fallbackParcelRectangle(lng, lat, 5);
        }

        const fallback = {
          lrid,
          parcelId,
          address,
          parcelPolygon: parcel,
        };

        let next: SitePlanDocument;
        if (serverRaw) {
          next = normalizeSitePlanDocument(serverRaw, fallback);
          if (!next.parcelPolygon) next = { ...next, parcelPolygon: parcel };
          savedFingerprint.current = JSON.stringify(next);
        } else if (draft) {
          next = draft.parcelPolygon
            ? draft
            : { ...draft, parcelPolygon: parcel };
          setDirty(true);
        } else {
          next = createInitialDocument({
            lrid,
            parcelId,
            address,
            parcel,
            title: "Site plan",
          });
          setDirty(true);
        }

        if (!cancelled) {
          setDoc(next);
          // Start in freehand draw — don't arm a library type until user picks one
          setActiveTypeId(null);
          setTool("rect");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lrid, parcelId, address, lat, lng, initialPolygon]);

  useEffect(() => {
    if (!doc) return;
    saveLocalDraft(doc);
  }, [doc]);

  const markDirty = useCallback((next: SitePlanDocument) => {
    setDoc(next);
    setDirty(JSON.stringify(next) !== savedFingerprint.current);
  }, []);

  /** Apply a doc mutation against the latest state (avoids lost draws). */
  const mutateDoc = useCallback(
    (fn: (current: SitePlanDocument) => SitePlanDocument) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        setDirty(JSON.stringify(next) !== savedFingerprint.current);
        return next;
      });
    },
    []
  );

  // When inspector edits width/height on an instance, rebuild geometry
  useEffect(() => {
    if (!doc || selection?.kind !== "instance") return;
    const inst = doc.instances.find((i) => i.id === selection.id);
    if (!inst || inst.widthFt == null || inst.heightFt == null) return;
    const type = inst.typeId
      ? doc.objectTypes.find((t) => t.id === inst.typeId)
      : undefined;
    const shape = type?.shape === "circle" ? "circle" : "rectangle";
    if (type?.shape === "line" || type?.shape === "polyline" || type?.shape === "polygon") {
      return;
    }
    // Detect if size fields changed vs geometry — apply resize when user edits numbers
    // Handled via onDocChange from sidebar for size; we need setInstanceSize when width/height change from inspector
  }, [doc, selection]);

  const onDocChange = useCallback(
    (next: SitePlanDocument) => {
      // If selected instance width/height changed in inspector, rebuild geom
      if (selection?.kind === "instance") {
        const prev = doc?.instances.find((i) => i.id === selection.id);
        const cur = next.instances.find((i) => i.id === selection.id);
        if (
          prev &&
          cur &&
          (prev.widthFt !== cur.widthFt || prev.heightFt !== cur.heightFt) &&
          cur.widthFt != null &&
          cur.heightFt != null
        ) {
          const type = cur.typeId
            ? next.objectTypes.find((t) => t.id === cur.typeId)
            : undefined;
          const shape = type?.shape === "circle" ? "circle" : "rectangle";
          if (
            type?.shape !== "line" &&
            type?.shape !== "polyline" &&
            type?.shape !== "polygon"
          ) {
            const resized = resizeInstanceKeepCenter(
              cur,
              cur.widthFt,
              cur.heightFt,
              shape
            );
            next = {
              ...next,
              instances: next.instances.map((i) =>
                i.id === resized.id ? resized : i
              ),
            };
          }
        }
      }
      markDirty(next);
    },
    [doc, markDirty, selection]
  );

  const onSave = useCallback(async () => {
    if (!doc) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/site-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: doc }),
      });
      const data = (await res.json()) as {
        plan?: { document?: SitePlanDocument };
        error?: string;
        backend?: string;
      };
      if (!res.ok) {
        setStatus(data.error || "Save failed — draft kept locally");
        return;
      }
      if (data.plan?.document) {
        const normalized = normalizeSitePlanDocument(data.plan.document, {
          lrid,
          parcelId,
          address,
        });
        setDoc(normalized);
        savedFingerprint.current = JSON.stringify(normalized);
      } else {
        savedFingerprint.current = JSON.stringify(doc);
      }
      setDirty(false);
      clearLocalDraft(lrid);
      setStatus(`Saved (${data.backend ?? "ok"})`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [doc, lrid, parcelId, address]);

  const waitIdle = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    await new Promise<void>((resolve) => {
      map.once("idle", () => resolve());
      // If already idle, kick a tiny move so idle still fires once
      if (!map.isMoving()) {
        requestAnimationFrame(() => {
          if (!map.isMoving()) resolve();
        });
      }
    });
  }, []);

  const applyExportCamera = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !doc) return;
    const c = map.getCenter();
    editCameraRef.current = {
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
    };
    const zoom = doc.view.exportZoom;
    if (zoom == null) return;
    const center = doc.view.exportCenter ?? ([c.lng, c.lat] as [number, number]);
    map.jumpTo({
      center,
      zoom,
      bearing: doc.view.bearingDeg,
    });
    await waitIdle();
  }, [doc, waitIdle]);

  const restoreEditCamera = useCallback(async () => {
    const map = mapRef.current;
    const cam = editCameraRef.current;
    if (!map || !cam) return;
    map.jumpTo(cam);
    editCameraRef.current = null;
    await waitIdle();
  }, [waitIdle]);

  const onExportPdf = useCallback(async () => {
    const map = mapRef.current;
    const canvas = map?.getCanvas();
    if (!canvas || !doc || !map) return;
    setStatus("Exporting PDF…");
    try {
      await applyExportCamera();
      await exportSitePlanPdf(canvas, doc, undefined, map);
      await restoreEditCamera();
      setStatus("PDF exported");
    } catch (e) {
      await restoreEditCamera();
      setStatus(e instanceof Error ? e.message : "PDF export failed");
    }
  }, [doc, applyExportCamera, restoreEditCamera]);

  const onExportPng = useCallback(async () => {
    const map = mapRef.current;
    const canvas = map?.getCanvas();
    if (!canvas || !doc || !map) return;
    setStatus("Exporting PNG…");
    try {
      await applyExportCamera();
      await exportSitePlanPng(canvas, doc, undefined, map);
      await restoreEditCamera();
      setStatus("PNG exported");
    } catch (e) {
      await restoreEditCamera();
      setStatus(e instanceof Error ? e.message : "PNG export failed");
    }
  }, [doc, applyExportCamera, restoreEditCamera]);

  const onSquareUp = useCallback(
    (side: ParcelSquareSide) => {
      if (!doc?.parcelPolygon) {
        setStatus("No parcel polygon to square");
        return;
      }
      const result = computeSquareUpBearing(doc.parcelPolygon, side);
      if (!result) {
        setStatus("Could not find a parcel edge for that side");
        return;
      }
      const next: SitePlanDocument = {
        ...doc,
        view: {
          ...doc.view,
          squareSide: side,
          bearingDeg: result.bearingDeg,
        },
        updatedAt: new Date().toISOString(),
      };
      markDirty(next);
      const map = mapRef.current;
      if (map) {
        map.easeTo({
          bearing: result.bearingDeg,
          center: result.center as [number, number],
          duration: 600,
        });
      }
    },
    [doc, markDirty]
  );

  const onResetNorth = useCallback(() => {
    if (!doc) return;
    markDirty({
      ...doc,
      view: { ...doc.view, squareSide: null, bearingDeg: 0 },
      updatedAt: new Date().toISOString(),
    });
    mapRef.current?.easeTo({ bearing: 0, duration: 500 });
  }, [doc, markDirty]);

  const onCaptureExportView = useCallback(() => {
    const map = mapRef.current;
    if (!map || !doc) return;
    const c = map.getCenter();
    markDirty({
      ...doc,
      view: {
        ...doc.view,
        exportZoom: Math.round(map.getZoom() * 100) / 100,
        exportCenter: [c.lng, c.lat],
        bearingDeg: map.getBearing(),
      },
      updatedAt: new Date().toISOString(),
    });
    setStatus(
      `Export view saved · z${map.getZoom().toFixed(2)} · ${Math.round(map.getBearing())}°`
    );
  }, [doc, markDirty]);

  const onGoToExportView = useCallback(() => {
    const map = mapRef.current;
    if (!map || !doc || doc.view.exportZoom == null) return;
    const center = doc.view.exportCenter ?? map.getCenter().toArray();
    map.easeTo({
      center: center as [number, number],
      zoom: doc.view.exportZoom,
      bearing: doc.view.bearingDeg,
      duration: 500,
    });
  }, [doc]);

  const onPlace = useCallback(
    (placeLng: number, placeLat: number) => {
      if (!activeTypeId) {
        setStatus("Pick a type from the library to place");
        return;
      }
      // Keep placing — don't leave a selection stuck on
      setSelection(null);
      // Level with the current view (same as freehand draw when map is rotated)
      const bearing =
        mapRef.current?.getBearing() ?? docRef.current?.view.bearingDeg ?? 0;
      const opts = createOptionsFromDefaults(drawDefaultsRef.current, {
        freehandStyle: true,
      });
      mutateDoc((d) =>
        placeTypeAt(d, activeTypeId, placeLng, placeLat, bearing, opts)
      );
    },
    [activeTypeId, mutateDoc]
  );

  const onDrawComplete = useCallback(
    (draw: ViewAlignedDraw) => {
      setSelection(null);
      const opts = createOptionsFromDefaults(drawDefaultsRef.current, {
        freehandStyle: true,
        omitSize: true,
      });
      mutateDoc((d) => addViewAlignedDraw(d, draw, null, opts));
    },
    [mutateDoc]
  );

  const onVertex = useCallback(
    (pos: Position, finish: boolean) => {
      if (!finish) {
        setDraftCoords((c) => [...c, pos]);
        return;
      }
      // Side effects must not live inside setState (Strict Mode double-invokes updaters
      // and click+dblclick would commit the same line twice).
      const coords = [...draftCoordsRef.current, pos];
      draftCoordsRef.current = [];
      setDraftCoords([]);
      setSelection(null);
      const typeId = activeTypeId;
      const opts = createOptionsFromDefaults(drawDefaultsRef.current, {
        freehandStyle: true,
        omitSize: tool === "polygon",
      });
      if (tool === "line") {
        if (coords.length >= 2) {
          mutateDoc((d) =>
            addLineInstance(
              d,
              typeId,
              coords[coords.length - 2]!,
              coords[coords.length - 1]!,
              opts
            )
          );
        }
      } else if (tool === "polyline") {
        if (coords.length >= 2) {
          mutateDoc((d) => addPolylineInstance(d, typeId, coords, opts));
        }
      } else if (tool === "polygon") {
        if (coords.length >= 3) {
          mutateDoc((d) => addPolygonInstance(d, typeId, coords, opts));
        }
      }
    },
    [tool, activeTypeId, mutateDoc]
  );

  const onPromoteToType = useCallback(() => {
    if (!doc || selection?.kind !== "instance") return;
    const inst = doc.instances.find((i) => i.id === selection.id);
    const defaultName =
      inst?.legendTitle?.trim() ||
      inst?.labelOverride?.trim() ||
      "Saved object";
    const name = window.prompt("Save as object type named:", defaultName);
    if (name == null) return;
    const result = promoteInstanceToType(doc, selection.id, name);
    if (!result) return;
    markDirty(result.doc);
    setActiveTypeId(result.typeId);
    setSelection({ kind: "type", id: result.typeId });
    setStatus(`Saved type “${name.trim() || "Saved object"}”`);
  }, [doc, selection, markDirty]);

  const onLabelPlace = useCallback(
    (labelLng: number, labelLat: number) => {
      if (!doc) return;
      const text = window.prompt("Label text", "Label");
      if (text == null || !text.trim()) return;
      markDirty(addFreeLabelToDoc(doc, text.trim(), [labelLng, labelLat]));
    },
    [doc, markDirty]
  );

  const onMeasure = useCallback((a: Position, b: Position) => {
    setMeasureFt(distanceFt(a, b));
  }, []);

  const onDeleteAt = useCallback(
    (dLng: number, dLat: number) => {
      if (!doc) return;
      // Prefer selection hit via map — reuse find by checking free labels / instances
      const mapSel = selection;
      void mapSel;
      // Hit-test roughly: delete selected if any, else nearest via map click path
      for (const lb of doc.freeLabels) {
        if (distanceFt([dLng, dLat], lb.position) < 30) {
          markDirty(deleteFreeLabel(doc, lb.id));
          setSelection(null);
          return;
        }
      }
      const hit = hitTestInstance(doc.instances, dLng, dLat, 25);
      if (hit) {
        markDirty(deleteInstance(doc, hit.id));
        setSelection(null);
      }
    },
    [doc, markDirty, selection]
  );

  const onMoveInstance = useCallback(
    (id: string, dx: number, dy: number) => {
      if (!doc) return;
      const ids = selectedInstanceIds(selection);
      markDirty(moveInstances(doc, ids.length ? ids : [id], dx, dy));
    },
    [doc, markDirty, selection]
  );

  const onMoveSelection = useCallback(
    (dx: number, dy: number) => {
      if (!doc) return;
      const ids = selectedInstanceIds(selection);
      if (!ids.length) return;
      markDirty(moveInstances(doc, ids, dx, dy));
    },
    [doc, markDirty, selection]
  );

  const onDeleteSelection = useCallback(() => {
    if (!doc || !selection) return;
    const ids = selectedInstanceIds(selection);
    if (ids.length) {
      markDirty(deleteInstances(doc, ids));
    } else if (selection.kind === "label") {
      markDirty(deleteFreeLabel(doc, selection.id));
    } else if (selection.kind === "type") {
      markDirty(deleteObjectType(doc, selection.id));
      if (activeTypeId === selection.id) {
        setActiveTypeId(doc.objectTypes.find((t) => t.id !== selection.id)?.id ?? null);
      }
    }
    setSelection(null);
  }, [doc, selection, markDirty, activeTypeId]);

  const onDuplicateSelection = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (!ids.length) return;
    const result = duplicateInstances(doc, ids, 25);
    if (!result) return;
    markDirty(result.doc);
    setSelection(selectionFromIds(result.newIds));
    setTool("select");
    setStatus(result.newIds.length > 1 ? "Duplicated group" : "Duplicated");
  }, [doc, selection, markDirty]);

  const onRotateSelection = useCallback(
    (deltaDeg: number) => {
      if (!doc) return;
      const ids = selectedInstanceIds(selection);
      if (!ids.length) return;
      markDirty(rotateInstances(doc, ids, deltaDeg));
    },
    [doc, selection, markDirty]
  );

  const onFlipHorizontal = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (!ids.length) return;
    markDirty(flipInstances(doc, ids, "horizontal"));
  }, [doc, selection, markDirty]);

  const onFlipVertical = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (!ids.length) return;
    markDirty(flipInstances(doc, ids, "vertical"));
  }, [doc, selection, markDirty]);

  const onGroupSelection = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    const result = groupInstances(doc, ids);
    if (!result) {
      setStatus("Select 2+ objects to group (Shift+click)");
      return;
    }
    markDirty(result.doc);
    setSelection(selectionFromIds(ids));
    setStatus(`Grouped ${ids.length} objects`);
  }, [doc, selection, markDirty]);

  const onUngroupSelection = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (!ids.length) return;
    markDirty(ungroupInstances(doc, ids));
    setStatus("Ungrouped");
  }, [doc, selection, markDirty]);

  const onZOrder = useCallback(
    (op: ZOrderOp) => {
      if (!doc) return;
      const ids = selectedInstanceIds(selection);
      if (!ids.length) return;
      const next = reorderInstances(doc, ids, op);
      if (next === doc) return;
      markDirty(next);
      setStatus(
        op === "front"
          ? "Brought to front"
          : op === "back"
            ? "Sent to back"
            : op === "forward"
              ? "Brought forward"
              : "Sent backward"
      );
    },
    [doc, selection, markDirty]
  );

  const onAlignHorizontal = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (rigidAlignUnits(doc, ids).length < 2) return;
    markDirty(
      alignInstances(doc, ids, "horizontal", mapRef.current)
    );
  }, [doc, selection, markDirty]);

  const onAlignVertical = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (rigidAlignUnits(doc, ids).length < 2) return;
    markDirty(alignInstances(doc, ids, "vertical", mapRef.current));
  }, [doc, selection, markDirty]);

  const onDistributeHorizontal = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (rigidAlignUnits(doc, ids).length < 3) return;
    markDirty(
      distributeInstances(doc, ids, "horizontal", mapRef.current)
    );
  }, [doc, selection, markDirty]);

  const onDistributeVertical = useCallback(() => {
    if (!doc) return;
    const ids = selectedInstanceIds(selection);
    if (rigidAlignUnits(doc, ids).length < 3) return;
    markDirty(
      distributeInstances(doc, ids, "vertical", mapRef.current)
    );
  }, [doc, selection, markDirty]);

  const onSetSelectionRotation = useCallback(
    (deg: number) => {
      if (!doc || selection?.kind !== "instance") return;
      markDirty(setInstanceRotation(doc, selection.id, deg));
    },
    [doc, selection, markDirty]
  );

  const onResizeSelection = useCallback(
    (widthFt: number, heightFt: number) => {
      if (!doc || selection?.kind !== "instance") return;
      markDirty(setInstanceSize(doc, selection.id, widthFt, heightFt));
    },
    [doc, selection, markDirty]
  );

  const onCreateType = useCallback(() => {
    if (!doc) return;
    const t = newObjectTypeDraft({ name: "New object" });
    markDirty(upsertObjectType(doc, t));
    setActiveTypeId(t.id);
    setSelection({ kind: "type", id: t.id });
    setTool("place");
  }, [doc, markDirty]);

  const onMapSelect = useCallback(
    (
      sel: MapSelection,
      shiftKey = false,
      isolateMember = false,
      pickUnder = false
    ) => {
      if (!doc) {
        setSelection(sel);
        if (sel) setTool("select");
        return;
      }

      if (sel?.kind === "label") {
        setSelection(sel);
        setTool("select");
        return;
      }

      if (!sel) {
        if (!shiftKey) setSelection(null);
        return;
      }

      // Instance hit — expand to group membership (unless isolating / picking under)
      const hitId =
        sel.kind === "instance"
          ? sel.id
          : sel.kind === "instances"
            ? sel.ids[0]
            : null;
      if (!hitId) {
        setSelection(sel as Selection);
        setTool("select");
        return;
      }

      // Prefer live ref so the first click of a double-click is already applied
      const currentIds = selectedInstanceIds(selectionRef.current);
      const expanded = expandSelectionIds(doc, hitId);

      const applySelection = (next: Selection) => {
        selectionRef.current = next;
        setSelection(next);
      };

      // Alt/Option: select this stack member only (for grouping stacked items)
      if (pickUnder && !isolateMember) {
        if (shiftKey) {
          const current = new Set(currentIds);
          if (current.has(hitId)) current.delete(hitId);
          else current.add(hitId);
          applySelection(selectionFromIds([...current]));
        } else {
          applySelection({ kind: "instance", id: hitId });
        }
        setTool("select");
        setStatus("Stacked item · Alt+click cycles · Shift adds");
        return;
      }

      // Double-click: drill into one member while the group stays intact
      if (
        isolateMember &&
        !shiftKey &&
        expanded.length > 1 &&
        currentIds.length > 1 &&
        currentIds.includes(hitId)
      ) {
        applySelection({ kind: "instance", id: hitId });
        setTool("select");
        setStatus("Editing one item · group unchanged");
        return;
      }

      if (shiftKey) {
        const current = new Set(currentIds);
        const allInExpanded = expanded.every((id) => current.has(id));
        if (allInExpanded) {
          for (const id of expanded) current.delete(id);
        } else {
          for (const id of expanded) current.add(id);
        }
        applySelection(selectionFromIds([...current]));
      } else {
        applySelection(selectionFromIds(expanded));
      }
      setTool("select");
    },
    [doc]
  );

  const onToolChange = useCallback((t: EditorTool) => {
    setTool(t);
    setDraftCoords([]);
    if (t !== "measure") setMeasureFt(null);
    // Tool icons = freehand / clear stuck selection
    if (
      t === "rect" ||
      t === "circle" ||
      t === "line" ||
      t === "polyline" ||
      t === "polygon"
    ) {
      setSelection(null);
      setActiveTypeId(null);
      setDrawDefaults(drawDefaultsFromTool(t));
    }
  }, []);

  const onPickLibraryType = useCallback(
    (typeId: string) => {
      const t = doc?.objectTypes.find((ot) => ot.id === typeId);
      setActiveTypeId(typeId);
      setSelection(null);
      setDraftCoords([]);
      if (t) setDrawDefaults(drawDefaultsFromType(t));
      if (t?.shape === "line" || t?.shape === "polyline") {
        setTool("polyline");
        setStatus(`Draw “${t.name}” — click vertices, Enter to finish`);
      } else if (t?.shape === "polygon") {
        setTool("polygon");
        setStatus(`Draw “${t.name}” — click vertices, Enter to finish`);
      } else {
        setTool("place");
        setStatus(
          t ? `Placing “${t.name}” — click the map` : "Click map to place"
        );
      }
    },
    [doc]
  );

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = selectionRef.current;
      const currentDoc = docRef.current;
      if (!currentDoc) return;

      const ids = selectedInstanceIds(sel);

      if (mod && e.key.toLowerCase() === "d") {
        if (!ids.length) return;
        e.preventDefault();
        const result = duplicateInstances(currentDoc, ids, 25);
        if (!result) return;
        markDirty(result.doc);
        setSelection(selectionFromIds(result.newIds));
        setTool("select");
        setStatus("Duplicated");
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) {
          if (!ids.length) return;
          markDirty(ungroupInstances(currentDoc, ids));
          setStatus("Ungrouped");
        } else {
          const result = groupInstances(currentDoc, ids);
          if (!result) {
            setStatus("Select 2+ objects to group (Shift+click)");
            return;
          }
          markDirty(result.doc);
          setSelection(selectionFromIds(ids));
          setStatus(`Grouped ${ids.length} objects`);
        }
        return;
      }
      if (e.key.toLowerCase() === "h" && !mod) {
        if (!ids.length) return;
        e.preventDefault();
        markDirty(flipInstances(currentDoc, ids, "horizontal"));
        return;
      }
      if (e.key.toLowerCase() === "v" && !mod) {
        if (!ids.length) return;
        e.preventDefault();
        markDirty(flipInstances(currentDoc, ids, "vertical"));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!sel) return;
        e.preventDefault();
        if (ids.length) {
          markDirty(deleteInstances(currentDoc, ids));
          setSelection(null);
        } else if (sel.kind === "label") {
          markDirty(deleteFreeLabel(currentDoc, sel.id));
          setSelection(null);
        }
        return;
      }
      if (e.key === "[" || e.key === ",") {
        if (!ids.length) return;
        e.preventDefault();
        markDirty(rotateInstances(currentDoc, ids, -15));
        return;
      }
      if (e.key === "]" || e.key === ".") {
        if (!ids.length) return;
        e.preventDefault();
        markDirty(rotateInstances(currentDoc, ids, 15));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markDirty]);

  if (loading || !doc) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading site plan…
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className={headerBarClass}>
        <HeaderBrand subtitle="Site plan drawer" compactOnMobile />
        <div className={headerActionsClass}>
          {status ? (
            <span className="hidden max-w-[200px] truncate text-xs text-neutral-400 sm:inline">
              {status}
            </span>
          ) : null}
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-neutral-600 bg-neutral-900 px-3 text-xs font-semibold text-white hover:border-white"
          >
            <ArrowLeft className="size-3.5" />
            Map
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="max-h-[48%] shrink-0 overflow-hidden border-b lg:max-h-none lg:h-full lg:w-[380px] lg:border-b-0">
          <SitePlanSidebar
            doc={doc}
            tool={tool}
            ortho={ortho}
            activeTypeId={activeTypeId}
            selection={selection}
            measureFt={measureFt}
            liveZoom={liveZoom}
            saving={saving}
            dirty={dirty}
            onToolChange={onToolChange}
            onOrthoChange={setOrtho}
            onActiveTypeChange={setActiveTypeId}
            onPickLibraryType={onPickLibraryType}
            onSelectionChange={setSelection}
            onDocChange={onDocChange}
            onSave={onSave}
            onExportPdf={onExportPdf}
            onExportPng={onExportPng}
            onCreateType={onCreateType}
            onDeleteSelection={onDeleteSelection}
            onSquareUp={onSquareUp}
            onResetNorth={onResetNorth}
            onCaptureExportView={onCaptureExportView}
            onGoToExportView={onGoToExportView}
            onRotateSelection={onRotateSelection}
            onSetSelectionRotation={onSetSelectionRotation}
            onResizeSelection={onResizeSelection}
            onDuplicateSelection={onDuplicateSelection}
            onPromoteToType={onPromoteToType}
            drawDefaults={drawDefaults}
            onDrawDefaultsChange={setDrawDefaults}
          />
        </div>
        <div className="relative min-h-0 flex-1">
          <SitePlanMap
            doc={doc}
            tool={tool}
            ortho={ortho}
            unlockSize={false}
            activeTypeId={activeTypeId}
            activeShape={
              tool === "circle"
                ? "circle"
                : tool === "rect"
                  ? "rectangle"
                  : activeTypeId
                    ? (doc.objectTypes.find((t) => t.id === activeTypeId)
                        ?.shape ?? null)
                    : null
            }
            selection={
              selection?.kind === "instance" ||
              selection?.kind === "instances" ||
              selection?.kind === "label"
                ? selection
                : null
            }
            draftCoords={draftCoords}
            onMapReady={(m) => {
              mapRef.current = m;
              setMapReady(true);
              setLiveZoom(m.getZoom());
              m.on("zoom", () => setLiveZoom(m.getZoom()));
              m.on("moveend", () => setLiveZoom(m.getZoom()));
            }}
            onSelect={onMapSelect}
            onPlace={onPlace}
            onDrawComplete={onDrawComplete}
            onVertex={onVertex}
            onLabelPlace={onLabelPlace}
            onMeasure={onMeasure}
            onDeleteAt={onDeleteAt}
            onMoveInstance={onMoveInstance}
          />
          <SitePlanSelectionToolbar
            map={mapReady ? mapRef.current : null}
            instances={selectedInstanceIds(selection)
              .map((id) => doc.instances.find((i) => i.id === id))
              .filter(Boolean) as NonNullable<typeof doc.instances>[number][]}
            canGroup={
              selectedInstanceIds(selection).length >= 2 &&
              !selectionIsGroup(doc, selectedInstanceIds(selection))
            }
            isGroup={selectionIsGroup(doc, selectedInstanceIds(selection))}
            alignUnitCount={rigidAlignUnits(
              doc,
              selectedInstanceIds(selection)
            ).length}
            onRotate={onRotateSelection}
            onFlipHorizontal={onFlipHorizontal}
            onFlipVertical={onFlipVertical}
            onAlignHorizontal={onAlignHorizontal}
            onAlignVertical={onAlignVertical}
            onDistributeHorizontal={onDistributeHorizontal}
            onDistributeVertical={onDistributeVertical}
            onGroup={onGroupSelection}
            onUngroup={onUngroupSelection}
            onBringForward={() => onZOrder("forward")}
            onSendBackward={() => onZOrder("backward")}
            onBringToFront={() => onZOrder("front")}
            onSendToBack={() => onZOrder("back")}
            onDuplicate={onDuplicateSelection}
            onDelete={onDeleteSelection}
            onMove={onMoveSelection}
          />
          {draftCoords.length > 0 ? (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/90 px-2 py-1 text-xs shadow">
              {draftCoords.length} vertex
              {draftCoords.length === 1 ? "" : "es"}
              {tool === "line"
                ? " · click end point"
                : " · double-click or Enter to finish"}
              {" · Hold Shift for 90°"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
