"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { FeatureCollection, Point } from "geojson";
import {
  BriefcaseBusiness,
  Info,
  LandPlot,
  ListFilter,
  MapPinned,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import {
  HeaderActionLink,
  HeaderBrand,
  HeaderCountBadge,
  headerBarClass,
} from "@/components/shared/appHeader";

import { FilterSidebar } from "@/components/filters/FilterSidebar";
import { MapLegend } from "@/components/map/MapLegend";
import { SharedListsSync } from "@/components/lists/SharedListsSync";
import { MobileActionBar } from "@/components/mobile/MobileActionBar";
import { MobilePanelSheet } from "@/components/mobile/MobilePanelSheet";
import { AboutPanel } from "@/components/panels/AboutPanel";
import { DetailPanel } from "@/components/panels/DetailPanel";
import { ParcelDetailsPanel } from "@/components/panels/ParcelDetailsPanel";
import { ShortlistPanel } from "@/components/panels/ShortlistPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { filterSubstations } from "@/lib/geo";
import { useAppStore, type PanelTab } from "@/lib/store";
import type {
  DataMeta,
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
  const [counties, setCounties] = useState<FeatureCollection | null>(null);
  const [states, setStates] = useState<FeatureCollection | null>(null);
  const [countyList, setCountyList] = useState<string[]>([]);
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [crmLeadCount, setCrmLeadCount] = useState<number | null>(null);

  const filters = useAppStore((s) => s.filters);
  const panelTab = useAppStore((s) => s.panelTab);
  const setPanelTab = useAppStore((s) => s.setPanelTab);
  const filtersPanelOpen = useAppStore((s) => s.filtersPanelOpen);
  const setFiltersPanelOpen = useAppStore((s) => s.setFiltersPanelOpen);
  const detailPanelOpen = useAppStore((s) => s.detailPanelOpen);
  const setDetailPanelOpen = useAppStore((s) => s.setDetailPanelOpen);
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
          statesRes,
          listRes,
          metaRes,
        ] = await Promise.all([
          fetch("/data/substations.geojson"),
          fetch("/data/projects.geojson"),
          fetch("/data/lines.geojson"),
          fetch("/data/counties.geojson"),
          fetch("/data/states.geojson"),
          fetch("/data/counties-list.json"),
          fetch("/data/meta.json"),
        ]);
        if (!subsRes.ok) {
          throw new Error(
            "Data snapshot missing. Run `npm run data` then restart the dev server."
          );
        }
        const [subs, proj, ln, co, st, list, m] = await Promise.all([
          subsRes.json(),
          projRes.json(),
          linesRes.json(),
          countiesRes.json(),
          statesRes.ok ? statesRes.json() : Promise.resolve(null),
          listRes.json(),
          metaRes.json(),
        ]);
        if (cancelled) return;
        setSubstations(subs);
        setStates(st);
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/leads?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.count === "number") {
          setCrmLeadCount(d.count);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

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

  const projectCount = useMemo(() => {
    if (!projects) return 0;
    return projects.features.filter((f) => {
      const p = f.properties;
      return (
        filters.fuels.includes(p.fuel) &&
        filters.stages.includes(p.funnelStage) &&
        p.capacityMw >= filters.minProjectMw &&
        p.capacityMw <= filters.maxProjectMw
      );
    }).length;
  }, [projects, filters]);

  return (
    <div className="flex h-dvh max-h-[100dvh] flex-col overflow-hidden bg-background text-foreground supports-[height:100dvh]:h-dvh">
      <SharedListsSync />
      <header className={headerBarClass}>
        <HeaderBrand href="/" />
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-sm font-medium text-neutral-400">
              Loading data…
            </span>
          )}
          {error && (
            <span className="max-w-md truncate text-sm font-medium text-red-400">
              {error}
            </span>
          )}
          <HeaderActionLink href="/crm">
            <BriefcaseBusiness className="size-4" strokeWidth={2.5} />
            CRM
            {crmLeadCount != null && crmLeadCount > 0 && (
              <HeaderCountBadge count={crmLeadCount} />
            )}
          </HeaderActionLink>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "hidden h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out md:block",
            filtersPanelOpen ? "w-[280px] border-r" : "w-0 border-r-0"
          )}
        >
          {filtersPanelOpen && (
            <FilterSidebar
              counties={countyList}
              visibleSubCount={visibleCount}
              totalSubCount={substations?.features.length ?? 0}
              onCollapse={() => setFiltersPanelOpen(false)}
            />
          )}
        </aside>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {!error && (
            <BessMap
              substations={substations}
              projects={projects}
              lines={lines}
              counties={counties}
              states={states}
            />
          )}
          {error && (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {error}
            </div>
          )}
          <MapLegend
            substationCount={visibleCount}
            projectCount={projectCount}
          />

          {!filtersPanelOpen && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute left-0 top-1/2 z-40 hidden -translate-y-1/2 rounded-l-none border border-l-0 bg-background/95 shadow-md backdrop-blur md:inline-flex"
              onClick={() => setFiltersPanelOpen(true)}
              title="Show filters"
              aria-label="Show filters"
            >
              <PanelLeftOpen className="size-4" />
              Filters
            </Button>
          )}
          {!detailPanelOpen && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-0 top-1/2 z-40 hidden -translate-y-1/2 rounded-r-none border border-r-0 bg-background/95 shadow-md backdrop-blur md:inline-flex"
              onClick={() => setDetailPanelOpen(true)}
              title="Show panel"
              aria-label="Show panel"
            >
              Panel
              <PanelRightOpen className="size-4" />
            </Button>
          )}
        </main>

        {/* Desktop docked panel — hidden on mobile in favor of action bar sheets */}
        <aside
          className={cn(
            "hidden h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out md:block",
            detailPanelOpen ? "w-[360px] border-l" : "w-0 border-l-0"
          )}
        >
          {detailPanelOpen && (
            <Tabs
              value={panelTab}
              onValueChange={(v) =>
                setPanelTab((v as PanelTab) ?? "about")
              }
              className="flex h-full flex-col"
            >
              <div className="flex shrink-0 items-center border-b">
                <TabsList className="min-w-0 flex-1 justify-start rounded-none border-0 bg-transparent px-2">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mr-1 shrink-0"
                  onClick={() => setDetailPanelOpen(false)}
                  title="Hide panel"
                  aria-label="Hide panel"
                >
                  <PanelRightClose className="size-4" />
                </Button>
              </div>
              <TabsContent value="details" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <DetailPanel />
              </TabsContent>
              <TabsContent value="parcel" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <ParcelDetailsPanel substations={substations} />
              </TabsContent>
              <TabsContent value="lists" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <ShortlistPanel />
              </TabsContent>
              <TabsContent value="about" className="mt-0 min-h-0 flex-1 overflow-hidden">
                <AboutPanel meta={meta} />
              </TabsContent>
            </Tabs>
          )}
        </aside>
      </div>

      {/* Docked tab bar above sheets (z-60) so users can switch/toggle panels */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] md:hidden">
        <MobileActionBar />
      </div>

      <div className="md:hidden">
        <MobilePanelSheet
          counties={countyList}
          visibleSubCount={visibleCount}
          totalSubCount={substations?.features.length ?? 0}
          substations={substations}
          meta={meta}
        />
      </div>
    </div>
  );
}
