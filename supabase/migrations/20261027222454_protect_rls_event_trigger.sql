-- The project's existing event-trigger helper is internal database plumbing.
-- Calling it as an anonymous or application user is unnecessary.
do $$ begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
