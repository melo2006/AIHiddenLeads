create table public.custom_avatar_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  environment text not null check (environment in ('sandbox','live')),
  checkout_session_id text not null unique,
  used_at timestamptz,
  face_id text,
  created_at timestamptz not null default now()
);
alter table public.custom_avatar_credits enable row level security;
revoke all on public.custom_avatar_credits from anon, authenticated;
grant all on public.custom_avatar_credits to service_role;
create policy "Owners view their avatar credits" on public.custom_avatar_credits for select to authenticated using (auth.uid() = user_id);
grant select on public.custom_avatar_credits to authenticated;