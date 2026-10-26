// FraudCast – row types that mirror the database tables (schema.sql).

export type CaseStatus = "New" | "In Review" | "Alert Sent" | "Acknowledged" | "Closed";

export type CaseRow = {
  case_id: string;
  fraud_type: string;
  original_amount: number;
  current_amount_at_risk: number;
  fraud_timestamp: string;
  report_timestamp: string;
  reporting_delay_minutes: number;
  payment_channel: string | null;
  initial_beneficiary_account_id: string;
  victim_account_id: string;
  victim_location_zone: string | null; // routing only – never used for forecasting
  status: CaseStatus;
  priority: string;
  priority_score: number;
  assigned_analyst: string | null;
  data_quality: number;
  missing_fields: string[] | null;
  edge_case_tag: string | null;
  data_as_of: string;
  created_at: string;
  updated_at: string;
};

export type TxnRow = {
  transaction_id: string;
  case_id: string;
  source_account_id: string;
  destination_account_id: string | null; // null = cash withdrawal
  amount: number;
  timestamp: string;
  channel: string;
  source_zone: string | null;
  destination_zone: string | null;
  status: string;
  transfer_hop: number;
  minutes_since_previous_transfer: number | null;
  location_id: string | null;
};

export type AccountRow = {
  account_id: string;
  bank_code: string;
  account_type: string;
  account_age_band: string | null;
  home_branch_zone: string | null;
  previous_synthetic_alert_count: number;
  previous_confirmed_synthetic_link_count: number;
  normal_activity_band: string;
  recent_activity_band: string;
  current_balance: number;
  review_status: string;
};

export type PointRow = {
  location_id: string;
  zone_id: string;
  location_type: string;
  synthetic_bank_code: string;
  operating_status: string;
};

export type AlertRow = {
  alert_id: string;
  case_id: string;
  recipient_type: string;
  recipient_id: string;
  priority: string;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  acknowledgement_status: string;
  acknowledgement_timestamp: string | null;
  action_status: string;
  escalation_deadline: string | null;
  created_at: string;
};

export type OutcomeRow = {
  outcome_id: string;
  case_id: string;
  actual_cashout_zone: string | null;
  amount_protected: number;
  amount_withdrawn: number;
  amount_unresolved: number;
  original_amount_at_risk: number;
  intervention_result: string;
  analyst_override: boolean;
  override_reason: string | null;
  closed_at: string | null;
};

export type PredictionRow = {
  case_id: string;
  run_id: string;
  rank: number;
  normalized_confidence: number;
  insufficient_evidence: boolean;
  created_at: string;
};

/* ---------- Phase 4 additions ---------- */

export type ZoneRow = {
  zone_id: string;
  h3_index: string;
  zone_name: string;
  jurisdiction: string;
  centroid_latitude: number;
  centroid_longitude: number;
  approximate_area: number;
  historical_synthetic_cashout_count: number;
};

export type CashPointRow = {
  location_id: string;
  zone_id: string;
  location_type: string;
  synthetic_bank_code: string;
  latitude: number;
  longitude: number;
  operating_status: string;
  availability_window: string;
};

export type HistoryRow = {
  historical_event_id: string;
  case_id: string;
  final_account_id: string;
  cashout_zone_id: string;
  cashout_timestamp: string;
  amount_withdrawn: number;
  fraud_type: string;
  transfer_hop_count: number;
  minutes_to_cashout: number;
  splitting_pattern: string;
};

/** Full prediction row as stored by the forecast engine. */
export type StoredPrediction = PredictionRow & {
  prediction_id: string;
  predicted_zone_id: string;
  forecast_window_start: string | null;
  forecast_window_end: string | null;
  amount_exposed: number;
  contributing_features: Record<string, unknown>;
  missing_data_flags: string[];
  data_quality: number;
  baseline_zone: string | null;
  model_version: string;
};
