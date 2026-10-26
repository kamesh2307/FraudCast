-- FraudCast Phase 7 – one-click demo reset.
-- Run ONCE, on FRESH seed data, in this order:
--   1) schema.sql   2) seed.sql   3) phase5.sql   4) phase7.sql (this file)
-- It saves a copy of the fresh demo data and creates reset_demo(), which restores that copy.

begin; -- all-or-nothing: if the safety check fails, nothing below is applied

-- 0) Safety check: refuse to snapshot data that has already been changed by testing.
do $$
declare a int; o int; c int; odd int;
begin
  select count(*) into a from public.alerts;
  select count(*) into o from public.outcomes;
  select count(*) into c from public.cases where status = 'Closed';
  select count(*) into odd from public.alerts where alert_id !~ '^SYN-ALT-0[0-9]{2}$';
  if a <> 11 or o <> 8 or c <> 8 or odd > 0 then
    raise exception 'FraudCast: this is not the fresh Phase 2 seed (alerts=%, outcomes=%, closed cases=%). Run schema.sql, seed.sql and phase5.sql first, then this file.', a, o, c;
  end if;
end $$;

-- 1) Snapshot of the fresh demo data, in a private schema (not exposed to the browser API).
create schema if not exists fc_seed;
revoke all on schema fc_seed from public, anon, authenticated;
drop table if exists fc_seed.cases, fc_seed.transactions, fc_seed.alerts, fc_seed.outcomes, fc_seed.audit_events;
create table fc_seed.cases        as table public.cases;
create table fc_seed.transactions as table public.transactions;
create table fc_seed.alerts       as table public.alerts;
create table fc_seed.outcomes     as table public.outcomes;
create table fc_seed.audit_events as select * from public.audit_events where action_type = 'CASE_INGESTED';

-- 2) reset_demo(): put cases, transactions, alerts, outcomes and the audit log back to the snapshot.
--    Forecasts are cleared (the app re-runs them straight after). The knowledge base is not touched.
--    Safety-evaluation results, knowledge-base builds and previous resets are kept in the audit log.
--    Note: this is the ONLY way audit entries are removed, and every reset is itself logged (DEMO_RESET).
create or replace function public.reset_demo() returns json
language plpgsql
security definer
set search_path = public, fc_seed
as $$
declare kept int;
begin
  if not exists (select 1 from fc_seed.cases) then
    raise exception 'Demo snapshot missing. Run phase7.sql on fresh seed data.';
  end if;
  drop table if exists _fc_keep;
  create temp table _fc_keep on commit drop as
    select * from public.audit_events where action_type in ('SAFETY_EVAL_RUN', 'KNOWLEDGE_BASE_BUILT', 'DEMO_RESET');
  get diagnostics kept = row_count;
  truncate table public.predictions, public.outcomes, public.alerts, public.transactions, public.cases, public.audit_events;
  insert into public.cases        select * from fc_seed.cases;
  insert into public.transactions select * from fc_seed.transactions;
  insert into public.alerts       select * from fc_seed.alerts;
  insert into public.outcomes     select * from fc_seed.outcomes;
  insert into public.audit_events select * from fc_seed.audit_events;
  insert into public.audit_events select * from _fc_keep;
  return json_build_object(
    'cases', (select count(*) from public.cases),
    'alerts', (select count(*) from public.alerts),
    'outcomes', (select count(*) from public.outcomes),
    'kept_events', kept
  );
end $$;

-- 3) demo_reset_ready(): lets the Status page confirm the snapshot exists.
create or replace function public.demo_reset_ready() returns json
language sql
stable
security definer
set search_path = public, fc_seed
as $$
  select json_build_object(
    'cases', (select count(*) from fc_seed.cases),
    'transactions', (select count(*) from fc_seed.transactions),
    'alerts', (select count(*) from fc_seed.alerts),
    'outcomes', (select count(*) from fc_seed.outcomes)
  );
$$;

-- 4) Only the server (service role) may call these.
revoke all on function public.reset_demo() from public, anon, authenticated;
revoke all on function public.demo_reset_ready() from public, anon, authenticated;
grant execute on function public.reset_demo() to service_role;
grant execute on function public.demo_reset_ready() to service_role;

commit;
