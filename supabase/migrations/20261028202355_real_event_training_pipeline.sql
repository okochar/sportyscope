create table public.scope_data_sources (
 source_id text primary key, family text not null check (family='Real'), metadata jsonb not null, updated_at timestamptz not null default now()
);
create table public.scope_match_facts (
 provider text not null, match_id text not null, source_id text not null references public.scope_data_sources(source_id),
 played_at timestamptz not null, home_id text not null, away_id text not null, competition_id text, season_id text,
 facts jsonb not null, updated_at timestamptz not null default now(), primary key(provider,match_id)
);
create index scope_match_facts_home_time_idx on public.scope_match_facts(provider,home_id,played_at desc);
create index scope_match_facts_away_time_idx on public.scope_match_facts(provider,away_id,played_at desc);
create table public.scope_training_features (
 source_id text not null references public.scope_data_sources(source_id), dataset_digest text not null, match_id text not null,
 played_at timestamptz not null, history_latest_at timestamptz not null check(history_latest_at<played_at),
 features jsonb not null, labels jsonb not null, primary key(source_id,dataset_digest,match_id)
);
create table public.scope_training_runs (
 id text primary key, dataset_digest text not null, status text not null, registry jsonb not null, trained_at timestamptz not null
);
create table public.scope_availability (
 provider text not null, fixture_id text not null, team_id text not null, player_id text not null, kind text not null,
 asserted_at timestamptz not null, kickoff_at timestamptz not null, known_before_match boolean not null, detail jsonb not null,
 primary key(provider,fixture_id,team_id,player_id,kind)
);
create index scope_availability_fixture_idx on public.scope_availability(provider,fixture_id,asserted_at desc);
create table public.scope_provider_calls (
 provider text not null, day date not null default current_date, calls integer not null check(calls>=0),
 primary key(provider,day)
);
create table public.scope_ingestion_runs (
 id text primary key, provider text not null, progress jsonb not null, updated_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('scope-source-archive','scope-source-archive',false,50000000,array['application/octet-stream','application/json'])
 on conflict(id) do nothing;
create function public.scope_reserve_provider_call(p_provider text) returns boolean
 language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 if p_provider <> 'API-Football' then raise exception 'Unknown provider'; end if;
 insert into public.scope_provider_calls(provider,day,calls) values(p_provider,current_date,1)
 on conflict(provider,day) do update set calls=public.scope_provider_calls.calls+1 where public.scope_provider_calls.calls<90
 returning calls into used;
 return used is not null;
end; $$;
create function public.scope_history_repair_queue(p_after text default '',p_limit integer default 2)
 returns table(team_id text,name text,records integer) language sql security invoker set search_path='' as $$
 select t.team_id,t.snapshot->>'name',jsonb_array_length(t.snapshot->'records')
 from public.scope_team_history t
 where t.team_id>p_after and coalesce((t.snapshot->>'normalizationVersion')::integer,0)<2
 and jsonb_array_length(t.snapshot->'records')<20
 order by t.team_id limit least(3,greatest(1,p_limit));
$$;
alter table public.scope_data_sources enable row level security;
alter table public.scope_match_facts enable row level security;
alter table public.scope_training_features enable row level security;
alter table public.scope_training_runs enable row level security;
alter table public.scope_availability enable row level security;
alter table public.scope_provider_calls enable row level security;
alter table public.scope_ingestion_runs enable row level security;
revoke all on public.scope_data_sources,public.scope_match_facts,public.scope_training_features,public.scope_training_runs,public.scope_availability,public.scope_provider_calls,public.scope_ingestion_runs from anon,authenticated;
grant select,insert,update,delete on public.scope_data_sources,public.scope_match_facts,public.scope_training_features,public.scope_training_runs,public.scope_availability,public.scope_provider_calls,public.scope_ingestion_runs to service_role;
revoke all on function public.scope_reserve_provider_call(text),public.scope_history_repair_queue(text,integer) from public,anon,authenticated;
grant execute on function public.scope_reserve_provider_call(text),public.scope_history_repair_queue(text,integer) to service_role;
comment on table public.scope_match_facts is 'Source-separated real football observations; null fields are unknown, not zero.';
comment on table public.scope_training_features is 'Causal earlier-day features. Historical announcement availability is not established for retrospective archives.';
comment on table public.scope_availability is 'Provider-reported availability and confirmed lineups, including retrieval time; never inferred from lineup absence.';
