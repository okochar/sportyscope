create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create table public.scope_background_accounts(
 user_id uuid not null references auth.users(id) on delete cascade,
 family text not null check(family in('Real','vFootball','Tracking')),
 enabled boolean not null default false, settings jsonb not null default '{}'::jsonb,
 state jsonb not null default '{}'::jsonb, next_run_at timestamptz not null default now(),
 last_run_at timestamptz, last_status text not null default 'idle', last_error text,
 updated_at timestamptz not null default now(), primary key(user_id,family)
);
create index scope_background_due_idx on public.scope_background_accounts(next_run_at) where enabled;
create table public.scope_background_jobs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,family text not null,
 token_hash bytea not null,status text not null default 'queued' check(status in('queued','running','complete','failed')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '3 minutes',
 finished_at timestamptz,result jsonb,foreign key(user_id,family) references public.scope_background_accounts(user_id,family) on delete cascade
);
create index scope_background_jobs_expiry_idx on public.scope_background_jobs(expires_at) where status in('queued','running');
create table public.scope_tracking_queue(
 user_id uuid not null references auth.users(id) on delete cascade,ticket_id text not null,
 payload jsonb not null,next_check_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(user_id,ticket_id)
);
create index scope_tracking_due_idx on public.scope_tracking_queue(user_id,next_check_at);
create table public.scope_predictions(
 user_id uuid not null references auth.users(id) on delete cascade,family text not null,
 forecast_key text not null,event_id text not null,event_time timestamptz not null,
 forecasted_at timestamptz not null,probability double precision not null check(probability>0 and probability<1),
 model_version text not null,selection jsonb not null,outcome jsonb,settled_at timestamptz,
 primary key(user_id,family,forecast_key),check(forecasted_at<event_time)
);
create index scope_predictions_settled_idx on public.scope_predictions(user_id,family,event_time) where settled_at is not null;
create table public.scope_calibration_models(
 user_id uuid not null references auth.users(id) on delete cascade,family text not null,
 artifact jsonb not null,updated_at timestamptz not null default now(),primary key(user_id,family)
);
create function public.scope_claim_background_job(p_id uuid,p_token text) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare j public.scope_background_jobs; a public.scope_background_accounts;
begin
 if p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 update public.scope_background_jobs set status='running'
 where id=p_id and status='queued' and expires_at>now()
 and token_hash=extensions.digest(decode(p_token,'hex'),'sha256') returning * into j;
 if j.id is null then return null; end if;
 select * into a from public.scope_background_accounts where user_id=j.user_id and family=j.family and enabled;
 if a.user_id is null then update public.scope_background_jobs set status='failed',finished_at=now() where id=j.id;return null;end if;
 return jsonb_build_object('id',j.id,'userId',j.user_id,'family',j.family,'settings',a.settings,'state',a.state);
end; $$;
create function public.scope_finish_background_job(p_id uuid,p_state jsonb,p_delay integer,p_result jsonb) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare j public.scope_background_jobs;
begin
 update public.scope_background_jobs set status='complete',finished_at=now(),result=p_result
 where id=p_id and status='running' returning * into j;
 if j.id is null then return false;end if;
 update public.scope_background_accounts set state=p_state,next_run_at=now()+make_interval(secs=>least(1800,greatest(30,p_delay))),
 last_run_at=now(),last_status=coalesce(p_result->>'status','complete'),last_error=p_result->>'error',updated_at=now()
 where user_id=j.user_id and family=j.family;
 return true;
end; $$;
create function public.scope_set_background(p_user uuid,p_family text,p_enabled boolean,p_settings jsonb) returns boolean
 language sql security invoker set search_path='' as $$
 insert into public.scope_background_accounts(user_id,family,enabled,settings,next_run_at)
 values(p_user,p_family,p_enabled,p_settings,now())
 on conflict(user_id,family) do update set enabled=excluded.enabled,settings=excluded.settings,next_run_at=now(),updated_at=now()
 returning true;
