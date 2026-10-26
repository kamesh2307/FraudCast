-- FraudCast Phase 5 – run ONCE in Supabase → SQL Editor (after Phase 2 schema.sql).
-- Safe to run again.

-- 1) Remember which embedding model built each chunk (switches vector search on only when it matches).
alter table rag_chunks add column if not exists embedding_model text;

-- 2) Vector search: the closest APPROVED chunks to a question (cosine similarity, 1 = identical).
create or replace function match_rag_chunks(query_embedding vector(1536), match_count int default 5)
returns table (chunk_id text, similarity double precision)
language sql
stable
as $$
  select c.chunk_id, 1 - (c.embedding <=> query_embedding) as similarity
  from rag_chunks c
  where c.access_level = 'approved'
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

-- 3) Faster reads of the latest AI result per case.
create index if not exists audit_case_action_idx on audit_events (case_id, action_type, event_id desc);
