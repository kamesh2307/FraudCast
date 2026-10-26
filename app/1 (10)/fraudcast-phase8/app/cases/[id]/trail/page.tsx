// Phase 8 – Trail map: accounts (victim + mules) and cash-outs as a connected line graph and a map.
import Link from "next/link";
import { notFound } from "next/navigation";
import TrailView from "../../../../components/fc/TrailView";
import { Badge, Card, Notice, StatusBadge } from "../../../../components/fc/ui";
import { loadCase } from "../../../../lib/data";
import { inr } from "../../../../lib/format";
import { identityOf } from "../../../../lib/identity";
import { db } from "../../../../lib/supabase";
import { buildTrail, type TrailAccountIn, type TrailPointIn } from "../../../../lib/trail";



export default async function TrailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = decodeURIComponent(id);
  const data = await loadCase(caseId);
  if (!data) notFound();
  const { kase: c, txns } = data;

  const locIds = [...new Set(txns.map((t) => t.location_id).filter((x): x is string => !!x))];
  const [z, p] = await Promise.all([
    db().from("zones").select("zone_id,centroid_latitude,centroid_longitude"),
    locIds.length
      ? db().from("cash_out_points").select("location_id,zone_id,location_type,latitude,longitude").in("location_id", locIds)
      : Promise.resolve({ data: [] as TrailPointIn[], error: null }),
  ]);
  if (z.error) throw new Error(`Could not read zones: ${z.error.message}`);
  if (p.error) throw new Error(`Could not read cash-out points: ${p.error.message}`);
  const zoneCentroids: Record<string, [number, number]> = {};
  for (const r of (z.data ?? []) as { zone_id: string; centroid_latitude: number; centroid_longitude: number }[]) {
    zoneCentroids[r.zone_id] = [Number(r.centroid_latitude), Number(r.centroid_longitude)];
  }

  const accounts = data.accounts as unknown as TrailAccountIn[];
  const trail = buildTrail({
    victimId: c.victim_account_id, closed: c.status === "Closed", txns,
    accounts, points: ((p.data ?? []) as TrailPointIn[]).map((x) => ({ ...x, latitude: Number(x.latitude), longitude: Number(x.longitude) })),
    zoneCentroids,
  });
  const hasIdentity = accounts.some((a) => identityOf(a).holder_name);
  const victim = identityOf(accounts.find((a) => a.account_id === c.victim_account_id));
  const holding = trail.nodes.filter((n) => n.exposed);

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/cases/${c.case_id}`} className="text-sm text-blue-700 hover:underline">← Back to {c.case_id}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Money trail</h1>
          <span className="font-mono text-sm text-slate-600">{c.case_id}</span>
          <StatusBadge status={c.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          From {victim.holder_name ?? "the victim"} ({c.victim_account_id}) through {trail.nodes.filter((n) => n.kind === "account").length} beneficiary account(s)
          {trail.nodes.some((n) => n.kind === "cashout") ? " to cash withdrawal" : ""}.{" "}
          {holding.length > 0 ? `${inr(holding.reduce((s, n) => s + n.held, 0))} is still held in ${holding.length} account(s).` : ""}
        </p>
      </div>

      {!hasIdentity && (
        <Notice tone="amber">Account-holder names and IDs are not loaded yet. Run <strong>phase8.sql</strong> in Supabase, then refresh this page.</Notice>
      )}

      <Card title="Trail map" right={<Badge tone="slate">Synthetic names and IDs</Badge>}>
        <TrailView nodes={trail.nodes} edges={trail.edges} />
      </Card>

      <p className="text-xs text-slate-500">
        Names, Aadhaar and PAN numbers are fictional and built so they can never match a real person. They describe account holders, not wrongdoers, and are never sent to the AI.
      </p>
    </div>
  );
}
