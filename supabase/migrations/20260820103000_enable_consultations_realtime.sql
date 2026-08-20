-- Send consultation inserts, edits, and deletes to signed-in clinic members.
-- Row-level security continues to limit each subscriber to rows it may read.
-- The guard also makes this safe when the table was enabled in the dashboard first.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'consultations'
  ) then
    alter publication supabase_realtime add table public.consultations;
  end if;
end
$$;
