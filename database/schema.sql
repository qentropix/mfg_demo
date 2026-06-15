create table if not exists dashboard_snapshots (
  id serial primary key,
  shift_name text not null,
  plant_name text not null,
  last_updated timestamptz not null default now(),
  overall_oee numeric(5, 2) not null,
  total_output integer not null,
  good_parts integer not null,
  downtime_label text not null,
  downtime_minutes integer not null,
  active_alerts integer not null,
  critical_alerts integer not null,
  warning_alerts integer not null,
  quality_rate numeric(5, 2) not null
);

create table if not exists presses (
  id serial primary key,
  shift_name text not null,
  press_name text not null,
  status text not null,
  oee numeric(5, 2) not null,
  output_count integer not null,
  downtime_minutes integer not null,
  current_job text not null,
  sort_order integer not null
);

create table if not exists downtime_events (
  id serial primary key,
  shift_name text not null,
  reason text not null,
  minutes integer not null,
  percent numeric(5, 2) not null,
  sort_order integer not null
);

create table if not exists oee_trend (
  id serial primary key,
  shift_name text not null,
  day_label text not null,
  value numeric(5, 2) not null,
  sort_order integer not null
);

create table if not exists alerts (
  id serial primary key,
  shift_name text not null,
  severity text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists idx_dashboard_snapshots_shift on dashboard_snapshots (shift_name);
create index if not exists idx_presses_shift on presses (shift_name);
create index if not exists idx_downtime_shift on downtime_events (shift_name);
create index if not exists idx_oee_trend_shift on oee_trend (shift_name);
create index if not exists idx_alerts_shift on alerts (shift_name);
