// FraudCast – Phase 6 workflow settings and the synthetic escalation matrix (SYN-DOC-02).
// All recipients are SIMULATED teams. Nothing is ever sent outside FraudCast.

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

export function workflowConfig() {
  return {
    ackDelaySeconds: num(process.env.ACK_DELAY_SECONDS, 20), // real seconds before the simulated team acknowledges
    escalationMinutes: num(process.env.ESCALATION_MINUTES, 15), // demo minutes before an unacknowledged alert is overdue
    ackSimMinutes: num(process.env.ACK_SIM_MINUTES, 4), // demo minutes recorded as the acknowledgement time
  };
}

export type RecipientType = "ATM operations" | "Partner bank desk" | "Fraud escalation desk";
export type Recipient = { id: string; type: RecipientType; label: string; jurisdiction: string | null };

export const ESCALATION_DESK = "SYN-TEAM-FRAUD-ESCALATION";
export const PARTNER_DESK = "SYN-TEAM-PARTNER-DESK";
const JURISDICTIONS = ["CENTRAL", "NORTH", "EAST", "SOUTH", "WEST"];

export const RECIPIENTS: Recipient[] = [
  ...JURISDICTIONS.map((j) => ({
    id: `SYN-TEAM-ATMOPS-${j}`,
    type: "ATM operations" as const,
    label: `ATM operations – ${j[0]}${j.slice(1).toLowerCase()}`,
    jurisdiction: `SYN-JUR-${j}`,
  })),
  { id: PARTNER_DESK, type: "Partner bank desk", label: "Partner Bank Desk", jurisdiction: null },
  { id: ESCALATION_DESK, type: "Fraud escalation desk", label: "Fraud Escalation Desk", jurisdiction: null },
];

export function findRecipient(id: string): Recipient | undefined {
  return RECIPIENTS.find((r) => r.id === id);
}

/** Matrix rule: alert the ATM team owning the rank-1 zone; with no ranked forecast, go to the escalation desk. */
export function defaultRecipient(rank1Jurisdiction: string | null, forecastAvailable: boolean): Recipient {
  if (forecastAvailable && rank1Jurisdiction) {
    const r = RECIPIENTS.find((x) => x.jurisdiction === rank1Jurisdiction);
    if (r) return r;
  }
  return findRecipient(ESCALATION_DESK)!;
}
