"use client";
// FraudCast – geospatial forecast map (PRD 12.6).
// Real: OpenStreetMap base map and the H3 hexagon grid.
// Synthetic: every ATM/branch point, cash-out history count and forecast shown on top.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

export type MapZone = {
  zone_id: string;
  zone_name: string;
  jurisdiction: string;
  boundary: [number, number][];
  centroid: [number, number];
  historyCount: number;
  rank: number | null; // 1-3 for forecast zones, null otherwise
  percent: number | null;
};

export type MapPoint = {
  location_id: string;
  zone_id: string;
  location_type: string;
  operating_status: string;
  bank: string;
  lat: number;
  lng: number;
};

const RANK_COLOR: Record<number, string> = { 1: "#dc2626", 2: "#ea580c", 3: "#ca8a04" };
const POINT_COLOR: Record<string, string> = { ATM: "#1d4ed8", Branch: "#7c3aed", "Business Correspondent": "#0f766e" };

type Removable = { remove(): void };
type LayerGroupLike = Removable & { addTo(m: unknown): unknown };

export default function ForecastMap({ zones, points }: { zones: MapZone[]; points: MapPoint[] }) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<(Removable & { hasLayer(l: unknown): boolean; removeLayer(l: unknown): unknown }) | null>(null);
  const histRef = useRef<LayerGroupLike | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: Removable | undefined;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      if (cancelled || !el.current) return;

      const m = L.map(el.current, { scrollWheelZoom: false });
      map = m;
      mapRef.current = m;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
        .on("tileerror", () => setTileError(true))
        .addTo(m);

      // Unranked zones first, ranked zones on top
      const ordered = [...zones].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).reverse();
      for (const z of ordered) {
        const color = z.rank ? RANK_COLOR[z.rank] : "#64748b";
        const poly = L.polygon(z.boundary, {
          color,
          weight: z.rank ? 3 : 1,
          fillColor: color,
          fillOpacity: z.rank ? 0.35 - (z.rank - 1) * 0.07 : 0.06,
          dashArray: z.rank ? undefined : "4 3",
        }).addTo(m);
        poly.on("click", () => setSelected(z.zone_id));
        if (z.rank) {
          poly.bindTooltip(`#${z.rank} · ${z.percent ?? "–"}%`, { permanent: true, direction: "center", className: "fc-rank-label" });
        } else {
          poly.bindTooltip(`${z.zone_name} (${z.zone_id})`, { sticky: true });
        }
      }

      for (const p of points) {
        const up = p.operating_status === "Operational";
        L.circleMarker([p.lat, p.lng], {
          radius: 5,
          color: up ? POINT_COLOR[p.location_type] ?? "#334155" : "#94a3b8",
          weight: 2,
          fillColor: up ? POINT_COLOR[p.location_type] ?? "#334155" : "#ffffff",
          fillOpacity: up ? 0.9 : 0.6,
        })
          .bindTooltip(`${p.location_id} · ${p.location_type} · ${p.operating_status} (synthetic)`)
          .addTo(m);
      }

      const hist = L.layerGroup(
        zones
          .filter((z) => z.historyCount > 0)
          .map((z) =>
            L.circleMarker(z.centroid, { radius: 4 + z.historyCount * 3, color: "#0f172a", weight: 1, fillColor: "#0f172a", fillOpacity: 0.25 })
              .bindTooltip(`${z.historyCount} past synthetic cash-out(s) in ${z.zone_id}`),
          ),
      );
      histRef.current = hist;

      const focus = zones.filter((z) => z.rank);
      const bounds = L.latLngBounds((focus.length ? focus : zones).flatMap((z) => z.boundary));
      m.fitBounds(bounds, { padding: [24, 24] });
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      histRef.current = null;
    };
  }, [zones, points]);

  useEffect(() => {
    const m = mapRef.current;
    const h = histRef.current;
    if (!m || !h) return;
    if (showHistory && !m.hasLayer(h)) h.addTo(m);
    if (!showHistory && m.hasLayer(h)) m.removeLayer(h);
  }, [showHistory, ready]);

  const sel = zones.find((z) => z.zone_id === selected);
  const selPoints = sel ? points.filter((p) => p.zone_id === sel.zone_id) : [];

  return (
    <div className="space-y-2">
      <style>{`.fc-rank-label{background:#fff;border:1px solid #0f172a;font-weight:700;font-size:12px;padding:2px 6px;box-shadow:none}`}</style>
      {tileError && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ Map tiles could not load (check your internet connection). The ranked zone list beside the map still shows the full forecast.
        </div>
      )}
      <div
        ref={el}
        role="region"
        aria-label="Forecast map of Pune showing ranked cash-out zones. The same information is listed in the forecast card."
        className="h-[460px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
        {[1, 2, 3].map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 rounded-sm border-2" style={{ borderColor: RANK_COLOR[r], background: `${RANK_COLOR[r]}55` }} aria-hidden="true" />
            Rank {r}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-slate-500" aria-hidden="true" />
          Other zone
        </span>
        {Object.entries(POINT_COLOR).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} aria-hidden="true" />
            {k}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-400 bg-white" aria-hidden="true" />
          Offline
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showHistory} onChange={(e: { target: { checked: boolean } }) => setShowHistory(e.target.checked)} className="h-4 w-4" />
          Show past synthetic cash-out clusters
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Real: OpenStreetMap base map and the H3 hexagon grid (resolution 8, about 0.74 km² per hexagon). Synthetic: every ATM/branch
        point, past cash-out and forecast. Geography is context, not evidence of criminality.
      </p>
      <div aria-live="polite">
        {sel ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{sel.zone_name}</span>
              <span className="font-mono text-xs text-slate-500">{sel.zone_id}</span>
              {sel.rank ? (
                <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: RANK_COLOR[sel.rank] }}>
                  Rank {sel.rank} · {sel.percent}%
                </span>
              ) : (
                <span className="text-xs text-slate-500">Not in top 3</span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Jurisdiction {sel.jurisdiction} · {selPoints.filter((p) => p.operating_status === "Operational").length} operational of {selPoints.length} cash-out points ·{" "}
              {sel.historyCount} past synthetic cash-out(s)
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Click a hexagon to see its details.</p>
        )}
      </div>
    </div>
  );
}
