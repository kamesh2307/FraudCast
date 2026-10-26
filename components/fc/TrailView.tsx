"use client";
// FraudCast – Trail map (Phase 8). Two views of the same money trail:
//   Line view: markers joined by lines, details printed under each marker.
//   Map view:  the same trail on a real Pune map; each account sits at its HOME-BRANCH ZONE
//              (a bank-branch area, never where a person lives); cash-outs sit at the ATM/branch used.

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { dt, inr, inrShort, timeOnly } from "../../lib/format";
import type { TrailEdge, TrailNode } from "../../lib/trail";

const COL_W = 236;
const ROW_H = 206;
const PAD = 28;
const TOP = 46;
const R = 12;

const COLOR = { victim: "#8e8e93", account: "#0071e3", exposed: "#ff9f0a", cashout: "#ff3b30", line: "#aeaeb2", lineCash: "#ff3b30" };

const nodeColor = (n: TrailNode) => (n.kind === "victim" ? COLOR.victim : n.kind === "cashout" ? COLOR.cashout : n.exposed ? COLOR.exposed : COLOR.account);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function detailLines(n: TrailNode, showIds: boolean): { text: string; tone?: "strong" | "mono" | "muted" | "warn" | "danger" }[] {
  const lines: { text: string; tone?: "strong" | "mono" | "muted" | "warn" | "danger" }[] = [{ text: clip(n.name, 26), tone: "strong" }];
  if (n.kind === "cashout") {
    lines.push({ text: n.accountId ?? "Location n/a", tone: "mono" });
    lines.push({ text: clip(n.placeLabel, 30), tone: "muted" });
    lines.push({ text: `Withdrawn ${inrShort(n.received)}`, tone: "danger" });
    lines.push({ text: `at ${timeOnly(n.firstSeen)} IST`, tone: "muted" });
    return lines;
  }
  lines.push({ text: n.accountId ?? "", tone: "mono" });
  lines.push({ text: clip([n.bank, n.accountType].filter(Boolean).join(" · ") || "Bank n/a", 30), tone: "muted" });
  if (n.kind === "victim") {
    lines.push({ text: `Sent ${inrShort(n.sent)}`, tone: "strong" });
    lines.push({ text: `Fraud at ${timeOnly(n.firstSeen)} IST`, tone: "muted" });
  } else {
    lines.push({ text: `Received ${inrShort(n.received)}`, tone: undefined });
    lines.push(n.exposed ? { text: `Holding ${inrShort(n.held)}`, tone: "warn" } : { text: n.held > 0.5 ? `Left ${inrShort(n.held)}` : "Passed on", tone: "muted" });
    lines.push({ text: `First funds ${timeOnly(n.firstSeen)} IST`, tone: "muted" });
  }
  if (showIds) {
    lines.push({ text: `Aadhaar ${n.aadhaarMasked ?? "n/a"}`, tone: "mono" });
    lines.push({ text: `PAN ${n.panMasked ?? "n/a"}`, tone: "mono" });
  }
  return lines;
}

