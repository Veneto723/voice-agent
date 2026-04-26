-- Enum Types
create type session_status as enum ('collecting', 'completed', 'failed');

-- Sessions Table
create table if not exists sessions (
  id text primary key,
  wxid text not null,
  plate text null,
  company text null,
  reason text null,
  status session_status not null,
  started_at timestamptz default now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS sessions_wxid_idx
ON sessions (wxid);
CREATE INDEX IF NOT EXISTS sessions_wxid_status_idx
ON sessions (wxid, status);
CREATE INDEX IF NOT EXISTS sessions_collecting_idx
ON sessions (wxid)
WHERE status = 'collecting';

-- Visitors Table
create table if not exists visitors (
  id bigserial primary key,
  wxid text not null,
  plate text not null,
  created_at timestamptz not null default now(),

  unique(wxid)
);