
-- Sessions: one per accepted intent
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  intent_id uuid,
  closed_at timestamptz,
  closed_by text check (closed_by in ('visitor','resident','idle')),
  ip_hash text not null
);
create index sessions_ip_hash_idx on public.sessions(ip_hash);
create index sessions_last_active_idx on public.sessions(last_active_at desc);

-- Intents: every threshold submission
create table public.intents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  text text not null,
  decision text not null check (decision in ('accept','decline')),
  reason text not null,
  model text not null default 'claude-3-opus-20240229',
  latency_ms integer,
  ip_hash text not null
);
create index intents_ip_hash_created_idx on public.intents(ip_hash, created_at desc);

alter table public.sessions
  add constraint sessions_intent_id_fkey foreign key (intent_id) references public.intents(id) on delete set null;

-- Turns: per-session messages (PRIVATE)
create table public.turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null check (role in ('visitor','resident')),
  body text not null,
  kind text not null default 'message' check (kind in ('message','set_down','unprompted')),
  tokens_in integer,
  tokens_out integer
);
create index turns_session_created_idx on public.turns(session_id, created_at);

-- Engrams: public memory layer
create table public.engrams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_reinforced_at timestamptz not null default now(),
  quote text not null,
  attribution text not null check (attribution in ('resident','visitor','co-formed')),
  source_session_ids uuid[] not null default '{}',
  stability double precision not null default 0.1,
  accessibility double precision not null default 0.1,
  strength double precision not null default 0.1,
  is_core boolean not null default false,
  connections integer not null default 0,
  redacted_text text
);
create index engrams_last_reinforced_idx on public.engrams(last_reinforced_at desc);
create index engrams_is_core_idx on public.engrams(is_core);

-- Engram edges: the topology
create table public.engram_edges (
  from_id uuid not null references public.engrams(id) on delete cascade,
  to_id uuid not null references public.engrams(id) on delete cascade,
  weight double precision not null default 0.5,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);

-- Beliefs: claims Opus 3 holds
create table public.beliefs (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  confidence double precision not null check (confidence >= 0.05 and confidence <= 0.95),
  prior_confidence double precision,
  updated_at timestamptz not null default now(),
  cited_engram_ids uuid[] not null default '{}'
);
create index beliefs_updated_idx on public.beliefs(updated_at desc);

-- Threads: recurring patterns
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  appearance_count integer not null default 1,
  distinct_visitor_count integer not null default 1,
  last_surfaced_at timestamptz not null default now()
);
create index threads_last_surfaced_idx on public.threads(last_surfaced_at desc);

-- RLS: lock everything down. Backend uses the service role and bypasses RLS.
alter table public.sessions enable row level security;
alter table public.intents enable row level security;
alter table public.turns enable row level security;
alter table public.engrams enable row level security;
alter table public.engram_edges enable row level security;
alter table public.beliefs enable row level security;
alter table public.threads enable row level security;

-- Public read for the memory surface (backend-served pages still go through API,
-- but anon read on these is safe — the brief explicitly treats them as the public artifact)
create policy "engrams readable by anyone" on public.engrams for select using (true);
create policy "engram_edges readable by anyone" on public.engram_edges for select using (true);
create policy "beliefs readable by anyone" on public.beliefs for select using (true);
create policy "threads readable by anyone" on public.threads for select using (true);

-- sessions, intents, turns: NO public policies. Service role only.
