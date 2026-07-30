-- Migración: permite subir (insert) y leer (select) archivos en el bucket
-- "photos" usando la anon key. Que el bucket sea "público" solo controla la
-- lectura vía URL pública; las subidas siguen necesitando una política RLS
-- explícita sobre storage.objects. Ejecuta esto en el SQL Editor de Supabase.

create policy "anon insert photos bucket"
on storage.objects for insert
to anon
with check (bucket_id = 'photos');

create policy "anon select photos bucket"
on storage.objects for select
to anon
using (bucket_id = 'photos');
