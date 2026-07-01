import { query as dbQuery } from './db.js';

const DOMAIN_CONFIG = {
  orders: {
    aliases: ['order', 'orders', 'work order', 'production order'],
    table: 'order_history',
    dateColumn: 'metric_date',
    shiftColumn: 'shift_name',
    label: 'orders',
    columns: ['order_id', 'status', 'machine_name', 'part_number', 'part_name', 'qty_ordered', 'qty_produced', 'progress_percent', 'due_date', 'risk_reason'],
    summaryFields: ['status', 'machine_name']
  },
  materials: {
    aliases: ['material', 'materials', 'inventory', 'stock', 'shortage'],
    table: 'material_inventory_history',
    dateColumn: 'metric_date',
    shiftColumn: 'shift_name',
    label: 'materials',
    columns: ['material_code', 'material_name', 'supplier_name', 'stock_qty', 'reorder_point', 'days_of_supply', 'status'],
    summaryFields: ['status', 'supplier_name']
  },
  suppliers: {
    aliases: ['supplier', 'suppliers', 'vendor', 'vendors', 'audit', 'approved supplier', 'approved suppliers'],
    table: 'supplier_audit_history',
    dateColumn: 'audit_date',
    shiftColumn: null,
    label: 'suppliers',
    columns: ['supplier_id', 'supplier_name', 'status', 'risk_level', 'audit_score', 'outcome', 'lead_time_days', 'materials'],
    summaryFields: ['status', 'risk_level']
  },
  workforce: {
    aliases: ['workforce', 'operator', 'operators', 'employee', 'employees', 'roster', 'attendance'],
    table: 'workforce_roster_history',
    dateColumn: 'metric_date',
    shiftColumn: 'shift_name',
    label: 'workforce',
    columns: ['employee_id', 'employee_name', 'role', 'assigned_machine', 'shift_status', 'coverage_gap', 'output_impact', 'downtime_impact_minutes'],
    summaryFields: ['shift_status', 'assigned_machine']
  },
  certifications: {
    aliases: ['certification', 'certifications', 'training', 'qualified', 'expired', 'expiring'],
    table: 'certification_history',
    dateColumn: 'metric_date',
    shiftColumn: 'shift_name',
    label: 'certifications',
    columns: ['employee_id', 'employee_name', 'certification_name', 'assigned_machine', 'status', 'expiry_date', 'days_until_expiry'],
    summaryFields: ['status', 'assigned_machine']
  },
  defects: {
    aliases: ['defect', 'defects', 'quality', 'scrap', 'rework'],
    table: 'defect_history',
    dateColumn: 'metric_date',
    shiftColumn: 'shift_name',
    label: 'defects',
    columns: ['machine_name', 'defect_type', 'defect_count', 'scrap_count', 'rework_count', 'severity', 'trend'],
    summaryFields: ['defect_type', 'severity']
  },
  ncr: {
    aliases: ['ncr', 'ncrs', 'non conformance', 'non-conformance'],
    table: 'ncr_history',
    dateColumn: 'opened_date',
    shiftColumn: 'shift_name',
    label: 'NCRs',
    columns: ['ncr_id', 'machine_name', 'defect_type', 'qty_affected', 'severity', 'status', 'assigned_to', 'capa_id', 'description'],
    summaryFields: ['status', 'severity', 'defect_type']
  },
  capa: {
    aliases: ['capa', 'capas', 'corrective action', 'preventive action', 'root cause'],
    table: 'capa_history',
    dateColumn: 'opened_date',
    shiftColumn: 'shift_name',
    label: 'CAPAs',
    columns: ['capa_id', 'ncr_id', 'machine_name', 'defect_type', 'severity', 'status', 'percent_complete', 'action_count', 'completed_action_count', 'root_cause', 'due_date'],
    summaryFields: ['status', 'severity', 'defect_type']
  },
  calibration: {
    aliases: ['calibration', 'instrument', 'instruments', 'gauge', 'gauges', 'tool'],
    table: 'calibration_history',
    dateColumn: 'metric_date',
    shiftColumn: null,
    label: 'calibration instruments',
    columns: ['asset_tag', 'instrument_name', 'instrument_type', 'location', 'status', 'last_calibrated', 'next_due', 'interval_days', 'outcome', 'calibrated_by'],
    summaryFields: ['status', 'instrument_type', 'location']
  },
  anomalies: {
    aliases: ['anomaly', 'anomalies', 'abnormal'],
    table: 'anomaly_history',
    dateColumn: 'metric_date',
    shiftColumn: 'shift_name',
    label: 'anomalies',
    columns: ['anomaly_id', 'machine_name', 'anomaly_type', 'severity', 'status', 'metric_name', 'metric_value', 'title', 'recommendation'],
    summaryFields: ['severity', 'status', 'anomaly_type']
  },
  reports: {
    aliases: ['generated report', 'daily report', 'shift report', 'report'],
    table: 'generated_reports',
    dateColumn: 'report_date',
    shiftColumn: 'shift_name',
    label: 'generated reports',
    columns: ['shift_name', 'report_date', 'report_type', 'summary_text', 'source_metrics'],
    summaryFields: ['report_type']
  }
};

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDomain(text) {
  const normalized = normalize(text);
  const priority = ['ncr', 'capa', 'calibration', 'certifications', 'suppliers', 'materials', 'workforce', 'defects', 'anomalies', 'reports', 'orders'];
  for (const key of priority) {
    if (DOMAIN_CONFIG[key].aliases.some((alias) => new RegExp(`\\b${normalize(alias)}\\b`).test(normalized))) {
      return key;
    }
  }
  return null;
}

