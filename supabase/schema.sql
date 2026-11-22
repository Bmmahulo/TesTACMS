create extension if not exists pgcrypto;

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 80),
  type text not null check (type in ('PIN', 'RFID')),
  value text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint credentials_type_value_unique unique (type, value),
  constraint credentials_value_format check (
    (type = 'PIN' and value ~ '^[0-9]{4,12}$') or
    (type = 'RFID' and value ~ '^([0-9A-F]{2}){4,10}$')
  )
);

create table if not exists public.unlock_commands (
  id uuid primary key default gen_random_uuid(),
  requested_by text not null default 'Lab dashboard',
  pulse_ms integer not null default 2000 check (pulse_ms between 100 and 10000),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'COMPLETED')),
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create table if not exists public.access_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('ACCESS_ATTEMPT', 'REMOTE_UNLOCK', 'DIAGNOSTIC')),
  source text not null check (source in ('PIN', 'RFID', 'MOCK_RFID', 'DASHBOARD', 'WEB_REMOTE', 'GATEWAY')),
  credential_value text,
  status text not null check (status in ('GRANTED', 'DENIED', 'QUEUED', 'EXECUTED')),
  process_time_ms integer check (process_time_ms is null or process_time_ms >= 0),
  command_id uuid references public.unlock_commands(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.access_events drop constraint if exists access_events_source_check;
alter table public.access_events add constraint access_events_source_check
  check (source in ('PIN', 'RFID', 'MOCK_RFID', 'DASHBOARD', 'WEB_REMOTE', 'GATEWAY'));

create table if not exists public.gateway_heartbeats (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  ip_address text,
  wifi_rssi integer,
  uart_ok boolean not null default false,
  i2c_ok boolean not null default false,
  rfid_ok boolean not null default false,
  esp32_ok boolean not null default true,
  solenoid_state text not null default 'UNKNOWN' check (solenoid_state in ('LOCKED', 'UNLOCKED', 'UNKNOWN')),
  updated_at timestamptz not null default now()
);

create index if not exists access_events_created_at_idx on public.access_events (created_at desc);
create index if not exists unlock_commands_pending_idx on public.unlock_commands (created_at) where status = 'PENDING';

alter table public.credentials enable row level security;
alter table public.access_events enable row level security;
alter table public.unlock_commands enable row level security;
alter table public.gateway_heartbeats enable row level security;

insert into public.credentials (label, type, value, active) values
  ('Lab PIN 01', 'PIN', '1111', true),
  ('Lab PIN 02', 'PIN', '2222', true),
  ('Lab PIN 03', 'PIN', '3333', true),
  ('RFID test card 01', 'RFID', 'FA1C6AE7', true),
  ('RFID test card 02', 'RFID', 'C9A28E9A', true)
on conflict (type, value) do nothing;

create or replace function public.complete_unlock_command(command_id_input uuid)
returns setof public.unlock_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_command public.unlock_commands;
begin
  update public.unlock_commands
    set status = 'COMPLETED', executed_at = now()
    where id = command_id_input and status = 'SENT'
    returning * into completed_command;

  if not found then
    return;
  end if;

  update public.access_events
    set status = 'EXECUTED'
    where command_id = command_id_input and status = 'QUEUED';

  return next completed_command;
end;
$$;

revoke all on function public.complete_unlock_command(uuid) from public, anon, authenticated;
grant execute on function public.complete_unlock_command(uuid) to service_role;