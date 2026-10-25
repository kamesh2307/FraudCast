// Step 12 – Interactive Money-Flow Graph (PRD 12.4)
import Link from "next/link";
import { notFound } from "next/navigation";
import MoneyFlowGraph from "../../../../components/fc/MoneyFlowGraph";
import { Badge, Card, StatusBadge } from "../../../../components/fc/ui";
import { amountWithdrawn, buildGraph, holdings } from "../../../../lib/calc";
import { loadCase } from "../../../../lib/data";
import { inr } from "../../../../lib/format";

export default async function GraphPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadCase(decodeURIComponent(id));
  if (!data) notFound();
  const { kase: c, txns, accounts, points, outcome } = data;

  const graph = buildGraph(
    c,
    txns,
    new Map(accounts.map((a) => [a.account_id, a])),
    new Map(points.map((p) => [p.location_id, p])),
    { inr },
  );
  const closed = c.status === "Closed";
  const hold = holdings(txns);
  const holders = [...hold.entries()].filter(([acc, h]) => acc !== c.victim_account_id && h.held > 0);
  const heldTotal = holders.reduce((s, [, h]) => s + h.held, 0);
  const withdrawn = amountWithdrawn(txns);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/cases/${c.case_id}`} className="text-sm text-blue-700 hover:underline">← Back to {c.case_id}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Money-flow graph</h1>
          <span className="font-mono text-sm text-slate-600">{c.case_id}</span>
          <StatusBadge status={c.status} />
        </div>
      </div>

      <Card title="Current fund position">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-xs text-slate-500">Original amount</div>
            <div className="text-lg font-semibold">{inr(c.original_amount)}</div>
          </div>
          {!closed ? (
            <div>
              <div className="text-xs text-slate-500">Still held in the banking network</div>
              <div className="text-lg font-semibold text-amber-800">{inr(heldTotal)}</div>
              <div className="text-xs text-slate-500">
                in {holders.length} account(s): {holders.map(([acc]) => acc).join(", ") || "—"}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-slate-500">Outcome (closed)</div>
              <div className="text-sm font-medium">
                {inr(outcome?.amount_protected ?? 0)} protected · {inr(outcome?.amount_withdrawn ?? 0)} withdrawn · {inr(outcome?.amount_unresolved ?? 0)} unresolved
              </div>
            </div>
          )}
          <div>
            <div className="text-xs text-slate-500">Withdrawn as cash</div>
            <div className="text-lg font-semibold text-red-800">{inr(withdrawn)}</div>
          </div>
          <div className="ml-auto self-center">
            <Badge tone="slate">Synthetic data</Badge>
          </div>
        </div>
      </Card>

      <MoneyFlowGraph nodes={graph.nodes} edges={graph.edges} closed={closed} />
    </div>
  );
}
