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