function addKeywordFilters(config, text, params) {
  const clauses = [];
  const normalized = normalize(text);
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };

  if (/\bpress\s*0?(\d{1,2})\b/.test(normalized)) {
    const machine = normalized.match(/\bpress\s*0?(\d{1,2})\b/);
    add('machine_name = ?', `Press ${String(Number(machine[1])).padStart(2, '0')}`);
  }

  if (config.columns.includes('status')) {
    if (/\bapproved\b/.test(normalized)) add('status = ?', 'Approved');
    if (/\bsuspended\b/.test(normalized)) add('status = ?', 'Suspended');
    if (/\brequalification\b/.test(normalized)) add('status = ?', 'Requalification Due');
    if (/\bcurrent\b/.test(normalized) && config.table.includes('calibration')) add('status = ?', 'Current');
    if (/\bdue soon\b/.test(normalized)) add('status = ?', 'Due Soon');
    if (/\boverdue|past due|late\b/.test(normalized)) add('status = ?', 'Overdue');
    if (/\bexpired\b/.test(normalized)) add('status = ?', 'Expired');
    if (/\bexpiring\b/.test(normalized)) add('status = ?', 'Expiring Soon');
    if (/\bopen\b/.test(normalized) && !/\bover\b/.test(normalized)) add('status = ?', 'Open');
    if (/\bclosed\b/.test(normalized)) add('status = ?', 'Closed');
  }

  if (config.columns.includes('risk_level')) {
    if (/\bhigh risk\b|\brisk high\b/.test(normalized)) add('risk_level = ?', 'High');
    if (/\bmedium risk\b|\brisk medium\b/.test(normalized)) add('risk_level = ?', 'Medium');
    if (/\blow risk\b|\brisk low\b/.test(normalized)) add('risk_level = ?', 'Low');
  }

  if (config.columns.includes('severity')) {
    if (/\bcritical\b/.test(normalized)) add('severity = ?', 'critical');
    if (/\bmajor\b/.test(normalized)) add('severity = ?', 'Major');
    if (/\bminor\b/.test(normalized)) add('severity = ?', 'Minor');
  }

  return clauses;
}

