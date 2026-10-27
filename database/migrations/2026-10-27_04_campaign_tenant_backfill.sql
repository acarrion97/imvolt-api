-- Repara campañas REST creadas antes de que empresa_id se conservara
-- durante la validación del request. Solo asigna la empresa de su propiedad.

update public.campanias_publicitarias c
set empresa_id = p.empresa_id
from public.propiedades p
where c.empresa_id is null
  and c.propiedad_id = p.propiedad_id
  and p.empresa_id is not null;

notify pgrst, 'reload schema';
