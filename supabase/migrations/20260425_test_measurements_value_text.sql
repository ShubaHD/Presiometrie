-- Permite valori text în măsurători (ex. tip sondă, observații teren), nu doar numerice.
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'test_measurements'
      and c.column_name = 'value'
      and c.data_type in (
        'double precision',
        'real',
        'numeric',
        'bigint',
        'integer',
        'smallint'
      )
  ) then
    alter table public.test_measurements
      alter column value type text using (
        case when value is null then null else value::text end
      );
  end if;
end $$;
