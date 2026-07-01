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
  maintenance_notes text not null default '',
  sort_order integer not null
);

alter table presses
  add column if not exists maintenance_notes text not null default '';

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


create table if not exists production_orders (
  id serial primary key,
  order_id text not null,
  shift_name text not null,
  part_number text not null,
  part_name text not null,
  machine_assigned text not null,
  qty_ordered integer not null,
  qty_produced integer not null,
  due_date timestamptz not null,
  status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists material_inventory_current (
  id serial primary key,
  material_code text not null,
  shift_name text not null,
  material_name text not null,
  unit text not null,
  stock_qty numeric(12, 2) not null,
  reorder_point numeric(12, 2) not null,
  reorder_qty numeric(12, 2) not null,
  daily_usage_rate numeric(12, 2) not null,
  days_of_supply numeric(8, 2) not null,
  status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists supplier_records (
  id serial primary key,
  supplier_id text not null unique,
  supplier_name text not null,
  materials jsonb not null default '[]'::jsonb,
  contact jsonb not null default '{}'::jsonb,
  lead_time_days integer not null,
  last_delivery_status text not null,
  risk_level text not null,
  audit_score numeric(5, 2) not null,
  qualified_date timestamptz not null,
  next_requal_date timestamptz not null,
  status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists supplier_audit_records (
  id serial primary key,
  supplier_id text not null references supplier_records(supplier_id) on delete cascade,
  audit_date timestamptz not null,
  audit_type text not null,
  score numeric(5, 2),
  outcome text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists workforce_roster_current (
  id serial primary key,
  shift_name text not null,
  employee_id text not null,
  employee_name text not null,
  role text not null,
  assigned_machine text,
  shift_status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists employee_certification_records (
  id serial primary key,
  shift_name text not null,
  employee_id text not null,
  certification_name text not null,
  issued_date timestamptz not null,
  expiry_date timestamptz not null,
  issued_by text not null default 'Internal QA',
  status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists quality_defects_current (
  id serial primary key,
  shift_name text not null,
  defect_type text not null,
  defect_count integer not null,
  trend text not null,
  period text not null default 'current',
  updated_at timestamptz not null default now()
);

create table if not exists ncr_records (
  id serial primary key,
  ncr_id text not null,
  shift_name text not null,
  opened_at timestamptz not null,
  machine_name text not null,
  defect_type text not null,
  qty_affected integer not null,
  status text not null,
  assigned_to text not null,
  capa_id text,
  description text not null,
  severity text not null default 'Medium',
  updated_at timestamptz not null default now()
);

create table if not exists capa_records (
  id serial primary key,
  capa_id text not null unique,
  shift_name text not null default 'Shift A',
  ncr_id text,
  machine_name text not null,
  defect_type text not null,
  source text,
  issue_description text not null,
  severity text not null,
  assigned_to text not null,
  opened_at timestamptz not null,
  due_at timestamptz not null,
  closed_at timestamptz,
  status text not null,
  percent_complete integer not null default 0,
  root_cause text,
  updated_at timestamptz not null default now()
);

create table if not exists capa_actions (
  id serial primary key,
  capa_id text not null references capa_records(capa_id) on delete cascade,
  action_id integer not null,
  description text not null,
  owner text not null,
  due_at timestamptz not null,
  completed boolean not null default false
);

create table if not exists capa_stage_history (
  id serial primary key,
  capa_id text not null references capa_records(capa_id) on delete cascade,
  stage text not null,
  stage_at timestamptz not null
);

create table if not exists calibration_records (
  id serial primary key,
  asset_tag text not null unique,
  instrument_name text not null,
  instrument_type text not null,
  location text not null,
  interval_days integer not null,
  last_calibrated timestamptz not null,
  next_due timestamptz not null,
  cert_number text not null,
  calibrated_by text not null,
  result_measured text,
  result_tolerance text,
  result_outcome text not null default 'Pass',
  status text not null,
  scheduled_at timestamptz,
  scheduled_provider text,
  scheduled_type text,
  updated_at timestamptz not null default now()
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


create table if not exists order_history (
  id serial primary key,
  order_id text not null,
  shift_name text not null,
  metric_date date not null,
  machine_name text not null,
  part_number text not null,
  part_name text not null,
  status text not null,
  qty_ordered integer not null,
  qty_produced integer not null,
  progress_percent numeric(5, 2) not null,
  due_date timestamptz not null,
  risk_reason text,
  created_at timestamptz not null default now()
);

create table if not exists material_inventory_history (
  id serial primary key,
  material_code text not null,
  material_name text not null,
  shift_name text not null,
  metric_date date not null,
  supplier_id text not null,
  supplier_name text not null,
  stock_qty numeric(12, 2) not null,
  reorder_point numeric(12, 2) not null,
  daily_usage_rate numeric(12, 2) not null,
  days_of_supply numeric(6, 2) not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists supplier_audit_history (
  id serial primary key,
  supplier_id text not null,
  supplier_name text not null,
  audit_date date not null,
  status text not null,
  risk_level text not null,
  audit_score numeric(5, 2) not null,
  outcome text not null,
  lead_time_days integer not null,
  materials jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists workforce_roster_history (
  id serial primary key,
  employee_id text not null,
  employee_name text not null,
  shift_name text not null,
  metric_date date not null,
  role text not null,
  assigned_machine text,
  shift_status text not null,
  coverage_gap boolean not null default false,
  output_impact numeric(8, 2),
  downtime_impact_minutes integer,
  created_at timestamptz not null default now()
);

create table if not exists certification_history (
  id serial primary key,
  employee_id text not null,
  employee_name text not null,
  shift_name text not null,
  metric_date date not null,
  certification_name text not null,
  assigned_machine text,
  status text not null,
  issued_date date,
  expiry_date date,
  days_until_expiry integer,
  created_at timestamptz not null default now()
);

create table if not exists defect_history (
  id serial primary key,
  shift_name text not null,
  metric_date date not null,
  machine_name text not null,
  defect_type text not null,
  defect_count integer not null,
  scrap_count integer not null,
  rework_count integer not null,
  severity text not null,
  trend text not null,
  created_at timestamptz not null default now()
);

create table if not exists ncr_history (
  id serial primary key,
  ncr_id text not null,
  shift_name text not null,
  opened_date date not null,
  closed_date date,
  machine_name text not null,
  defect_type text not null,
  qty_affected integer not null,
  severity text not null,
  status text not null,
  assigned_to text not null,
  capa_id text,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists capa_history (
  id serial primary key,
  capa_id text not null,
  ncr_id text,
  shift_name text not null,
  opened_date date not null,
  due_date date not null,
  closed_date date,
  machine_name text not null,
  defect_type text not null,
  severity text not null,
  status text not null,
  percent_complete integer not null,
  action_count integer not null,
  completed_action_count integer not null,
  root_cause text,
  created_at timestamptz not null default now()
);

create table if not exists calibration_history (
  id serial primary key,
  asset_tag text not null,
  metric_date date not null,
  instrument_name text not null,
  instrument_type text not null,
  location text not null,
  status text not null,
  last_calibrated date not null,
  next_due date not null,
  interval_days integer not null,
  outcome text not null,
  calibrated_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists anomaly_history (
  id serial primary key,
  anomaly_id text not null,
  shift_name text not null,
  metric_date date not null,
  machine_name text,
  anomaly_type text not null,
  severity text not null,
  status text not null,
  metric_name text not null,
  metric_value numeric(10, 2),
  title text not null,
  recommendation text not null,
  created_at timestamptz not null default now()
);

create table if not exists generated_reports (
  id serial primary key,
  shift_name text not null,
  report_date date not null,
  report_type text not null default 'daily_shift',
  summary_text text not null,
  source_metrics jsonb not null default '{}'::jsonb,
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


create unique index if not exists idx_production_orders_shift_order on production_orders (shift_name, order_id);
create unique index if not exists idx_material_inventory_current_shift_code on material_inventory_current (shift_name, material_code);
create index if not exists idx_supplier_records_status on supplier_records (status);
create index if not exists idx_supplier_audit_records_supplier_date on supplier_audit_records (supplier_id, audit_date desc);
create unique index if not exists idx_workforce_roster_current_shift_employee on workforce_roster_current (shift_name, employee_id);
create unique index if not exists idx_employee_cert_records_shift_employee_cert on employee_certification_records (shift_name, employee_id, certification_name);
create unique index if not exists idx_quality_defects_current_shift_type_period on quality_defects_current (shift_name, defect_type, period);
create unique index if not exists idx_ncr_records_shift_ncr on ncr_records (shift_name, ncr_id);
create index if not exists idx_ncr_records_status on ncr_records (status);
create index if not exists idx_capa_records_status on capa_records (status);
create unique index if not exists idx_capa_actions_capa_action on capa_actions (capa_id, action_id);
create index if not exists idx_capa_stage_history_capa on capa_stage_history (capa_id, stage_at);
create index if not exists idx_calibration_records_status on calibration_records (status);

create index if not exists idx_dashboard_snapshots_shift on dashboard_snapshots (shift_name);
create index if not exists idx_presses_shift on presses (shift_name);
create index if not exists idx_downtime_shift on downtime_events (shift_name);
create index if not exists idx_oee_trend_shift on oee_trend (shift_name);
create index if not exists idx_alerts_shift on alerts (shift_name);
create unique index if not exists idx_shift_daily_metrics_shift_metric_date on shift_daily_metrics (shift_name, metric_date);
create index if not exists idx_shift_daily_metrics_shift_date on shift_daily_metrics (shift_name, metric_date desc);
create index if not exists idx_operational_events_shift_time on operational_events (shift_name, event_time desc);
create index if not exists idx_operational_events_type on operational_events (event_type);

create unique index if not exists idx_order_history_order_shift_date on order_history (order_id, shift_name, metric_date);
create index if not exists idx_order_history_shift_date on order_history (shift_name, metric_date desc);
create unique index if not exists idx_material_inventory_material_shift_date on material_inventory_history (material_code, shift_name, metric_date);
create index if not exists idx_material_inventory_status on material_inventory_history (status);
create unique index if not exists idx_supplier_audit_supplier_date on supplier_audit_history (supplier_id, audit_date);
create index if not exists idx_supplier_audit_risk on supplier_audit_history (risk_level);
create unique index if not exists idx_workforce_roster_employee_shift_date on workforce_roster_history (employee_id, shift_name, metric_date);
create index if not exists idx_workforce_roster_shift_date on workforce_roster_history (shift_name, metric_date desc);
create unique index if not exists idx_certification_employee_cert_shift_date on certification_history (employee_id, certification_name, shift_name, metric_date);
create index if not exists idx_certification_status on certification_history (status);
create unique index if not exists idx_defect_history_shift_date_machine_type on defect_history (shift_name, metric_date, machine_name, defect_type);
create index if not exists idx_defect_history_type on defect_history (defect_type);
create unique index if not exists idx_ncr_history_ncr_shift on ncr_history (ncr_id, shift_name);
create index if not exists idx_ncr_history_status on ncr_history (status);
create unique index if not exists idx_capa_history_capa_shift on capa_history (capa_id, shift_name);
create index if not exists idx_capa_history_status on capa_history (status);
create unique index if not exists idx_calibration_history_asset_date on calibration_history (asset_tag, metric_date);
create index if not exists idx_calibration_history_status on calibration_history (status);
create unique index if not exists idx_anomaly_history_anomaly_shift_date on anomaly_history (anomaly_id, shift_name, metric_date);
create index if not exists idx_anomaly_history_shift_date on anomaly_history (shift_name, metric_date desc);
create unique index if not exists idx_generated_reports_shift_date_type on generated_reports (shift_name, report_date, report_type);
create index if not exists idx_ai_interactions_created_at on ai_interactions (created_at desc);
create index if not exists idx_ai_interactions_request_id on ai_interactions (request_id);
create index if not exists idx_ai_feedback_request_id on ai_feedback (request_id);
create index if not exists idx_ai_failures_created_at on ai_failures (created_at desc);
create index if not exists idx_ai_failures_gap on ai_failures (detected_gap);
create index if not exists idx_retrieval_gaps_status on retrieval_gaps (status);
create index if not exists idx_retrieval_proposals_gap_id on retrieval_proposals (gap_id);
create unique index if not exists idx_retrieval_proposals_gap_capability on retrieval_proposals (gap_id, capability_name);
