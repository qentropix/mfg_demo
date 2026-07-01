const DOMAIN_HISTORY_TABLES = [
  'generated_reports',
  'anomaly_history',
  'calibration_history',
  'capa_history',
  'ncr_history',
  'defect_history',
  'certification_history',
  'workforce_roster_history',
  'supplier_audit_history',
  'material_inventory_history',
  'order_history'
];

async function insertOrderHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into order_history (
         order_id, shift_name, metric_date, machine_name, part_number, part_name, status,
         qty_ordered, qty_produced, progress_percent, due_date, risk_reason
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (order_id, shift_name, metric_date) do update set
         machine_name = excluded.machine_name,
         part_number = excluded.part_number,
         part_name = excluded.part_name,
         status = excluded.status,
         qty_ordered = excluded.qty_ordered,
         qty_produced = excluded.qty_produced,
         progress_percent = excluded.progress_percent,
         due_date = excluded.due_date,
         risk_reason = excluded.risk_reason`,
      [
        row.order_id,
        row.shift_name,
        row.metric_date,
        row.machine_name,
        row.part_number,
        row.part_name,
        row.status,
        row.qty_ordered,
        row.qty_produced,
        row.progress_percent,
        row.due_date,
        row.risk_reason
      ]
    );
  }
}

async function insertMaterialInventoryHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into material_inventory_history (
         material_code, material_name, shift_name, metric_date, supplier_id, supplier_name,
         stock_qty, reorder_point, daily_usage_rate, days_of_supply, status
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (material_code, shift_name, metric_date) do update set
         material_name = excluded.material_name,
         supplier_id = excluded.supplier_id,
         supplier_name = excluded.supplier_name,
         stock_qty = excluded.stock_qty,
         reorder_point = excluded.reorder_point,
         daily_usage_rate = excluded.daily_usage_rate,
         days_of_supply = excluded.days_of_supply,
         status = excluded.status`,
      [
        row.material_code,
        row.material_name,
        row.shift_name,
        row.metric_date,
        row.supplier_id,
        row.supplier_name,
        row.stock_qty,
        row.reorder_point,
        row.daily_usage_rate,
        row.days_of_supply,
        row.status
      ]
    );
  }
}

async function insertSupplierAuditHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into supplier_audit_history (
         supplier_id, supplier_name, audit_date, status, risk_level, audit_score,
         outcome, lead_time_days, materials
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (supplier_id, audit_date) do update set
         supplier_name = excluded.supplier_name,
         status = excluded.status,
         risk_level = excluded.risk_level,
         audit_score = excluded.audit_score,
         outcome = excluded.outcome,
         lead_time_days = excluded.lead_time_days,
         materials = excluded.materials`,
      [
        row.supplier_id,
        row.supplier_name,
        row.audit_date,
        row.status,
        row.risk_level,
        row.audit_score,
        row.outcome,
        row.lead_time_days,
        JSON.stringify(row.materials ?? [])
      ]
    );
  }
}

async function insertWorkforceRosterHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into workforce_roster_history (
         employee_id, employee_name, shift_name, metric_date, role, assigned_machine,
         shift_status, coverage_gap, output_impact, downtime_impact_minutes
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (employee_id, shift_name, metric_date) do update set
         employee_name = excluded.employee_name,
         role = excluded.role,
         assigned_machine = excluded.assigned_machine,
         shift_status = excluded.shift_status,
         coverage_gap = excluded.coverage_gap,
         output_impact = excluded.output_impact,
         downtime_impact_minutes = excluded.downtime_impact_minutes`,
      [
        row.employee_id,
        row.employee_name,
        row.shift_name,
        row.metric_date,
        row.role,
        row.assigned_machine,
        row.shift_status,
        row.coverage_gap,
        row.output_impact,
        row.downtime_impact_minutes
      ]
    );
  }
}

async function insertCertificationHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into certification_history (
         employee_id, employee_name, shift_name, metric_date, certification_name,
         assigned_machine, status, issued_date, expiry_date, days_until_expiry
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (employee_id, certification_name, shift_name, metric_date) do update set
         employee_name = excluded.employee_name,
         assigned_machine = excluded.assigned_machine,
         status = excluded.status,
         issued_date = excluded.issued_date,
         expiry_date = excluded.expiry_date,
         days_until_expiry = excluded.days_until_expiry`,
      [
        row.employee_id,
        row.employee_name,
        row.shift_name,
        row.metric_date,
        row.certification_name,
        row.assigned_machine,
        row.status,
        row.issued_date,
        row.expiry_date,
        row.days_until_expiry
      ]
    );
  }
}

async function insertDefectHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into defect_history (
         shift_name, metric_date, machine_name, defect_type, defect_count,
         scrap_count, rework_count, severity, trend
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (shift_name, metric_date, machine_name, defect_type) do update set
         defect_count = excluded.defect_count,
         scrap_count = excluded.scrap_count,
         rework_count = excluded.rework_count,
         severity = excluded.severity,
         trend = excluded.trend`,
      [
        row.shift_name,
        row.metric_date,
        row.machine_name,
        row.defect_type,
        row.defect_count,
        row.scrap_count,
        row.rework_count,
        row.severity,
        row.trend
      ]
    );
  }
}

