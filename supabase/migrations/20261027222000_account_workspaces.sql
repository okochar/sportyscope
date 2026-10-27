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
