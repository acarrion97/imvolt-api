-- Repair the propiedades -> proyectos relationship on databases that were
-- created before the optional proyecto_id association was added.
alter table public.propiedades
    add column if not exists proyecto_id bigint;

do $$
begin
    if not exists (
        select 1
        from pg_constraint c
        join pg_attribute source_column
          on source_column.attrelid = c.conrelid
         and source_column.attnum = c.conkey[1]
        join pg_attribute target_column
          on target_column.attrelid = c.confrelid
         and target_column.attnum = c.confkey[1]
        where c.contype = 'f'
          and array_length(c.conkey, 1) = 1
          and array_length(c.confkey, 1) = 1
          and c.conrelid = 'public.propiedades'::regclass
          and c.confrelid = 'public.proyectos'::regclass
          and source_column.attname = 'proyecto_id'
          and target_column.attname = 'proyecto_id'
    ) then
        alter table public.propiedades
            add constraint fk_propiedades_proyecto
            foreign key (proyecto_id)
            references public.proyectos (proyecto_id)
            on delete set null;
    end if;
end
$$;

notify pgrst, 'reload schema';