async function insertNcrHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into ncr_history (
         ncr_id, shift_name, opened_date, closed_date, machine_name, defect_type,
         qty_affected, severity, status, assigned_to, capa_id, description
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (ncr_id, shift_name) do update set
         opened_date = excluded.opened_date,
         closed_date = excluded.closed_date,
         machine_name = excluded.machine_name,
         defect_type = excluded.defect_type,
         qty_affected = excluded.qty_affected,
         severity = excluded.severity,
         status = excluded.status,
         assigned_to = excluded.assigned_to,
         capa_id = excluded.capa_id,
         description = excluded.description`,
      [
        row.ncr_id,
        row.shift_name,
        row.opened_date,
        row.closed_date,
        row.machine_name,
        row.defect_type,
        row.qty_affected,
        row.severity,
        row.status,
        row.assigned_to,
        row.capa_id,
        row.description
      ]
    );
  }
}

async function insertCapaHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into capa_history (
         capa_id, ncr_id, shift_name, opened_date, due_date, closed_date, machine_name,
         defect_type, severity, status, percent_complete, action_count, completed_action_count, root_cause
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (capa_id, shift_name) do update set
         ncr_id = excluded.ncr_id,
         opened_date = excluded.opened_date,
         due_date = excluded.due_date,
         closed_date = excluded.closed_date,
         machine_name = excluded.machine_name,
         defect_type = excluded.defect_type,
         severity = excluded.severity,
         status = excluded.status,
         percent_complete = excluded.percent_complete,
         action_count = excluded.action_count,
         completed_action_count = excluded.completed_action_count,
         root_cause = excluded.root_cause`,
      [
        row.capa_id,
        row.ncr_id,
        row.shift_name,
        row.opened_date,
        row.due_date,
        row.closed_date,
        row.machine_name,
        row.defect_type,
        row.severity,
        row.status,
        row.percent_complete,
        row.action_count,
        row.completed_action_count,
        row.root_cause
      ]
    );
  }
}

async function insertCalibrationHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into calibration_history (
         asset_tag, metric_date, instrument_name, instrument_type, location, status,
         last_calibrated, next_due, interval_days, outcome, calibrated_by
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (asset_tag, metric_date) do update set
         instrument_name = excluded.instrument_name,
         instrument_type = excluded.instrument_type,
         location = excluded.location,
         status = excluded.status,
         last_calibrated = excluded.last_calibrated,
         next_due = excluded.next_due,
         interval_days = excluded.interval_days,
         outcome = excluded.outcome,
         calibrated_by = excluded.calibrated_by`,
      [
        row.asset_tag,
        row.metric_date,
        row.instrument_name,
        row.instrument_type,
        row.location,
        row.status,
        row.last_calibrated,
        row.next_due,
        row.interval_days,
        row.outcome,
        row.calibrated_by
      ]
    );
  }
}

async function insertAnomalyHistory(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into anomaly_history (
         anomaly_id, shift_name, metric_date, machine_name, anomaly_type, severity, status,
         metric_name, metric_value, title, recommendation
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (anomaly_id, shift_name, metric_date) do update set
         machine_name = excluded.machine_name,
         anomaly_type = excluded.anomaly_type,
         severity = excluded.severity,
         status = excluded.status,
         metric_name = excluded.metric_name,
         metric_value = excluded.metric_value,
         title = excluded.title,
         recommendation = excluded.recommendation`,
      [
        row.anomaly_id,
        row.shift_name,
        row.metric_date,
        row.machine_name,
        row.anomaly_type,
        row.severity,
        row.status,
        row.metric_name,
        row.metric_value,
        row.title,
        row.recommendation
      ]
    );
  }
}

async function insertGeneratedReports(client, rows) {
  for (const row of rows) {
    await client.query(
      `insert into generated_reports (
         shift_name, report_date, report_type, summary_text, source_metrics
       ) values ($1, $2, $3, $4, $5::jsonb)
       on conflict (shift_name, report_date, report_type) do update set
         summary_text = excluded.summary_text,
         source_metrics = excluded.source_metrics`,
      [
        row.shift_name,
        row.report_date,
        row.report_type,
        row.summary_text,
        JSON.stringify(row.source_metrics ?? {})
      ]
    );
  }
}

export async function clearDomainHistory(client) {
  for (const table of DOMAIN_HISTORY_TABLES) {
    await client.query(`delete from ${table}`);
  }
}

export async function insertDomainHistory(client, domainHistory) {
  await insertOrderHistory(client, domainHistory.orders ?? []);
  await insertMaterialInventoryHistory(client, domainHistory.materials ?? []);
  await insertSupplierAuditHistory(client, domainHistory.supplierAudits ?? []);
  await insertWorkforceRosterHistory(client, domainHistory.workforce ?? []);
  await insertCertificationHistory(client, domainHistory.certifications ?? []);
  await insertDefectHistory(client, domainHistory.defects ?? []);
  await insertNcrHistory(client, domainHistory.ncrs ?? []);
  await insertCapaHistory(client, domainHistory.capas ?? []);
  await insertCalibrationHistory(client, domainHistory.calibrations ?? []);
  await insertAnomalyHistory(client, domainHistory.anomalies ?? []);
  await insertGeneratedReports(client, domainHistory.reports ?? []);
}
