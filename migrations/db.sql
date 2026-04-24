create table if not exists calls (
  id bigserial primary key,
  phone text not null,
  status text not null check (status in ('collecting', 'completed', 'failed')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  raw_transcript text
);

create index if not exists calls_phone_idx on calls (phone);

create table if not exists visits (
  id bigserial primary key,
  call_id bigint not null references calls(id) on delete cascade,
  plate text not null,
  company text not null,
  phone text not null,
  reason text not null,
  entry_time timestamptz not null default now()
);

create index if not exists visits_entry_time_idx on visits (entry_time desc);
create index if not exists visits_phone_idx on visits (phone);
