-- Stop idle schedules and avoid rewriting unchanged verified result bodies.
create schema if not exists scope_private;
revoke all on schema scope_private from public, anon, authenticated;

create or replace function scope_private.sync_background_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
declare desired boolean; j record;
begin
 select exists(select 1 from public.scope_background_accounts where enabled) into desired;
 for j in select jobid,active from cron.job where jobname='scope-background-dispatch' loop
  if j.active is distinct from desired then perform cron.alter_job(j.jobid,active=>desired);end if;
 end loop;
 return null;
end; $$;
revoke all on function scope_private.sync_background_schedule() from public,anon,authenticated;
comment on function scope_private.sync_background_schedule() is 'Private statement trigger: toggles only the fixed SportyScope dispatcher after service-authorized account enablement changes. It cannot accept a command or arbitrary job identifier.';
create trigger scope_background_schedule_changed
 after insert or delete or update of enabled on public.scope_background_accounts
 for each statement execute function scope_private.sync_background_schedule();

create or replace function public.scope_save_observations(p_rows jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare written integer;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>100 then raise exception 'Supply at most 100 observations';end if;
 insert into public.scope_observations as existing
  (family,provider,observation_id,provider_match_id,played_at,home_key,away_key,measurements,provenance)
 select family,provider,observation_id,provider_match_id,played_at,home_key,away_key,measurements,provenance
 from jsonb_to_recordset(p_rows) as x(family text,provider text,observation_id text,provider_match_id text,played_at timestamptz,home_key text,away_key text,measurements jsonb,provenance jsonb)
 on conflict(family,provider,observation_id) do update set
  provider_match_id=excluded.provider_match_id,played_at=excluded.played_at,home_key=excluded.home_key,away_key=excluded.away_key,
  measurements=case when excluded.measurements->'ft'=existing.measurements->'ft' and coalesce(excluded.measurements->'ht','null'::jsonb)='null'::jsonb
   then jsonb_set(excluded.measurements,'{ht}',coalesce(existing.measurements->'ht','null'::jsonb)) else excluded.measurements end,
  provenance=excluded.provenance
 where (existing.provider_match_id,existing.played_at,existing.home_key,existing.away_key,existing.measurements)
 is distinct from (excluded.provider_match_id,excluded.played_at,excluded.home_key,excluded.away_key,
  case when excluded.measurements->'ft'=existing.measurements->'ft' and coalesce(excluded.measurements->'ht','null'::jsonb)='null'::jsonb
   then jsonb_set(excluded.measurements,'{ht}',coalesce(existing.measurements->'ht','null'::jsonb)) else excluded.measurements end);
 get diagnostics written=row_count;
 return written;
end; $$;
revoke all on function public.scope_save_observations(jsonb) from public,anon,authenticated;
grant execute on function public.scope_save_observations(jsonb) to service_role;

-- Respect the existing pause immediately; a later explicit Start reactivates it.
select cron.alter_job(jobid,active=>exists(select 1 from public.scope_background_accounts where enabled))
 from cron.job where jobname='scope-background-dispatch';