$$;
create function public.scope_set_prediction_outcome(p_user uuid,p_family text,p_key text,p_outcome jsonb) returns boolean
 language sql security invoker set search_path='' as $$
 update public.scope_predictions set outcome=p_outcome,settled_at=now()
 where user_id=p_user and family=p_family and forecast_key=p_key
 and forecasted_at<event_time and p_outcome->>'status' in('won','lost') returning true;
$$;
create function public.scope_record_prediction(p_user uuid,p_family text,p_key text,p_event text,p_time timestamptz,p_forecast timestamptz,p_probability double precision,p_model text,p_selection jsonb) returns boolean
 language sql security invoker set search_path='' as $$
 insert into public.scope_predictions(user_id,family,forecast_key,event_id,event_time,forecasted_at,probability,model_version,selection)
 values(p_user,p_family,p_key,p_event,p_time,p_forecast,p_probability,p_model,p_selection)
 on conflict(user_id,family,forecast_key) do nothing returning true;
$$;
create function public.scope_drop_tracking(p_user uuid,p_ticket text) returns boolean
 language sql security invoker set search_path='' as $$
 delete from public.scope_tracking_queue where user_id=p_user and ticket_id=p_ticket returning true;
$$;
create function public.scope_dispatch_background() returns integer
 language plpgsql security definer set search_path='' as $$
declare a record; jid uuid; token text; request_id bigint; sent integer:=0;
begin
 update public.scope_background_jobs set status='failed',finished_at=now(),result='{"status":"expired","error":"Worker lease expired; scheduled retry retained."}'::jsonb
 where status in('queued','running') and expires_at<now();
 for a in select * from public.scope_background_accounts x
 where enabled and next_run_at<=now() and not exists(select 1 from public.scope_background_jobs j where j.user_id=x.user_id and j.family=x.family and j.status in('queued','running') and j.expires_at>now())
 order by next_run_at for update skip locked limit 2 loop
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.scope_background_jobs(user_id,family,token_hash) values(a.user_id,a.family,extensions.digest(decode(token,'hex'),'sha256')) returning id into jid;
  update public.scope_background_accounts set next_run_at=now()+interval '4 minutes' where user_id=a.user_id and family=a.family;
  select net.http_post(url:='https://sportyscope.vercel.app/api/account?view=background-step',
   body:=jsonb_build_object('jobId',jid,'token',token),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=65000) into request_id;
  sent:=sent+1;
 end loop;
 return sent;
end; $$;
alter table public.scope_background_accounts enable row level security;
alter table public.scope_background_jobs enable row level security;
alter table public.scope_tracking_queue enable row level security;
alter table public.scope_predictions enable row level security;
alter table public.scope_calibration_models enable row level security;
revoke all on public.scope_background_accounts,public.scope_background_jobs,public.scope_tracking_queue,public.scope_predictions,public.scope_calibration_models from anon,authenticated;
grant select,insert,update,delete on public.scope_background_accounts,public.scope_background_jobs,public.scope_tracking_queue,public.scope_predictions,public.scope_calibration_models to service_role;
revoke all on function public.scope_claim_background_job(uuid,text),public.scope_finish_background_job(uuid,jsonb,integer,jsonb),public.scope_set_background(uuid,text,boolean,jsonb),public.scope_set_prediction_outcome(uuid,text,text,jsonb),public.scope_record_prediction(uuid,text,text,text,timestamptz,timestamptz,double precision,text,jsonb),public.scope_drop_tracking(uuid,text),public.scope_dispatch_background() from public,anon,authenticated;
grant execute on function public.scope_claim_background_job(uuid,text),public.scope_finish_background_job(uuid,jsonb,integer,jsonb),public.scope_set_background(uuid,text,boolean,jsonb),public.scope_set_prediction_outcome(uuid,text,text,jsonb),public.scope_record_prediction(uuid,text,text,text,timestamptz,timestamptz,double precision,text,jsonb),public.scope_drop_tracking(uuid,text),public.scope_dispatch_background() to service_role;
comment on function public.scope_dispatch_background() is 'Dispatches bounded account jobs to a fixed HTTPS origin using single-use, short-lived random capabilities; no authentication secret is embedded in a schedule.';
