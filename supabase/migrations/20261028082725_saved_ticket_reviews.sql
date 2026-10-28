-- Account-owned review snapshots share the existing server-verified auth and CAS.
alter table public.scope_workspace drop constraint if exists scope_workspace_component_check;
alter table public.scope_workspace add constraint scope_workspace_component_check
  check (component in ('slip','preferences','journal','imports','review'));
