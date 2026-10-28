create table public.voice_demo_shares (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.voice_agents(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.voice_demo_shares enable row level security;
revoke all on public.voice_demo_shares from anon, authenticated;
grant all on public.voice_demo_shares to service_role;
create index voice_demo_shares_agent_idx on public.voice_demo_shares(agent_id);
