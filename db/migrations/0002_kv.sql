-- small key/value store for worker cursors (IMAP last UID, etc.)
create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table kv_store enable row level security;
