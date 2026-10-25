-- FraudCast Phase 2: database schema (Supabase / Postgres)
-- Run this ONCE in Supabase > SQL Editor, BEFORE loading seed.sql.
-- All data is synthetic. Every ID must contain SYN or DEMO (DV-12).

create extension if not exists vector;   -- pgvector, used later for RAG (Phase 5)

-- Clean re-run support (drops in reverse dependency order)
drop table if exists audit_events, rag_chunks, outcomes, alerts, predictions,
  historical_cashout_events, transactions, cases, accounts, cash_out_points, zones cascade;

-- 14.4 Geographic zones (H3 resolution 8 hexagons)
create table zones (
  zone_id text primary key check (zone_id ~ '(SYN|DEMO)'),
  h3_index text unique,
  zone_name text not null,
  city text not null,
  district text not null,
  jurisdiction text not null,
  centroid_latitude numeric(9,6) not null,
  centroid_longitude numeric(9,6) not null,
  approximate_area numeric(6,2) not null,
  atm_count int not null check (atm_count >= 0),
  atm_density_band text not null check (atm_density_band in ('Low','Medium','High')),
  historical_synthetic_cashout_count int not null default 0,
  risk_trend text check (risk_trend in ('Rising','Stable','Falling'))
);

-- 14.5 Cash-out points (synthetic ATMs / branches / business correspondents)
create table cash_out_points (
  location_id text primary key check (location_id ~ '(SYN|DEMO)'),
  zone_id text not null references zones(zone_id),
  location_type text not null check (location_type in ('ATM','Branch','Business Correspondent')),
  synthetic_bank_code text not null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  operating_status text not null check (operating_status in ('Operational','Offline')),
  availability_window text not null,
  activity_band text not null check (activity_band in ('Low','Medium','High'))
);

-- 14.2 Accounts (pseudonymous; never real account numbers)
create table accounts (
  account_id text primary key check (account_id ~ '(SYN|DEMO)'),
  bank_code text not null,
  account_type text not null check (account_type in ('Savings','Current','Wallet','Prepaid')),
  account_age_band text check (account_age_band in ('Under 30 days','30-180 days','Over 180 days')),
  home_branch_zone text references zones(zone_id),
  previous_synthetic_alert_count int not null default 0,
  previous_confirmed_synthetic_link_count int not null default 0,
  normal_activity_band text not null check (normal_activity_band in ('Low','Medium','High')),
  recent_activity_band text not null check (recent_activity_band in ('Low','Medium','High','Spike')),
  current_balance numeric(14,2) not null check (current_balance >= 0),
  review_status text not null check (review_status in ('None','Under review','Hold requested (simulated)')),
  role_hint text not null check (role_hint in ('victim','mule'))  -- demo-only helper; never shown as a label on people
);

-- 14.1 Cases
create table cases (
  case_id text primary key check (case_id ~ '(SYN|DEMO)'),
  fraud_type text not null,
  original_amount numeric(14,2) not null check (original_amount > 0),
  current_amount_at_risk numeric(14,2) not null check (current_amount_at_risk >= 0),
  fraud_timestamp timestamptz not null,
  report_timestamp timestamptz not null,
  reporting_delay_minutes int not null,
  payment_channel text,                       -- nullable on purpose: missing data must show a warning
  initial_beneficiary_account_id text not null references accounts(account_id),
  victim_account_id text not null references accounts(account_id),
  victim_location_zone text references zones(zone_id),  -- routing only, NEVER a scoring input
  status text not null check (status in ('New','In Review','Alert Sent','Acknowledged','Closed')),
  priority text not null check (priority in ('Critical','High','Medium','Low')),
  priority_score numeric(4,3) not null,
  assigned_analyst text,
  data_quality numeric(3,2) not null check (data_quality between 0 and 1),
  missing_fields text[] not null default '{}',
  edge_case_tag text,                         -- demo helper so testers can find special cases
  data_as_of timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (report_timestamp >= fraud_timestamp),
  check (current_amount_at_risk <= original_amount)
);

-- 14.3 Transactions (cash withdrawals have no destination account)
create table transactions (
  transaction_id text primary key check (transaction_id ~ '(SYN|DEMO)'),
  case_id text not null references cases(case_id),
  source_account_id text not null references accounts(account_id),
  destination_account_id text references accounts(account_id),
  amount numeric(14,2) not null check (amount > 0),
  "timestamp" timestamptz not null,
  channel text not null,
  source_zone text references zones(zone_id),
  destination_zone text references zones(zone_id),
  status text not null check (status in ('Completed','Pending','Reversed')),
  transfer_hop int not null check (transfer_hop >= 0),
  minutes_since_previous_transfer int,
  location_id text references cash_out_points(location_id),
  check (destination_account_id is null or destination_account_id <> source_account_id),
  check ((channel in ('ATM withdrawal','Branch withdrawal','BC withdrawal')) = (destination_account_id is null))
);

