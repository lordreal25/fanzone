create table if not exists rooms (
  code text primary key,
  title text not null check (char_length(title) between 1 and 80),
  match_title text not null check (char_length(match_title) between 1 and 120),
  host_name text not null check (char_length(host_name) between 1 and 24),
  host_token_hash text not null,
  access text not null check (access in ('public', 'private')),
  password_hash text,
  source_json text not null default '',
  sync_mode text not null default 'sync' check (sync_mode in ('sync', 'free')),
  playing boolean not null default false,
  position_sec double precision not null default 0,
  playback_at timestamptz not null default now(),
  revision integer not null default 1,
  is_live boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists rooms_access_created_idx on rooms (access, created_at desc);

create table if not exists room_members (
  room_code text not null references rooms (code) on delete cascade,
  client_id text not null,
  secret_hash text not null,
  display_name text not null,
  is_host boolean not null default false,
  last_seen timestamptz not null default now(),
  primary key (room_code, client_id)
);

create index if not exists room_members_seen_idx on room_members (room_code, last_seen desc);

create table if not exists room_messages (
  id bigserial primary key,
  room_code text not null references rooms (code) on delete cascade,
  sender_name text not null,
  sender_key text not null,
  body text not null check (char_length(body) between 1 and 400),
  kind text not null check (kind in ('chat', 'system', 'reaction')),
  created_at timestamptz not null default now()
);

create index if not exists room_messages_room_idx on room_messages (room_code, id desc);