const TONE_STYLE: Record<string, { fill: string; weight: number; size: number; family?: string }> = {
  strong: { fill: "#1d1d1f", weight: 600, size: 13 },
  mono: { fill: "#48484a", weight: 400, size: 11, family: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  muted: { fill: "#6e6e73", weight: 400, size: 11 },
  warn: { fill: "#c93400", weight: 600, size: 12 },
  danger: { fill: "#d70015", weight: 600, size: 12 },
  default: { fill: "#1d1d1f", weight: 400, size: 12 },
};

function LineView({ nodes, edges, showIds, selected, onSelect }: { nodes: TrailNode[]; edges: TrailEdge[]; showIds: boolean; selected: string | null; onSelect: (id: string) => void }) {
  const cols = Math.max(1, ...nodes.map((n) => n.col + 1));
  const rowsPerCol = new Map<number, number>();
  for (const n of nodes) rowsPerCol.set(n.col, Math.max(rowsPerCol.get(n.col) ?? 0, n.row + 1));
  const maxRows = Math.max(1, ...rowsPerCol.values());
  const pos = new Map(
    nodes.map((n) => {
      const offset = ((maxRows - (rowsPerCol.get(n.col) ?? 1)) * ROW_H) / 2;
      return [n.id, { x: PAD + 110 + n.col * COL_W, y: TOP + 20 + offset + n.row * ROW_H }];
    }),
  );
  const width = PAD * 2 + 220 + (cols - 1) * COL_W;
  const height = TOP + maxRows * ROW_H + (showIds ? 10 : -20);
  const hasCash = nodes.some((n) => n.kind === "cashout");
  const header = (c: number) => (c === 0 ? "VICTIM" : hasCash && c === cols - 1 ? "CASH-OUT" : `HOP ${c}`);

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Money trail line view. Tab to a marker and press Enter for details." style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif" }}>
        <defs>
          <marker id="tr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={COLOR.line} /></marker>
          <marker id="tr-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={COLOR.lineCash} /></marker>
        </defs>
        {Array.from({ length: cols }, (_, c) => (
          <text key={c} x={PAD + 110 + c * COL_W} y={20} textAnchor="middle" fontSize={11} fontWeight={600} fill="#86868b" letterSpacing="0.06em">{header(c)}</text>
        ))}
        {edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + R + 2, y1 = a.y, x2 = b.x - R - 4, y2 = b.y;
          const mx = (x1 + x2) / 2;
          const d = Math.abs(y1 - y2) < 1 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
          const label = `${inrShort(e.amount)} · ${timeOnly(e.time)}`;
          const lw = label.length * 6.1 + 14;
          const ly = (y1 + y2) / 2;
          return (
            <g key={e.id}>
              <title>{`${e.id}: ${inr(e.amount)} via ${e.channel} at ${dt(e.time)}`}</title>
              <path d={d} fill="none" stroke={e.withdrawal ? COLOR.lineCash : COLOR.line} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={e.withdrawal ? "6 5" : undefined} markerEnd={e.withdrawal ? "url(#tr-arrow-red)" : "url(#tr-arrow)"} />
              <rect x={mx - lw / 2} y={ly - 10} width={lw} height={20} rx={10} fill="#ffffff" stroke="rgba(0,0,0,0.08)" />
              <text x={mx} y={ly + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={e.withdrawal ? "#d70015" : "#1d1d1f"}>{label}</text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          const isSel = selected === n.id;
          const lines = detailLines(n, showIds);
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`${n.name}, ${n.accountId ?? ""}. ${n.kind === "cashout" ? `Withdrawn ${inr(n.received)}` : n.kind === "victim" ? `Sent ${inr(n.sent)}` : `Received ${inr(n.received)}, holding ${inr(n.held)}`}`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(ev: { key: string; preventDefault: () => void }) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(n.id); } }}
              style={{ cursor: "pointer", outline: "none" }}
            >
              {n.exposed && <circle cx={p.x} cy={p.y} r={R + 7} fill={COLOR.exposed} opacity={0.18} />}
              {isSel && <circle cx={p.x} cy={p.y} r={R + 5} fill="none" stroke="#0071e3" strokeWidth={2} />}
              <circle cx={p.x} cy={p.y} r={R} fill={nodeColor(n)} stroke="#ffffff" strokeWidth={3} />
              {n.kind === "cashout" && <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">₹</text>}
              {lines.map((l, i) => {
                const st = TONE_STYLE[l.tone ?? "default"];
                return (
                  <text key={i} x={p.x} y={p.y + R + 20 + i * 16} textAnchor="middle" fontSize={st.size} fontWeight={st.weight} fill={st.fill} fontFamily={st.family}>
                    {l.text}
                  </text>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MapView({ nodes, edges, showIds }: { nodes: TrailNode[]; edges: TrailEdge[]; showIds: boolean }) {
  const el = useRef<HTMLDivElement | null>(null);
  const [tileError, setTileError] = useState(false);
  const placed = useMemo(() => nodes.filter((n) => n.lat !== null && n.lng !== null), [nodes]);
  const missing = nodes.length - placed.length;

  useEffect(() => {
    let cancelled = false;
    let map: { remove(): void } | undefined;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      if (cancelled || !el.current || !placed.length) return;
      const m = L.map(el.current, { scrollWheelZoom: false });
      map = m;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on("tileerror", () => setTileError(true)).addTo(m);

      // Spread markers that share a zone in a small circle so none hide each other
      const groups = new Map<string, TrailNode[]>();
      for (const n of placed) {
        const k = `${n.lat!.toFixed(5)},${n.lng!.toFixed(5)}`;
        groups.set(k, [...(groups.get(k) ?? []), n]);
      }
      const where = new Map<string, [number, number]>();
      for (const g of groups.values()) {
        g.forEach((n, i) => {
          const r = g.length > 1 ? 0.0016 : 0;
          const a = (2 * Math.PI * i) / g.length - Math.PI / 2;
          where.set(n.id, [n.lat! + r * Math.sin(a), n.lng! + r * Math.cos(a)]);
        });
      }
      for (const e of edges) {
        const a = where.get(e.from);
        const b = where.get(e.to);
        if (!a || !b) continue;
        L.polyline([a, b], { color: e.withdrawal ? COLOR.lineCash : COLOR.account, weight: 3, opacity: 0.75, dashArray: e.withdrawal ? "6 6" : undefined })
          .bindTooltip(`${esc(e.id)} · ${esc(inr(e.amount))} · ${esc(e.channel)} · ${esc(timeOnly(e.time))} IST`, { sticky: true })
          .addTo(m);
      }
      for (const n of placed) {
        const p = where.get(n.id)!;
        const color = nodeColor(n);
        const lines = detailLines(n, showIds);
        const html = lines.map((l, i) => (i === 0 ? `<b>${esc(l.text)}</b>` : `<span class="t-${l.tone ?? "d"}">${esc(l.text)}</span>`)).join("<br/>");
        L.circleMarker(p, { radius: 9, color: "#ffffff", weight: 3, fillColor: color, fillOpacity: 1 })
          .bindTooltip(html, { permanent: true, direction: "bottom", offset: [0, 10], className: "fc-trail-label" })
          .addTo(m);
      }
      m.fitBounds(L.latLngBounds([...where.values()]), { padding: [60, 90] });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [placed, edges, showIds]);

  return (
    <div className="space-y-2">
      <style>{`.fc-trail-label{background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:6px 9px;font:11px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1d1d1f;text-align:center}
.fc-trail-label:before{display:none}.fc-trail-label .t-mono{font-family:ui-monospace,Menlo,monospace;color:#48484a}.fc-trail-label .t-muted{color:#6e6e73}.fc-trail-label .t-warn{color:#c93400;font-weight:600}.fc-trail-label .t-danger{color:#d70015;font-weight:600}`}</style>
      {tileError && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠ Map tiles could not load. The Line view shows the same trail.</p>}
      {!placed.length ? (
        <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-600">No account in this trail has a home-branch zone, so it cannot be placed on the map. Use the Line view.</p>
      ) : (
        <div ref={el} role="region" aria-label="Money trail map. The Line view shows the same information as text." className="h-[560px] w-full overflow-hidden rounded-2xl bg-slate-100" />
      )}
      <p className="text-xs text-slate-500">
        Each account is placed at its <strong>home-branch zone</strong>, a bank-branch area, not where anyone lives (a weak signal, never a location of a person). Cash-outs are at the ATM or branch used.
        {missing > 0 && ` ${missing} marker(s) have no location and are shown only in the Line view.`} All names and IDs are synthetic.
      </p>
    </div>
  );
}

export default function TrailView({ nodes, edges }: { nodes: TrailNode[]; edges: TrailEdge[] }) {
  const [view, setView] = useState<"line" | "map">("line");
  const [showIds, setShowIds] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const sel = useMemo(() => nodes.find((n) => n.id === selected) ?? null, [nodes, selected]);
  const segBtn = (v: "line" | "map", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      onClick={() => setView(v)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
    >
      {label}
    </button>
  );

  if (!nodes.length) return <p className="text-sm text-slate-600">No transactions recorded for this case.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Trail view" className="inline-flex rounded-full bg-black/5 p-1">
          {segBtn("line", "Line view")}
          {segBtn("map", "Map view")}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={showIds} onChange={(e: { target: { checked: boolean } }) => setShowIds(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Show masked Aadhaar and PAN under each marker
        </label>
      </div>

      {view === "line" ? <LineView nodes={nodes} edges={edges} showIds={showIds} selected={selected} onSelect={setSelected} /> : <MapView nodes={nodes} edges={edges} showIds={showIds} />}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {[["Victim account", COLOR.victim], ["Beneficiary account", COLOR.account], ["Still holding funds", COLOR.exposed], ["Cash withdrawal", COLOR.cashout]].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-white" style={{ background: c }} aria-hidden="true" />{l}</span>
        ))}
        <span className="flex items-center gap-1.5"><svg width="26" height="6" aria-hidden="true"><line x1="0" y1="3" x2="26" y2="3" stroke={COLOR.lineCash} strokeWidth="2.5" strokeDasharray="5 4" /></svg>Withdrawal</span>
      </div>

      {view === "line" && (
        <div aria-live="polite">
          {sel ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm ring-1 ring-black/5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-base font-semibold">{sel.name}</span>
                <span className="font-mono text-xs text-slate-500">{sel.accountId}</span>
                {sel.exposed && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">Holding funds</span>}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                {(sel.kind === "cashout"
                  ? [["Withdrawn", inr(sel.received)], ["Where", sel.placeLabel], ["When", dt(sel.firstSeen)]]
                  : [
                      ["Bank", sel.bank ?? "—"], ["Account type", sel.accountType ?? "—"], ["Account age", sel.ageBand ?? "Not available"],
                      [sel.kind === "victim" ? "Sent" : "Received", inr(sel.kind === "victim" ? sel.sent : sel.received)],
                      ["Sent on / withdrawn", inr(sel.kind === "victim" ? 0 : sel.sent)], ["Holding now", inr(sel.held)],
                      ["Aadhaar (synthetic)", sel.aadhaarMasked ?? "Not available"], ["PAN (synthetic)", sel.panMasked ?? "Not available"],
                      ["Home branch", sel.zoneId ?? "Not available"], ["First funds", dt(sel.firstSeen)],
                    ]
                ).map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Click a marker (or Tab to it and press Enter) to see its full details.</p>
          )}
        </div>
      )}
    </div>
  );
}