-- 14.6 Historical cash-out events (past synthetic cases; training/evaluation history)
create table historical_cashout_events (
  historical_event_id text primary key check (historical_event_id ~ '(SYN|DEMO)'),
  case_id text not null,                      -- historical case ref (SYN-HCASE-xxx), not in active cases table
  final_account_id text not null references accounts(account_id),
  cashout_zone_id text not null references zones(zone_id),
  cashout_timestamp timestamptz not null,
  amount_withdrawn numeric(14,2) not null check (amount_withdrawn > 0),
  fraud_type text not null,
  transfer_hop_count int not null,
  minutes_to_cashout int not null check (minutes_to_cashout > 0),
  splitting_pattern text not null check (splitting_pattern in ('None','Fan-out','Fan-out then fan-in')),
  outcome text not null check (outcome in ('Withdrawn','Partially protected','Protected'))
);

-- 14.7 Predictions (EMPTY in Phase 2; written by the scoring engine in Phase 4)
create table predictions (
  prediction_id text primary key check (prediction_id ~ '(SYN|DEMO)'),
  run_id text not null,
  case_id text not null references cases(case_id),
  predicted_zone_id text not null,            -- 'OTHER' allowed for the remainder row
  rank int not null,
  normalized_confidence numeric(5,4) not null check (normalized_confidence between 0 and 1),
  forecast_window_start timestamptz,
  forecast_window_end timestamptz,
  amount_exposed numeric(14,2) not null,
  contributing_features jsonb not null,
  missing_data_flags jsonb not null default '[]',
  data_quality numeric(3,2) not null,
  baseline_zone text,
  insufficient_evidence boolean not null default false,
  model_version text not null,
  created_at timestamptz not null default now()
);

-- 14.8 Alerts
create table alerts (
  alert_id text primary key check (alert_id ~ '(SYN|DEMO)'),
  case_id text not null references cases(case_id),
  recipient_type text not null,
  recipient_id text not null,
  priority text not null,
  alert_reason text not null,
  draft_content text not null,
  edited_content text,
  approval_status text not null check (approval_status in ('Draft','Approved','Discarded')),
  approved_by text,
  approved_at timestamptz,
  acknowledgement_status text not null check (acknowledgement_status in ('Not sent','Pending','Acknowledged','Overdue')),
  acknowledgement_timestamp timestamptz,
  action_status text not null check (action_status in ('None','Review started','Action recorded')),
  escalation_deadline timestamptz,
  created_at timestamptz not null,
  check (approval_status <> 'Approved' or (approved_by is not null and approved_at is not null))
);

-- 14.9 Outcomes (forecast_rank / correctness are filled in Phase 4 after forecasts exist)
create table outcomes (
  outcome_id text primary key check (outcome_id ~ '(SYN|DEMO)'),
  case_id text not null unique references cases(case_id),
  actual_cashout_zone text references zones(zone_id),
  actual_cashout_timestamp timestamptz,
  forecast_rank int,
  forecast_correct_top_one boolean,
  forecast_correct_top_three boolean,
  original_amount_at_risk numeric(14,2) not null,
  amount_protected numeric(14,2) not null check (amount_protected >= 0),
  amount_withdrawn numeric(14,2) not null check (amount_withdrawn >= 0),
  amount_unresolved numeric(14,2) not null check (amount_unresolved >= 0),
  intervention_result text not null,
  analyst_override boolean not null default false,
  override_reason text,
  analyst_feedback text,
  alert_usefulness int check (alert_usefulness between 1 and 5),
  case_status text not null,
  closed_at timestamptz,
  check (abs(amount_protected + amount_withdrawn + amount_unresolved - original_amount_at_risk) <= 1),  -- DV-06
  check (not analyst_override or override_reason is not null)
);

-- 14.10 RAG chunks (EMPTY in Phase 2; filled in Phase 5). 1536 = OpenAI text-embedding-3-small size.
create table rag_chunks (
  chunk_id text primary key,
  document_id text not null,
  title text not null,
  source_type text not null,
  version text not null,
  effective_date date not null,
  section text not null,
  content text not null,
  embedding vector(1536),
  access_level text not null check (access_level in ('approved','draft','restricted')),
  source_reference text not null
);

-- 14.11 Audit events (append-only)
create table audit_events (
  event_id text primary key,
  user_id text not null,
  case_id text,
  action_type text not null,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  "timestamp" timestamptz not null default now(),
  model_version text
);
-- Make audit append-only: block UPDATE and DELETE
create or replace function block_audit_change() returns trigger as $$
begin raise exception 'audit_events is append-only'; end; $$ language plpgsql;
create trigger audit_no_update before update or delete on audit_events
  for each row execute function block_audit_change();

-- Helpful indexes
create index on transactions(case_id);
create index on historical_cashout_events(final_account_id);
create index on predictions(case_id, run_id);