function monthRange(month) {
  const start = new Date(month.year, month.month, 1);
  const end = new Date(month.year, month.month + 1, 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: month.label
  };
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return 'n/a';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatRecord(row, config) {
  const entries = Object.entries(row)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 6)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${formatValue(value)}`);
  return entries.join(' | ');
}

function formatRecords({ rows, config, label }) {
  if (!rows.length) {
    return `No ${config.label} records matched ${label}.`;
  }

  const visible = rows.slice(0, 8).map((row, index) => `${index + 1}. ${formatRecord(row, config)}`);
  const suffix = rows.length > visible.length ? ` Showing first ${visible.length}.` : '';
  return `Found ${rows.length} ${config.label} record(s) for ${label}. ${visible.join(' ')}${suffix}`;
}

function formatSummary(rows, config, label) {
  if (!rows.length) {
    return `No ${config.label} records were found for ${label}.`;
  }
  const parts = rows.map((row) => {
    const group = row.group_value ?? 'Unspecified';
    const count = Number(row.records ?? 0);
    const total = row.total_value === null || row.total_value === undefined ? '' : `, total ${formatValue(row.total_value)}`;
    return `${group}: ${count}${total}`;
  });
  return `${label} ${config.label} summary. ${parts.join('; ')}.`;
}

async function queryExactDate({ config, query, shiftName, dateKey, limit }) {
  const params = [dateKey];
  const where = [`${config.dateColumn} = $1::date`];
  if (config.shiftColumn) {
    params.push(shiftName);
    where.push(`${config.shiftColumn} = $${params.length}`);
  }
  where.push(...addKeywordFilters(config, query, params));
  params.push(limit);
  const sql = `select ${config.columns.join(', ')}
               from ${config.table}
               where ${where.join(' and ')}
               order by ${config.dateColumn} desc
               limit $${params.length}`;
  const result = await dbQuery(sql, params);
  return {
    source: 'domain-history',
    queryType: 'domain-date',
    rowCount: result.rowCount,
    tablesUsed: [config.table],
    sql,
    answer: formatRecords({ rows: result.rows, config, label: dateKey })
  };
}

async function queryMonth({ config, query, shiftName, month, limit }) {
  const range = monthRange(month);
  const params = [range.startDate, range.endDate];
  const where = [`${config.dateColumn} >= $1::date`, `${config.dateColumn} < $2::date`];
  if (config.shiftColumn) {
    params.push(shiftName);
    where.push(`${config.shiftColumn} = $${params.length}`);
  }
  where.push(...addKeywordFilters(config, query, params));

  const groupColumn = config.summaryFields[0];
  const totalColumn = config.table === 'defect_history'
    ? 'sum(defect_count)'
    : config.table === 'ncr_history'
      ? 'sum(qty_affected)'
      : config.table === 'order_history'
        ? 'sum(qty_produced)'
        : 'null';
  params.push(limit);
  const sql = `select ${groupColumn} as group_value, count(*)::int as records, ${totalColumn} as total_value
               from ${config.table}
               where ${where.join(' and ')}
               group by ${groupColumn}
               order by records desc
               limit $${params.length}`;
  const result = await dbQuery(sql, params);
  return {
    source: 'domain-history',
    queryType: 'domain-month',
    rowCount: result.rowCount,
    tablesUsed: [config.table],
    sql,
    answer: formatSummary(result.rows, config, range.label)
  };
}

export async function resolveDomainHistoryAnswer({ query, shiftName = 'Shift A', exactDates = [], monthPhrases = [], limit = 20 } = {}) {
  const domain = detectDomain(query);
  if (!domain) return null;

  const config = DOMAIN_CONFIG[domain];
  if (exactDates.length) {
    return queryExactDate({
      config,
      query,
      shiftName,
      dateKey: exactDates[0],
      limit
    });
  }

  if (monthPhrases.length) {
    return queryMonth({
      config,
      query,
      shiftName,
      month: monthPhrases[0],
      limit
    });
  }

  return null;
}
