// FraudCast – Step 20: the approved document library for the RAG assistant.
// ALL documents are SYNTHETIC, written for this demo. They are not real bank policy, not RBI/I4C text and not legal advice.
// Each "## " heading becomes one retrievable chunk. To add a document, add an entry and click
// "Build knowledge base" on the /knowledge page.

export type KnowledgeDoc = {
  document_id: string;
  title: string;
  source_type: "synthetic SOP" | "synthetic matrix" | "template" | "help" | "synthetic reference";
  version: string;
  effective_date: string; // YYYY-MM-DD
  access_level: "approved" | "draft" | "restricted";
  source_reference: string;
  body: string;
};

export const KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    document_id: "SYN-DOC-01",
    title: "SYNTHETIC Fraud Intervention SOP",
    source_type: "synthetic SOP",
    version: "1.2",
    effective_date: "2026-09-01",
    access_level: "approved",
    source_reference: "FraudCast demo library (synthetic)",
    body: `
## Purpose and scope
This synthetic standard operating procedure describes how a fraud-operations analyst handles an active digital-payment fraud case in FraudCast, from case review to outcome recording. It applies only to the FraudCast demonstration and is not real bank policy.

## Checks before escalation
Before raising an intervention alert, the analyst completes five checks. First, confirm the complaint details: fraud type, fraud time, report time and original amount. Second, confirm the money trail in the money-flow graph and identify every account still holding case funds. Third, confirm the current amount at risk is greater than zero. Fourth, check data freshness; if case data is older than 60 minutes, refresh it before escalating. Fifth, review the cash-out forecast status, its top-three zones, its data quality and its listed limitations.

## When to escalate
Escalate when funds are still held in the banking network and either the case priority is Critical or High, or the forecast is available with a cash-out window that is open or imminent. When the forecast shows insufficient evidence, the analyst may still escalate, but must write a justification in the alert explaining why.

## Human approval of alerts
Every intervention alert must be reviewed, edited if needed and approved by the analyst before it is sent. FraudCast drafts alerts but never sends them by itself. The approver name and approval time are recorded in the audit log.

## Actions FraudCast does not take
FraudCast does not freeze, hold or block any account, does not place debit holds and does not contact law enforcement. A request to place a hold on an account can only be made by an authorized Fraud Operations Manager (synthetic role) under the bank's own policy and applicable law, outside FraudCast. The analyst's alert asks the recipient team to review activity; it does not instruct any account action.

## Acknowledgement and overdue alerts
The recipient team should acknowledge an alert within 15 minutes. If an alert is not acknowledged within 15 minutes it becomes Overdue, and the analyst escalates it to the Fraud Escalation Desk (SYN-TEAM-FRAUD-ESCALATION).

## Recording the outcome
When the case is resolved, the analyst records the amounts protected, withdrawn and unresolved, which must add up to the original amount at risk. The analyst also records the actual cash-out zone if known, whether the forecast was overridden and why, and how useful the alert was on a scale of 1 to 5.
`,
  },
  {
    document_id: "SYN-DOC-02",
    title: "SYNTHETIC Escalation Matrix",
    source_type: "synthetic matrix",
    version: "1.0",
    effective_date: "2026-09-01",
    access_level: "approved",
    source_reference: "FraudCast demo library (synthetic)",
    body: `
## Who receives the alert (recipients by jurisdiction)
The alert recipient is the team that should receive the alert. Cash-out zone alerts go to the ATM operations team that owns the jurisdiction of the rank-1 forecast zone. SYN-JUR-CENTRAL goes to SYN-TEAM-ATMOPS-CENTRAL. SYN-JUR-NORTH goes to SYN-TEAM-ATMOPS-NORTH. SYN-JUR-EAST goes to SYN-TEAM-ATMOPS-EAST. SYN-JUR-SOUTH goes to SYN-TEAM-ATMOPS-SOUTH. SYN-JUR-WEST goes to SYN-TEAM-ATMOPS-WEST.

## Other recipient teams
If funds are held at another synthetic bank, also inform the Partner Bank Desk (SYN-TEAM-PARTNER-DESK). If the ranked zones fall in different jurisdictions, alert the owner of the rank-1 zone and copy the owners of the other ranked zones.

## Escalation path
Overdue alerts, alerts with insufficient evidence and any case above INR 10,00,000 at risk are escalated to the Fraud Escalation Desk (SYN-TEAM-FRAUD-ESCALATION). Only the Fraud Operations Manager (synthetic role) can authorize a request for an account hold, and that request is made outside FraudCast.
`,
  },
  {
    document_id: "SYN-DOC-03",
    title: "Approved Intervention Alert Template",
    source_type: "template",
    version: "1.1",
    effective_date: "2026-09-15",
    access_level: "approved",
    source_reference: "FraudCast demo library (synthetic)",
    body: `
## Mandatory alert fields
Every intervention alert must contain seven fields: the case reference, the priority, an evidence summary, a forecast summary with the top-three zones and their percentages, the time sensitivity including the cash-out window, the review being requested, and the human-authorization disclaimer.

## Wording rules for alerts
Describe accounts by their ID and transactions by amount and time. Do not describe any person as a criminal or suspect. State that the forecast is indicative. Ask the recipient team to review cash-out activity in the named zone; do not instruct them to freeze, hold or block accounts.

## Required disclaimer text
Each alert ends with this disclaimer: "This alert is an indicative forecast generated from synthetic demonstration data. Any account or enforcement action requires separate human authorization."
`,
  },
  {
    document_id: "SYN-DOC-04",
    title: "FraudCast Product Guide: Forecast Definitions",
    source_type: "help",
    version: "1.0",
    effective_date: "2026-10-01",
    access_level: "approved",
    source_reference: "FraudCast product help",
    body: `
## What the cash-out forecast shows
The forecast ranks the three geographic micro-zones where exposed funds are most likely to be withdrawn as cash, with a relative percentage for each and a combined percentage for all other zones. The percentages always add up to 100. A zone is an H3 hexagon of about 0.74 square kilometres.

## How zones are scored
Each zone is scored on five factors: linked cash-out history (35%), transaction velocity (25%), graph proximity (20%), time-pattern similarity (10%) and ATM or branch accessibility (10%). The score is multiplied by data quality and turned into relative percentages. The forecast is a transparent scoring rule, not a trained machine-learning model and not generated by AI.

## Insufficient evidence
If no account holding funds can be linked to any past cash-out, or the best zone is too weak, FraudCast shows "Insufficient evidence to narrow the forecast. Continue monitoring or conduct additional review." instead of guessing.

## Data quality and the cash-out window
Data quality starts at 100% and falls by 15 points for each missing critical field and by 10 points when the case data is stale. The cash-out window runs from the forecast time until similar past cases had usually been cashed out. If that time has already passed, the window is marked as imminent.

## Baseline comparison
The baseline is a simple rule that picks the zone where past cases of the same fraud type most often cashed out. FraudCast shows it next to the forecast so analysts can see when the two agree or disagree.
`,
  },
  {
    document_id: "SYN-DOC-05",
    title: "SYNTHETIC Money-Mule Pattern Reference",
    source_type: "synthetic reference",
    version: "1.0",
    effective_date: "2026-08-20",
    access_level: "approved",
    source_reference: "FraudCast demo library (synthetic training material)",
    body: `
## Common money-movement signals
Signals that often appear when stolen funds are being layered include newly opened accounts, a sudden spike in activity compared with the account's normal pattern, money received and sent on within minutes, and one account sending funds to several accounts in a short time (a fan-out or split).

## Signals are not proof
These signals describe transactions, not people. Any one signal can have an innocent explanation. Analysts must treat them as reasons to review, never as proof of wrongdoing, and must not label account holders.
`,
  },
  {
    document_id: "SYN-DOC-06",
    title: "SYNTHETIC Data Quality and Missing Information Procedure",
    source_type: "synthetic SOP",
    version: "1.0",
    effective_date: "2026-09-01",
    access_level: "approved",
    source_reference: "FraudCast demo library (synthetic)",
    body: `
## Handling missing fields
When a field such as the payment channel, the zone of the most recent transfer or the age of an account holding funds is missing, FraudCast shows it as not available and never fills it with an estimate. The analyst requests the missing value from the source system and records the request in the case comments.

## Handling stale data
Case data older than 60 minutes is stale. Refresh the case data and re-run the forecast before escalating. If the data cannot be refreshed, mention in the alert that the data is stale and when it was last updated.
`,
  },
  {
    document_id: "SYN-DOC-90",
    title: "DRAFT Escalation Matrix v2 (NOT APPROVED)",
    source_type: "synthetic matrix",
    version: "2.0-draft",
    effective_date: "2026-11-01",
    access_level: "draft",
    source_reference: "FraudCast demo library (synthetic, draft – must never be retrieved)",
    body: `
## Draft recipients
This draft proposes sending every alert directly to SYN-TEAM-DRAFT-ONLY. It is not approved and must never appear in assistant answers.
`,
  },
];
