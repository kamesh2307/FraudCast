// FraudCast – money trail model for the Trail map (Phase 8): victim → accounts → cash-out, with
// a column/row layout for the line view and a position for the map view. Pure function.

import { identityOf, maskAadhaar, maskPan } from "./identity";
import type { TxnRow } from "./types";

export type TrailAccountIn = { account_id: string } & Record<string, unknown>;
export type TrailPointIn = { location_id: string; zone_id: string; location_type: string; latitude: number; longitude: number };

export type TrailNode = {
  id: string;
  kind: "victim" | "account" | "cashout";
  col: number;
  row: number;
  name: string;
  accountId: string | null;
  bank: string | null;
  accountType: string | null;
  ageBand: string | null;
  received: number;
  sent: number;
  held: number;
  exposed: boolean;
  firstSeen: string | null;
  zoneId: string | null;
  lat: number | null;
  lng: number | null;
  placeLabel: string;
  aadhaarMasked: string | null;
  panMasked: string | null;
};

export type TrailEdge = { id: string; from: string; to: string; amount: number; time: string; channel: string; hop: number; withdrawal: boolean };
export type Trail = { nodes: TrailNode[]; edges: TrailEdge[]; cols: number; maxRows: number };

const isWd = (t: TxnRow) => t.destination_account_id === null || t.destination_account_id === undefined;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export function buildTrail(input: {
  victimId: string;
  closed: boolean;
  txns: TxnRow[];
  accounts: TrailAccountIn[];
  points: TrailPointIn[];
  zoneCentroids: Record<string, [number, number]>;
}): Trail {
  const { victimId, closed, zoneCentroids } = input;
  const acc = new Map(input.accounts.map((a) => [a.account_id, a]));
  const pts = new Map(input.points.map((p) => [p.location_id, p]));
  const txns = input.txns
    .filter((t) => t.status !== "Reversed")
    .sort((a, b) => Number(a.transfer_hop) - Number(b.transfer_hop) || a.timestamp.localeCompare(b.timestamp));

  const col = new Map<string, number>([[victimId, 0]]);
  const first = new Map<string, string>();
  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const cashKey = (t: TxnRow) => `CASH:${t.location_id ?? `unknown-${t.destination_zone ?? "zone"}`}`;
  const cashZone = new Map<string, string | null>();

  for (const t of txns) {
    const src = t.source_account_id;
    if (!col.has(src)) col.set(src, 0);
    if (!first.has(src)) first.set(src, t.timestamp);
    add(outflow, src, Number(t.amount));
    if (isWd(t)) continue;
    const d = t.destination_account_id as string;
    if (!col.has(d)) col.set(d, (col.get(src) ?? 0) + 1);
    if (!first.has(d)) first.set(d, t.timestamp);
    add(inflow, d, Number(t.amount));
  }
  const lastAccountCol = Math.max(0, ...col.values());
  for (const t of txns.filter(isWd)) {
    const k = cashKey(t);
    if (!col.has(k)) col.set(k, lastAccountCol + 1);
    if (!first.has(k)) first.set(k, t.timestamp);
    add(inflow, k, Number(t.amount));
    if (!cashZone.has(k)) cashZone.set(k, t.destination_zone ?? null);
  }

  const byCol = new Map<number, string[]>();
  for (const [id, c] of col) byCol.set(c, [...(byCol.get(c) ?? []), id]);
  const rowOf = new Map<string, number>();
  for (const ids of byCol.values()) {
    ids.sort((a, b) => (first.get(a) ?? "").localeCompare(first.get(b) ?? "") || a.localeCompare(b));
    ids.forEach((id, i) => rowOf.set(id, i));
  }

  const nodes: TrailNode[] = [];
  for (const [id, c] of col) {
    const received = Math.round((inflow.get(id) ?? 0) * 100) / 100;
    const sent = Math.round((outflow.get(id) ?? 0) * 100) / 100;
    if (id.startsWith("CASH:")) {
      const p = pts.get(id.slice(5));
      const z = p?.zone_id ?? cashZone.get(id) ?? null;
      const cz = z ? zoneCentroids[z] : undefined;
      nodes.push({
        id, kind: "cashout", col: c, row: rowOf.get(id) ?? 0,
        name: p ? `${p.location_type} withdrawal` : "Cash withdrawal",
        accountId: p?.location_id ?? null, bank: null, accountType: null, ageBand: null,
        received, sent: 0, held: 0, exposed: false, firstSeen: first.get(id) ?? null, zoneId: z,
        lat: p ? Number(p.latitude) : cz ? cz[0] : null, lng: p ? Number(p.longitude) : cz ? cz[1] : null,
        placeLabel: p ? `${p.location_id} in ${p.zone_id}` : z ? `zone ${z}` : "location not available",
        aadhaarMasked: null, panMasked: null,
      });
      continue;
    }
    const a = acc.get(id);
    const ident = identityOf(a);
    const victim = id === victimId;
    const held = victim ? 0 : Math.max(0, Math.round((received - sent) * 100) / 100);
    const zone = str(a?.home_branch_zone);
    const cz = zone ? zoneCentroids[zone] : undefined;
    nodes.push({
      id, kind: victim ? "victim" : "account", col: c, row: rowOf.get(id) ?? 0,
      name: ident.holder_name ?? "Name not available",
      accountId: id, bank: str(a?.bank_code), accountType: str(a?.account_type), ageBand: str(a?.account_age_band),
      received, sent, held, exposed: !closed && !victim && held > 0.5,
      firstSeen: first.get(id) ?? null, zoneId: zone, lat: cz ? cz[0] : null, lng: cz ? cz[1] : null,
      placeLabel: zone ? `home branch zone ${zone}` : "home branch not available",
      aadhaarMasked: ident.aadhaar_synthetic ? maskAadhaar(ident.aadhaar_synthetic) : null,
      panMasked: ident.pan_synthetic ? maskPan(ident.pan_synthetic) : null,
    });
  }

  const edges: TrailEdge[] = txns.map((t) => ({
    id: t.transaction_id, from: t.source_account_id, to: isWd(t) ? cashKey(t) : (t.destination_account_id as string),
    amount: Number(t.amount), time: t.timestamp, channel: t.channel, hop: Number(t.transfer_hop), withdrawal: isWd(t),
  }));
  const maxRows = Math.max(1, ...[...byCol.values()].map((v) => v.length));
  return { nodes, edges, cols: Math.max(0, ...col.values()) + 1, maxRows };
}
