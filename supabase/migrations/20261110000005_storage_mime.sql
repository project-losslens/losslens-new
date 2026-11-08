-- FN-06: allow the MIME types the recorders actually produce.

update storage.buckets
set allowed_mime_types = array['audio/webm','audio/mp4','audio/ogg','audio/x-m4a']::text[]
where id = 'precious-pacts';

update storage.buckets
set allowed_mime_types = array['video/webm','video/mp4']::text[]
where id = 'mirror-recordings';

notify pgrst, 'reload schema';
