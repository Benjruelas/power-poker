"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { FeatureCollection, Point } from "geojson";
import { BatteryCharging, ListFilter, MapPinned, Info, LandPlot } from "lucide-react";

import { FilterSidebar } from "@/components/filters/FilterSidebar";
import { MobileFilters } from "@/components/filters/MobileFilters";
import { MapLegend } from "@/components/map/MapLegend";
import { AboutPanel } from "@/components/panels/AboutPanel";
import { DetailPanel } from "@/components/panels/DetailPanel";
import { ParcelDetailsPanel } from "@/components/panels/ParcelDetailsPanel";
import { ShortlistPanel } from "@/components/panels/ShortlistPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterSubstations } from "@/lib/geo";
import { useAppStore, type PanelTab } from "@/lib/store";
import type {
  DataMeta,
  FiberRouteProperties,
  QueueProjectProperties,
  SubstationProperties,
  TransmissionLineProperties,
} from "@/lib/types";

const BessMap = dynamic(
  () => import("@/components/map/BessMap").then((m) => m.BessMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

export function AppShell() {
  const [substations, setSubstations] = useState<FeatureCollection<
    Point,
    SubstationProperties
  > | null>(null);
  const [projects, setProjects] = useState<FeatureCollection<
    Point,
    QueueProjectProperties
  > | null>(null);
  const [lines, setLines] = useState<FeatureCollection<
    GeoJSON.LineString | GeoJSON.MultiLineString,
    TransmissionLineProperties
  > | null>(null);
  const [fiberRoutes, setFiberRoutes] = useState<FeatureCollection<
    GeoJSON.LineString | GeoJSON.MultiLineString,
    FiberRouteProperties
  > | null>(null);
  const [counties, setCounties] = useState<FeatureCollection | null>(null);
  const [countyList, setCountyList] = useState<string[]>([]);
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filters = useAppStore((s) => s.filters);
  const panelTab = useAppStore((s) => s.panelTab);
  const setPanelTab = useAppStore((s) => s.setPanelTab);
  const setSelectedSubstation = useAppStore((s) => s.setSelectedSubstation);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          subsRes,
          projRes,
          linesRes,
          countiesRes,
          listRes,
          metaRes,
        ] = await Promise.all([
          fetch("/data/substations.geojson"),
          fetch("/data/projects.geojson"),
          fetch("/data/lines.geojson"),
          fetch("/data/counties.geojson"),
          fetch("/data/counties-list.json"),
          fetch("/data/meta.json"),
        ]);
        if (!subsRes.ok) {
          throw new Error(
            "Data snapshot missing. Run `npm run data` then restart the dev server."
          );
        }
        const [subs, proj, ln, co, list, m] = await Promise.all([
          subsRes.json(),
          projRes.json(),
          linesRes.json(),
          countiesRes.json(),
          listRes.json(),
          metaRes.json(),
        ]);
        if (cancelled) return;
        setSubstations(subs);
        setProjects(proj);
        setLines(ln);
        setCounties(co);
        setCountyList(list);
        setMeta(m);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-load fiber routes only when the layer is enabled
  useEffect(() => {
    if (!filters.showFiberRoutes || fiberRoutes) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/data/fiber-routes.geojson");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFiberRoutes(data);
      } catch {
        /* optional layer — ignore missing snapshot */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.showFiberRoutes, fiberRoutes]);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const feat = substations?.features.find((f) => f.properties.id === id);
      if (feat) setSelectedSubstation(feat.properties);
    };
    window.addEventListener("bess:select-substation", handler);
    return () => window.removeEventListener("bess:select-substation", handler);
  }, [substations, setSelectedSubstation]);

  const visibleCount = useMemo(
    () => filterSubstations(substations, filters).features.length,
    [substations, filters]
  );

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <BatteryCharging className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">
              Power Poker
            </h1>
            <p className="text-[11px] text-muted-foreground">
              US ISOs · develop-to-sell screening
              {meta ? ` · ${meta.sourceReport}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MobileFilters
            counties={countyList}
            visibleSubCount={visibleCount}
            totalSubCount={substations?.features.length ?? 0}
          />
          {loading && (
            <span className="text-xs text-muted-foreground">Loading data…</span>
          )}
          {error && (
            <span className="max-w-md truncate text-xs text-destructive">
              {error}
            </span>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_1fr_360px]">
        <aside className="hidden min-h-0 md:block">
          <FilterSidebar
            counties={countyList}
            visibleSubCount={visibleCount}
            totalSubCount={substations?.features.length ?? 0}
          />
        </aside>

        <main className="relative min-h-[50vh] overflow-hidden md:min-h-0">
          {!error && (
            <BessMap
              substations={substations}
              projects={projects}
              lines={lines}
              fiberRoutes={fiberRoutes}
              counties={counties}
            />
          )}
          {error && (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {error}
            </div>
          )}
          <MapLegend
            substationCount={visibleCount}
            projectCount={
              projects
                ? projects.features.filter((f) => {
                    const p = f.properties;
                    return (
                      filters.fuels.includes(p.fuel) &&
                      filters.stages.includes(p.funnelStage) &&
                      p.capacityMw >= filters.minProjectMw &&
                      p.capacityMw <= filters.maxProjectMw
                    );
                  }).length
                : 0
            }
          />
        </main>

        <aside className="min-h-0 border-t md:border-t-0 md:border-l">
          <Tabs
            value={panelTab}
            onValueChange={(v) =>
              setPanelTab((v as PanelTab) ?? "about")
            }
            className="flex h-full flex-col"
          >
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-2">
              <TabsTrigger value="details" className="gap-1.5">
                <MapPinned className="size-3.5" />
                Site
              </TabsTrigger>
              <TabsTrigger value="parcel" className="gap-1.5">
                <LandPlot className="size-3.5" />
                Parcel
              </TabsTrigger>
              <TabsTrigger value="lists" className="gap-1.5">
                <ListFilter className="size-3.5" />
                Lists
              </TabsTrigger>
              <TabsTrigger value="about" className="gap-1.5">
                <Info className="size-3.5" />
                About
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-0 min-h-0 flex-1">
              <DetailPanel />
            </TabsContent>
            <TabsContent value="parcel" className="mt-0 min-h-0 flex-1">
              <ParcelDetailsPanel />
            </TabsContent>
            <TabsContent value="lists" className="mt-0 min-h-0 flex-1">
              <ShortlistPanel />
            </TabsContent>
            <TabsContent value="about" className="mt-0 min-h-0 flex-1">
              <AboutPanel meta={meta} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
