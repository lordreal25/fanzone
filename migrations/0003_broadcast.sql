create table if not exists broadcast (
  id integer primary key check (id = 1),
  title text not null default '',
  source_json text not null default '',
  password_hash text,
  updated_at timestamptz not null default now()
);

insert into broadcast (id) values (1) on conflict (id) do nothing;
