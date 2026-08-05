"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import type { GeocodeSuggestion } from "@/lib/geocode";

type Props = {
  onSelect: (lng: number, lat: number, label: string) => void;
  /** Optional map-center bias as [lng, lat] for Mapbox proximity. */
  proximity?: [number, number] | null;
};

/**
 * Address autocomplete — mirrors property_list_builder AddressAutocompleteField
 * (Mapbox address+poi suggestions), not the CRM global map search.
 */
export function MapAddressSearch({ onSelect, proximity = null }: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const proximityRef = useRef(proximity);
  proximityRef.current = proximity;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q });
        const prox = proximityRef.current;
        if (
          prox &&
          Number.isFinite(prox[0]) &&
          Number.isFinite(prox[1])
        ) {
          params.set("proximity", `${prox[0]},${prox[1]}`);
        }
        const res = await fetch(`/api/geocode?${params}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          suggestions?: GeocodeSuggestion[];
          error?: string;
        };
        if (!res.ok) {
          setSuggestions([]);
          setError(data.error || "Search failed");
          return;
        }
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
        setActiveIdx(-1);
        if ((data.suggestions ?? []).length === 0) {
          setError(`No results for "${q}".`);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSuggestions([]);
        setError("Search unavailable");
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: GeocodeSuggestion) => {
    setQuery(s.label);
    setOpen(false);
    setSuggestions([]);
    setError(null);
    onSelect(s.lng, s.lat, s.label);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(suggestions[activeIdx]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="pointer-events-auto relative w-full max-w-sm">
      <div className="relative flex items-center rounded-md border border-slate-200 bg-white/95 shadow-md backdrop-blur-sm">
        <MapPin
          className="pointer-events-none absolute left-2.5 size-3.5 text-slate-400"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Start typing an address…"
          aria-label="Search address"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open && suggestions.length > 0}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2 pl-8 pr-8 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
        />
        {loading && (
          <Loader2
            className="absolute right-2.5 size-3.5 animate-spin text-slate-400"
            aria-hidden
          />
        )}
        {query && !loading && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setOpen(false);
              setError(null);
            }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (suggestions.length > 0 || error) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {error && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">{error}</li>
          )}
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                className={[
                  "w-full truncate px-3 py-2 text-left text-sm",
                  i === activeIdx
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(s)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
