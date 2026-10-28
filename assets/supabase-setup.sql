-- No visitor login is required by the application. Database writes remain server-only.
create table if not exists public.scope_team_history (
  team_id text primary key,
  family text not null check (family = 'Real'),
  snapshot jsonb not null,
  updated_at timestamptz not null
);
create table if not exists public.scope_models (
  id text primary key,
  family text not null check (family in ('Real','vFootball','Instant','Scheduled')),
  model jsonb not null,
  trained_at timestamptz not null
);
create table if not exists public.scope_team_identities (
  family text not null,
  provider text not null,
  provider_team_id text not null,
  display_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  provenance jsonb not null,
  primary key (family, provider, provider_team_id)
);
create table if not exists public.scope_observations (
  family text not null,
  provider text not null,
  observation_id text not null,
  provider_match_id text,
  played_at timestamptz,
  home_key text not null,
  away_key text not null,
  measurements jsonb not null,
  provenance jsonb not null,
  primary key (family, provider, observation_id)
);
create index if not exists scope_observations_team_home on public.scope_observations (family, provider, home_key, played_at);
create index if not exists scope_observations_team_away on public.scope_observations (family, provider, away_key, played_at);
create table if not exists public.scope_condition_profiles (
  family text not null,
  model_id text not null references public.scope_models(id),
  profile_key text not null,
  conditions jsonb not null,
  source_coverage jsonb not null,
  primary key (family, model_id, profile_key)
);
alter table public.scope_team_history enable row level security;
alter table public.scope_models enable row level security;
alter table public.scope_team_identities enable row level security;
alter table public.scope_observations enable row level security;
alter table public.scope_condition_profiles enable row level security;
revoke all on public.scope_team_history, public.scope_models, public.scope_team_identities, public.scope_observations, public.scope_condition_profiles from anon, authenticated;
grant select, insert, update, delete on public.scope_team_history, public.scope_models, public.scope_team_identities, public.scope_observations, public.scope_condition_profiles to service_role;
-- No public write policies. Public application routes only ingest validated provider data.


-- Personal ticket backups. The API scopes every request to a SHA-256 hash of
-- a private 256-bit browser recovery key. No public table access is allowed.
create table if not exists public.scope_tickets (
  owner_id text not null check (owner_id ~ '^[a-f0-9]{64}$'),
  ticket_id text not null check (ticket_id ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, ticket_id)
);
alter table public.scope_tickets enable row level security;
revoke all on public.scope_tickets from anon, authenticated;
grant select, insert, update, delete on public.scope_tickets to service_role;
-- Client-supplied backups are never used as verified shared training records.


-- Account workspace components. Authentication is checked by the server using
-- Supabase getUser, and user_id is taken from that verified identity only.
create table if not exists public.scope_workspace (
  user_id uuid not null references auth.users(id) on delete cascade,
  component text not null check (component in ('slip','preferences','journal','imports')),
  payload jsonb not null,
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, component)
);
alter table public.scope_workspace enable row level security;
revoke all on public.scope_workspace from anon, authenticated;
grant select, insert, update, delete on public.scope_workspace to service_role;

create or replace function public.scope_save_workspace(
  p_user uuid, p_component text, p_payload jsonb, p_revision bigint
) returns bigint language plpgsql security invoker set search_path = '' as $$
begin
  if p_revision = 0 then
    insert into public.scope_workspace(user_id,component,payload,revision)
      values(p_user,p_component,p_payload,1)
      on conflict (user_id,component) do nothing;
  else
    update public.scope_workspace set payload=p_payload,revision=p_revision+1,updated_at=now()
      where user_id=p_user and component=p_component and revision=p_revision;
  end if;
  if not found then
    raise exception 'Workspace revision conflict' using errcode='40001';
  end if;
  return p_revision+1;
end;
$$;
revoke all on function public.scope_save_workspace(uuid,text,jsonb,bigint) from public, anon, authenticated;
grant execute on function public.scope_save_workspace(uuid,text,jsonb,bigint) to service_role;


-- The project's existing event-trigger helper is internal database plumbing.
-- Calling it as an anonymous or application user is unnecessary.
do $$ begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;


-- Account-owned review snapshots share the existing server-verified auth and CAS.
alter table public.scope_workspace drop constraint if exists scope_workspace_component_check;
alter table public.scope_workspace add constraint scope_workspace_component_check
  check (component in ('slip','preferences','journal','imports','review'));
