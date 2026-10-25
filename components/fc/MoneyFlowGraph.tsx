"use client";
// FraudCast – interactive money-flow graph (PRD 12.4). Plain SVG, no extra libraries.
// Accounts are boxes (nodes), transfers are arrows (edges). Click or press Enter on any box or arrow.

import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode } from "../../lib/calc";
import { dt, inr, inrShort } from "../../lib/format";

const NODE_W = 184;
const NODE_H = 72;
const COL_W = 250;
const ROW_H = 112;
const PAD_X = 16;
const PAD_TOP = 34;
const MAX_NODES = 40; // PRD MG-09: larger graphs fall back to a table

const C = {
  border: "#cbd5e1", text: "#0f172a", muted: "#64748b",
  exposed: "#d97706", exposedFill: "#fffbeb",
  victimFill: "#f1f5f9", cashFill: "#fef2f2", cashBorder: "#dc2626",
  selected: "#1d4ed8", edge: "#475569", edgeWithdraw: "#dc2626", warn: "#b45309",
};

type Selection = { kind: "node" | "edge"; id: string } | null;

export default function MoneyFlowGraph({ nodes, edges, closed }: { nodes: GraphNode[]; edges: GraphEdge[]; closed: boolean }) {
  const [sel, setSel] = useState<Selection>(null);

  const layout = useMemo(() => {
    const maxCol = Math.max(0, ...nodes.map((n) => n.col));
    const rowsPerCol = new Map<number, number>();
    for (const n of nodes) rowsPerCol.set(n.col, Math.max(rowsPerCol.get(n.col) ?? 0, n.row + 1));
    const maxRows = Math.max(1, ...rowsPerCol.values());
    const pos = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const offset = ((maxRows - (rowsPerCol.get(n.col) ?? 1)) * ROW_H) / 2; // centre short columns
      pos.set(n.id, { x: PAD_X + n.col * COL_W, y: PAD_TOP + offset + n.row * ROW_H });
    }
    return { pos, maxCol, width: PAD_X * 2 + maxCol * COL_W + NODE_W, height: PAD_TOP + maxRows * ROW_H + 8 };
  }, [nodes]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = sel?.kind === "node" ? byId.get(sel.id) : undefined;
  const selectedEdge = sel?.kind === "edge" ? edges.find((e) => e.id === sel.id) : undefined;
  const hasCashout = nodes.some((n) => n.kind === "cashout");

  const colLabel = (i: number) => {
    if (i === 0) return "Victim";
    if (hasCashout && i === layout.maxCol) return "Cash-out";
    return `Step ${i}`;
  };

  const keySelect = (s: Selection) => (e: { key: string; preventDefault: () => void }) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSel(s);
    }
  };

  if (nodes.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">No transactions recorded for this case.</p>;
  }

  if (nodes.length > MAX_NODES) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="mb-2 text-amber-800">⚠ This trail has {nodes.length} accounts, too many to draw clearly. Showing a summary table instead.</p>
        <EdgeTable edges={edges} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="overflow-x-auto">
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="group"
            aria-label="Money-flow graph. Use Tab to move between accounts and transfers, Enter to see details."
            style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
          >
            <defs>
              <marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={C.edge} />
              </marker>
              <marker id="fc-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={C.edgeWithdraw} />
              </marker>
            </defs>

            {Array.from({ length: layout.maxCol + 1 }, (_, i) => (
              <text key={i} x={PAD_X + i * COL_W + NODE_W / 2} y={18} textAnchor="middle" fontSize={11} fill={C.muted} fontWeight={600}>
                {colLabel(i).toUpperCase()}
              </text>
            ))}

            {/* Edges first so boxes sit on top */}
            {edges.map((e) => {
              const a = layout.pos.get(e.from);
              const b = layout.pos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x - 2, y2 = b.y + NODE_H / 2;
              const dx = Math.max(40, (x2 - x1) / 2);
              const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              const label = inrShort(e.amount);
              const lw = label.length * 6.6 + 10;
              const isSel = sel?.kind === "edge" && sel.id === e.id;
              const color = isSel ? C.selected : e.withdrawal ? C.edgeWithdraw : C.edge;
              const dashed = e.status !== "Completed";
              return (
                <g
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Transfer ${e.id}: ${inr(e.amount)} from ${e.from} to ${e.withdrawal ? "cash withdrawal" : e.to}, ${e.channel}, ${dt(e.timestamp)}`}
                  onClick={() => setSel({ kind: "edge", id: e.id })}
                  onKeyDown={keySelect({ kind: "edge", id: e.id })}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  <title>{`${e.id} · ${inr(e.amount)} · ${e.channel} · ${dt(e.timestamp)} · hop ${e.hop}`}</title>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={isSel ? 3 : 1.6}
                    strokeDasharray={dashed ? "6 4" : undefined}
                    markerEnd={e.withdrawal ? "url(#fc-arrow-red)" : "url(#fc-arrow)"}
                  />
                  <rect x={mx - lw / 2} y={my - 9} width={lw} height={18} rx={9} fill="#ffffff" stroke={isSel ? C.selected : C.border} />
                  <text x={mx} y={my + 4} textAnchor="middle" fontSize={11} fill={e.outOfOrder ? C.warn : C.text} fontWeight={600}>
                    {e.outOfOrder ? "⚠ " : ""}{label}
                  </text>
                </g>
              );
            })}

            {nodes.map((n) => {
              const p = layout.pos.get(n.id)!;
              const isSel = sel?.kind === "node" && sel.id === n.id;
              const fill = n.kind === "cashout" ? C.cashFill : n.isVictim ? C.victimFill : n.exposed ? C.exposedFill : "#ffffff";
              const stroke = isSel ? C.selected : n.kind === "cashout" ? C.cashBorder : n.exposed ? C.exposed : C.border;
              const tagRight: { text: string; color: string }[] = [];
              if (n.exposed) tagRight.push({ text: "EXPOSED", color: C.exposed });
              if (n.splitCount >= 3) tagRight.push({ text: `SPLIT ×${n.splitCount}`, color: "#7c3aed" });
              const third = n.kind === "cashout" ? `Withdrawn ${inrShort(n.inflow)}` : n.isVictim ? `Sent ${inrShort(n.outflow)}` : `Held ${inrShort(n.held)}`;
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.title}, ${n.subtitle}. ${third}.${n.exposed ? " Currently holding case funds." : ""}`}
                  aria-pressed={isSel}
                  onClick={() => setSel({ kind: "node", id: n.id })}
                  onKeyDown={keySelect({ kind: "node", id: n.id })}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8} fill={fill} stroke={stroke} strokeWidth={isSel || n.exposed ? 2.5 : 1.2} />
                  <text x={p.x + 10} y={p.y + 19} fontSize={12} fontWeight={700} fill={C.text} fontFamily="ui-monospace, monospace">
                    {n.kind === "cashout" ? "💵 " : ""}{n.title}
                  </text>
                  <text x={p.x + 10} y={p.y + 37} fontSize={11} fill={C.muted}>{n.subtitle}</text>
                  <text x={p.x + 10} y={p.y + 57} fontSize={12} fontWeight={600} fill={n.exposed ? C.exposed : n.kind === "cashout" ? C.cashBorder : C.text}>
                    {third}
                  </text>
                  {tagRight.map((t, i) => (
                    <g key={t.text}>
                      <rect x={p.x + NODE_W - 74 - i * 76} y={p.y - 9} width={70} height={16} rx={8} fill={t.color} />
                      <text x={p.x + NODE_W - 39 - i * 76} y={p.y + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#ffffff">{t.text}</text>
                    </g>
                  ))}
                  {n.indicators.length > 0 && (
                    <g>
                      <rect x={p.x + 6} y={p.y + NODE_H + 4} width={128} height={16} rx={8} fill="#ffffff" stroke={C.muted} strokeDasharray="3 2" />
                      <text x={p.x + 70} y={p.y + NODE_H + 15} textAnchor="middle" fontSize={9.5} fill={C.muted}>
                        Inferred signals: {n.indicators.length}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <Legend closed={closed} />
      </div>

      <aside aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
        {!sel && (
          <div className="text-slate-600">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Details</h2>
            <p>Select an account box or a transfer arrow to see its details.</p>
            <p className="mt-2 text-xs">Keyboard: Tab to move, Enter to select.</p>
          </div>
        )}
        {selectedNode && (
          <div>
            <h2 className="font-mono text-sm font-bold">{selectedNode.title}</h2>
            <p className="text-xs text-slate-500">{selectedNode.subtitle}</p>
            {selectedNode.exposed && <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">⚠ Currently holding case funds</p>}
            {selectedNode.splitCount >= 3 && (
              <p className="mt-2 rounded bg-violet-100 px-2 py-1 text-xs font-medium text-violet-900">
                Split pattern: sent to {selectedNode.splitCount} accounts within 60 minutes
              </p>
            )}
            <dl className="mt-3 space-y-1.5">
              {selectedNode.details.map((d) => (
                <div key={d.label} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{d.label}</dt>
                  <dd className={`text-right font-medium ${d.value === "Not available" ? "text-amber-800" : ""}`}>{d.value}</dd>
                </div>
              ))}
            </dl>
            {selectedNode.indicators.length > 0 && (
              <div className="mt-4 rounded border border-dashed border-slate-400 p-2">
                <div className="text-xs font-semibold text-slate-600">Inferred signals (not proof)</div>
                <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
                  {selectedNode.indicators.map((i) => <li key={i}>{i}</li>)}
                </ul>
                <p className="mt-1 text-[11px] text-slate-500">Derived from synthetic account attributes. Review before acting.</p>
              </div>
            )}
          </div>
        )}
        {selectedEdge && (
          <div>
            <h2 className="font-mono text-sm font-bold">{selectedEdge.id}</h2>
            <p className="text-xs text-slate-500">{selectedEdge.withdrawal ? "Cash withdrawal" : "Account-to-account transfer"} · confirmed transaction record</p>
            {selectedEdge.outOfOrder && <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900">⚠ Sent before money arrived in the source account. Check data.</p>}
            <dl className="mt-3 space-y-1.5">
              {[
                ["Amount", inr(selectedEdge.amount)],
                ["From", selectedEdge.from],
                ["To", selectedEdge.withdrawal ? byId.get(selectedEdge.to)?.subtitle ?? "Cash withdrawal" : selectedEdge.to],
                ["Time", dt(selectedEdge.timestamp)],
                ["Channel", selectedEdge.channel],
                ["Hop", selectedEdge.withdrawal ? "Cash-out" : String(selectedEdge.hop)],
                ["Status", selectedEdge.status],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="break-all text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {sel && (
          <button type="button" onClick={() => setSel(null)} className="mt-4 text-xs text-blue-700 underline">
            Clear selection
          </button>
        )}
      </aside>
    </div>
  );
}

function Legend({ closed }: { closed: boolean }) {
  const item = "flex items-center gap-2";
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-2 pt-2 text-xs text-slate-600">
      <span className={item}><svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="#475569" strokeWidth="2" /></svg>Confirmed transfer</span>
      <span className={item}><svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="#dc2626" strokeWidth="2" /></svg>Cash withdrawal</span>
      <span className={item}><svg width="28" height="8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="#475569" strokeWidth="2" strokeDasharray="5 3" /></svg>Pending / unconfirmed</span>
      <span className={item}><span className="inline-block h-3 w-5 rounded border-2 border-amber-600 bg-amber-50" aria-hidden="true" />Exposed: still holding funds{closed ? " (n/a – case closed)" : ""}</span>
      <span className={item}><span className="inline-block h-3 w-5 rounded border border-dashed border-slate-500" aria-hidden="true" />Inferred signal, not proof</span>
      <span className={item}><span className="rounded bg-violet-600 px-1 text-[9px] font-bold text-white">SPLIT</span>Sent to 3+ accounts in 60 min</span>
    </div>
  );
}

function EdgeTable({ edges }: { edges: GraphEdge[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr><th className="py-1 pr-2">Time</th><th className="pr-2">From</th><th className="pr-2">To</th><th className="pr-2 text-right">Amount</th><th>Channel</th></tr>
        </thead>
        <tbody>
          {edges.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <td className="py-1 pr-2">{dt(e.timestamp)}</td>
              <td className="pr-2 font-mono">{e.from}</td>
              <td className="pr-2 font-mono">{e.withdrawal ? "Cash withdrawal" : e.to}</td>
              <td className="pr-2 text-right">{inr(e.amount)}</td>
              <td>{e.channel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
