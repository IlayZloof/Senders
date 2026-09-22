-- Optional Instagram reel/video link on spots.
alter table spots add column if not exists instagram_url text;
