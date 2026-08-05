"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type maplibregl from "maplibre-gl";

/** Screen position for the parcel popup, anchored above the parcel. */
export function usePopupPosition(
  mapRef: RefObject<maplibregl.Map | null>,
  lat: number | null | undefined,
  lng: number | null | undefined
) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const update = useCallback(() => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) {
      setPos(null);
      return;
    }
    try {
      const point = map.project([lng, lat]);
      const rect = map.getCanvas().getBoundingClientRect();
      setPos({ x: rect.left + point.x, y: rect.top + point.y });
    } catch {
      setPos(null);
    }
  }, [mapRef, lat, lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) {
      setPos(null);
      return undefined;
    }
    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("resize", update);
    window.addEventListener("resize", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("resize", update);
      window.removeEventListener("resize", update);
    };
  }, [update, mapRef, lat, lng]);

  return pos;
}
