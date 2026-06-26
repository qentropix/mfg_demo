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

create table if not exists shift_daily_metrics (
  id serial primary key,
  shift_name text not null,
  metric_date date not null,
  plant_name text not null,
  overall_oee numeric(5, 2) not null,
  total_output integer not null,
  good_parts integer not null,
  downtime_minutes integer not null,
  quality_rate numeric(5, 2) not null,
  active_alerts integer not null,
  critical_alerts integer not null,
  warning_alerts integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists operational_events (
  id serial primary key,
  shift_name text not null,
  metric_date date not null,
  event_time timestamptz not null,
  event_type text not null,
  severity text not null,
  title text not null,
  details text not null,
  machine_name text,
  entity_type text,
  entity_id text,
  metric_value numeric(10, 2),
  created_at timestamptz not null default now()
);

create table if not exists ingestion_checkpoints (
  source_name text primary key,
  last_event_time timestamptz not null,
  row_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists ai_interactions (
  request_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  endpoint text not null,
  shift_name text not null,
  active_tab text,
  raw_query text not null,
  normalized_query text not null,
  intent text,
  retrieval_source text,
  retrieval_query_type text,
  sql_text text,
  tables_used jsonb,
  row_count integer,
  latency_ms integer,
  model_name text,
  response_status text not null default 'started',
  fallback_used boolean not null default false,
  response_preview text,
  response_length integer,
  feedback_rating integer,
  feedback_comment text
);

create table if not exists ai_feedback (
  id serial primary key,
  request_id text not null,
  created_at timestamptz not null default now(),
  rating integer not null,
  comment text,
  correct_answer text,
  shift_name text,
  active_tab text
);

create table if not exists ai_failures (
  id serial primary key,
  request_id text,
  created_at timestamptz not null default now(),
  failure_type text not null,
  failure_reason text not null,
  raw_query text not null,
  normalized_query text not null,
  shift_name text not null,
  active_tab text,
  detected_gap text,
  severity text not null default 'medium',
  status text not null default 'open',
  expected_answer text,
  source text,
  query_type text
);

create table if not exists retrieval_gaps (
  id serial primary key,
  gap_key text not null unique,
  gap_type text not null,
  capability_name text not null,
  example_queries jsonb not null default '[]'::jsonb,
  frequency integer not null default 0,
  failure_count integer not null default 0,
  proposal_json jsonb not null default '{}'::jsonb,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists retrieval_proposals (
  id serial primary key,
  gap_id integer not null references retrieval_gaps(id) on delete cascade,
  capability_name text not null,
  patch_json jsonb not null default '{}'::jsonb,
  test_json jsonb not null default '[]'::jsonb,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists idx_dashboard_snapshots_shift on dashboard_snapshots (shift_name);
create index if not exists idx_presses_shift on presses (shift_name);
create index if not exists idx_downtime_shift on downtime_events (shift_name);
create index if not exists idx_oee_trend_shift on oee_trend (shift_name);
create index if not exists idx_alerts_shift on alerts (shift_name);
create unique index if not exists idx_shift_daily_metrics_shift_metric_date on shift_daily_metrics (shift_name, metric_date);
create index if not exists idx_shift_daily_metrics_shift_date on shift_daily_metrics (shift_name, metric_date desc);
create index if not exists idx_operational_events_shift_time on operational_events (shift_name, event_time desc);
create index if not exists idx_operational_events_type on operational_events (event_type);
create index if not exists idx_ai_interactions_created_at on ai_interactions (created_at desc);
create index if not exists idx_ai_interactions_request_id on ai_interactions (request_id);
create index if not exists idx_ai_feedback_request_id on ai_feedback (request_id);
create index if not exists idx_ai_failures_created_at on ai_failures (created_at desc);
create index if not exists idx_ai_failures_gap on ai_failures (detected_gap);
create index if not exists idx_retrieval_gaps_status on retrieval_gaps (status);
create index if not exists idx_retrieval_proposals_gap_id on retrieval_proposals (gap_id);
create unique index if not exists idx_retrieval_proposals_gap_capability on retrieval_proposals (gap_id, capability_name);
