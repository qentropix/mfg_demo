import { pool } from './db.js';
import { getDashboardPayload, getShifts } from './dashboardRepository.js';
import { buildDailyReportText } from './aiService.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SHIFT = 'Shift A';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const SQL_AGENT_MODEL = process.env.OLLAMA_REASONING_MODEL || process.env.AI_REASONING_MODEL || 'deepseek-r1';
const AI_PROVIDER = String(process.env.AI_PROVIDER ?? 'auto').toLowerCase();

const MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

const READ_ONLY_TABLES = new Set([
  'dashboard_snapshots',
  'presses',
  'downtime_events',
  'oee_trend',
  'alerts',
  'shift_daily_metrics',
  'production_orders',
  'material_inventory_current',
  'supplier_records',
  'supplier_audit_records',
  'workforce_roster_current',
  'employee_certification_records',
  'quality_defects_current',
  'ncr_records',
  'capa_records',
  'capa_actions',
  'capa_stage_history',
  'calibration_records',
  'operational_events',
  'order_history',
  'material_inventory_history',
  'supplier_audit_history',
  'workforce_roster_history',
  'certification_history',
  'defect_history',
  'ncr_history',
  'capa_history',
  'calibration_history',
  'anomaly_history',
  'generated_reports',
  'ai_interactions',
  'ai_feedback',
  'ai_failures',
  'retrieval_gaps',
  'retrieval_proposals'
]);

const METRICS = {
  overall_oee: {
    label: 'OEE',
    aliases: ['oee', 'overall oee', 'efficiency', 'performance'],
    historicalColumn: 'overall_oee',
    currentPath: ['summary', 'overallOee'],
    aggregate: 'avg',
    unit: '%'
  },
  total_output: {
    label: 'Output',
    aliases: ['output', 'total output', 'production', 'units', 'produced'],
    historicalColumn: 'total_output',
    currentPath: ['summary', 'totalOutput'],
    aggregate: 'sum',
    unit: 'units'
  },
  good_parts: {
    label: 'Good parts',
    aliases: ['good parts', 'good part', 'good output', 'accepted parts'],
    historicalColumn: 'good_parts',
    currentPath: ['summary', 'goodParts'],
    aggregate: 'sum',
    unit: 'units'
  },
  downtime_minutes: {
    label: 'Downtime',
    aliases: ['downtime', 'down time', 'stoppage', 'stoppages', 'loss time'],
    historicalColumn: 'downtime_minutes',
    currentPath: ['summary', 'downtimeMinutes'],
    aggregate: 'sum',
    unit: 'minutes'
  },
  quality_rate: {
    label: 'Quality rate',
    aliases: ['quality', 'quality rate', 'fpq', 'first pass yield', 'first-pass yield', 'inspection pass rate', 'pass rate'],
    historicalColumn: 'quality_rate',
    currentPath: ['summary', 'qualityRate'],
    aggregate: 'avg',
    unit: '%'
  },
  active_alerts: {
    label: 'Active alerts',
    aliases: ['alerts', 'active alerts', 'alert count', 'total alerts'],
    historicalColumn: 'active_alerts',
    currentPath: ['summary', 'activeAlerts'],
    aggregate: 'sum',
    unit: 'alerts'
  },
  critical_alerts: {
    label: 'Critical alerts',
    aliases: ['critical alerts', 'critical alert count'],
    historicalColumn: 'critical_alerts',
    currentPath: ['summary', 'criticalAlerts'],
    aggregate: 'sum',
    unit: 'alerts'
  },
  warning_alerts: {
    label: 'Warning alerts',
    aliases: ['warning alerts', 'warnings', 'warning alert count'],
    historicalColumn: 'warning_alerts',
    currentPath: ['summary', 'warningAlerts'],
    aggregate: 'sum',
    unit: 'alerts'
  },
  target_output: {
    label: 'Target output',
    aliases: ['target', 'target output', 'planned output'],
    currentPath: ['summary', 'targetOutput'],
    aggregate: 'sum',
    unit: 'units'
  }
};

const DOMAIN_ALIASES = {
  dashboard: ['dashboard', 'summary', 'plant', 'current state', 'snapshot'],
  machines: ['machine', 'machines', 'press', 'presses', 'equipment'],
  downtime: ['downtime', 'loss driver', 'loss drivers', 'stoppage'],
  oee_trend: ['trend', 'oee trend'],
  orders: ['order', 'orders', 'work order', 'work orders', 'production order'],
  materials: ['material', 'materials', 'inventory', 'stock', 'supply'],
  suppliers: ['supplier', 'suppliers', 'vendor', 'vendors'],
  workforce: ['workforce', 'operator', 'operators', 'employee', 'employees', 'roster', 'shift roster'],
  certifications: ['certification', 'certifications', 'certificate', 'training', 'qualification', 'qualified'],
  quality: ['quality', 'defect', 'defects', 'scrap', 'rework'],
  ncr: ['ncr', 'non conformance', 'non-conformance', 'quality issue'],
  capa: ['capa', 'corrective action', 'preventive action', 'root cause'],
  calibration: ['calibration', 'instrument', 'instruments', 'gauge', 'gauges', 'tooling'],
  alerts: ['alert', 'alerts', 'alarm', 'alarms', 'warning', 'critical'],
  anomalies: ['anomaly', 'anomalies', 'anomaly detector', 'abnormal'],
  reports: ['report', 'reports', 'handover', 'daily report', 'shift report'],
  events: ['event', 'events', 'history events', 'operational events'],
  ai_interactions: ['ai interaction', 'ai interactions', 'ask ai log', 'ai logs'],
  ai_feedback: ['ai feedback', 'feedback', 'wrong answer', 'rating'],
  retrieval_gaps: ['retrieval gap', 'retrieval gaps', 'ai gap', 'gap proposal']
};

const DOMAIN_QUERY_PRIORITY = [
  'ncr',
  'capa',
  'calibration',
  'certifications',
  'suppliers',
  'materials',
  'workforce',
  'quality',
  'alerts',
  'anomalies',
  'reports',
  'events',
  'orders',
  'downtime',
  'oee_trend',
  'machines',
  'dashboard',
  'ai_feedback',
  'retrieval_gaps',
  'ai_interactions'
];

const DOMAIN_INFO = {
  dashboard: { source: 'current-state', description: 'Current dashboard summary for a shift.' },
  machines: { source: 'current-state', description: 'Current press status, OEE, output, downtime and jobs.' },
  downtime: { source: 'current-state', description: 'Current downtime reason breakdown.' },
  oee_trend: { source: 'current-state', description: 'Current dashboard OEE trend points.' },
  orders: { source: 'current-state/demo', description: 'Production order status and progress.' },
  materials: { source: 'current-state/demo', description: 'Material stock, reorder and days-of-supply risk.' },
  suppliers: { source: 'current-state/demo', description: 'Supplier approval, audit and risk data.' },
  workforce: { source: 'current-state/demo', description: 'Operator roster, assignment and status.' },
  certifications: { source: 'current-state/demo', description: 'Flattened employee certification and qualification records.' },
  quality: { source: 'current-state/demo', description: 'Current defect theme and quality metrics.' },
  ncr: { source: 'current-state/demo', description: 'Current NCR records by shift.' },
  capa: { source: 'current-state/demo', description: 'Current CAPA records and stages.' },
  calibration: { source: 'current-state/demo', description: 'Current instrument calibration register.' },
  alerts: { source: 'current-state/db', description: 'Current active alerts.' },
  anomalies: { source: 'current-state/derived', description: 'Derived anomaly-like records from active dashboard risk.' },
  reports: { source: 'derived', description: 'Generated daily report data and text.' },
  events: { source: 'history-db', description: 'Operational event history.' },
  ai_interactions: { source: 'telemetry-db', description: 'Ask AI interaction telemetry.' },
  ai_feedback: { source: 'telemetry-db', description: 'Ask AI user feedback.' },
  retrieval_gaps: { source: 'telemetry-db', description: 'Detected retrieval capability gaps and proposals.' }
};

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const dateText = raw.toLowerCase().replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');
  const text = normalizeText(raw);
  const today = new Date();

  if (text === 'today' || text === 'current day') {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  if (text === 'yesterday') {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  }

  if (text === 'tomorrow') {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  }

  let match = dateText.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (match) {
    const [, year, month, day] = match;
    const candidate = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  match = dateText.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (match) {
    const [, day, month, year] = match;
    const candidate = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  match = text.match(/\b(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)(?:\s+(\d{4}))?\b/);
  if (match) {
    const [, day, monthName, yearValue] = match;
    const year = yearValue ? Number(yearValue) : today.getFullYear();
    const candidate = new Date(year, MONTHS[monthName], Number(day));
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  match = text.match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:\s+(\d{4}))?\b/);
  if (match) {
    const [, monthName, day, yearValue] = match;
    const year = yearValue ? Number(yearValue) : today.getFullYear();
    const candidate = new Date(year, MONTHS[monthName], Number(day));
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  return null;
}

function parseDateKey(value) {
  const date = parseDateValue(value);
  return date ? formatLocalDateKey(date) : null;
}

function parseAllDateKeys(text) {
  const normalized = String(text ?? '').toLowerCase().replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');
  const datePatterns = [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g,
    /\b\d{1,2}\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)(?:\s+\d{4})?\b/g,
    /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}(?:\s+\d{4})?\b/g,
    /\b(?:today|yesterday|tomorrow)\b/g
  ];
  const matches = [];

  for (const pattern of datePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const key = parseDateKey(match[0]);
      if (key) {
        matches.push({ index: match.index ?? 0, value: key, text: match[0] });
      }
    }
  }

  const seen = new Set();
  return matches
    .sort((a, b) => a.index - b.index)
    .filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
}

function monthLabel(year, monthIndex) {
  return `${new Date(year, monthIndex, 1).toLocaleString('en-US', { month: 'long' })} ${year}`;
}

function parseMonthPhrases(text) {
  const normalized = normalizeText(text);
  const currentYear = new Date().getFullYear();
  const explicitYears = [...normalized.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map((match) => Number(match[1]));
  const sharedYear = explicitYears.length === 1 ? explicitYears[0] : currentYear;
  const matches = [];
  const seen = new Set();

  for (const match of normalized.matchAll(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(20\d{2}|19\d{2})\b/g)) {
    const month = MONTHS[match[1]];
    const year = Number(match[2]);
    const key = `${year}-${month}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ index: match.index ?? 0, year, month, label: monthLabel(year, month) });
    }
  }

  for (const match of normalized.matchAll(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b(?!\s+(?:20\d{2}|19\d{2}|\d{1,2}))/g)) {
    const month = MONTHS[match[1]];
    const key = `${sharedYear}-${month}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ index: match.index ?? 0, year: sharedYear, month, label: monthLabel(sharedYear, month) });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

function monthDateRange(month) {
  const start = new Date(month.year, month.month, 1);
  const end = new Date(month.year, month.month + 1, 0);
  return {
    startDate: formatLocalDateKey(start),
    endDate: formatLocalDateKey(end),
    label: month.label,
    grain: 'month'
  };
}

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function resolveShiftName(input = {}) {
  const text = String(input.query ?? input.rawQuery ?? input.question ?? '').trim();
  const explicit = input.shiftName ?? input.shift ?? input.filters?.shiftName ?? input.filters?.shift;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }

  const match = normalizeText(text).match(/\bshift\s*([a-z0-9]+)\b/);
  if (match) {
    return `Shift ${match[1].toUpperCase()}`;
  }

  return DEFAULT_SHIFT;
}

function resolveMetrics(input = {}) {
  const raw = input.metrics ?? input.metric;
  const candidates = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const text = normalizeText(`${input.query ?? input.question ?? ''} ${candidates.join(' ')}`);
  const resolved = [];

  for (const [key, metric] of Object.entries(METRICS)) {
    if (candidates.some((candidate) => normalizeText(candidate) === normalizeText(key) || normalizeText(candidate) === normalizeText(metric.label))) {
      resolved.push(key);
      continue;
    }

    if (metric.aliases.some((alias) => new RegExp(`\\b${aliasToRegex(alias)}\\b`).test(text))) {
      resolved.push(key);
    }
  }

  return [...new Set(resolved)];
}

function resolveDomain(input = {}) {
  const explicit = input.domain ?? input.entity ?? input.collection;
  if (explicit) {
    const normalizedExplicit = normalizeText(explicit);
    if (DOMAIN_INFO[normalizedExplicit]) return normalizedExplicit;
    for (const [domain, aliases] of Object.entries(DOMAIN_ALIASES)) {
      if (aliases.some((alias) => normalizeText(alias) === normalizedExplicit)) {
        return domain;
      }
    }
  }

  const text = normalizeText(`${input.query ?? input.question ?? ''}`);
  const inferredDomain = inferDomainFromQuestionText(text);
  if (inferredDomain) return inferredDomain;

  for (const domain of DOMAIN_QUERY_PRIORITY) {
    const aliases = DOMAIN_ALIASES[domain] ?? [];
    if (aliases.some((alias) => new RegExp(`\\b${aliasToRegex(alias)}\\b`).test(text))) {
      return domain;
    }
  }

  return null;
}

function inferDomainFromQuestionText(text) {
  if (!text) return null;

  if (/\b(who|operator|employee|staff|roster|coverage|cover|backup|absent|break|off duty|reassign|rebalance)\b/.test(text)) {
    return text.includes('certif') || text.includes('qualified') || text.includes('training') ? 'certifications' : 'workforce';
  }

  if (/\b(certif|qualified|qualification|training|expired|expiring)\b/.test(text)) return 'certifications';
  if (/\b(instrument|gauge|torque|sensor|calibration|calibrated|asset tag|due soon|overdue)\b/.test(text) && !text.includes('capa')) return 'calibration';
  if (/\b(capa|corrective|preventive|root cause|action|actions|verification|effectiveness)\b/.test(text)) return 'capa';
  if (/\b(ncr|non conformance|nonconformance|defect type)\b/.test(text)) return 'ncr';
  if (/\b(defect|scrap|rework|first pass|inspection pass|quality loss|quality trend)\b/.test(text)) return 'quality';
  if (/\b(order|work order|job|queued|delayed|late|blocked|quality hold|priority order)\b/.test(text)) return 'orders';
  if (/\b(material|inventory|stock|shortage|inbound|expedite|purchasing)\b/.test(text)) return 'materials';
  if (/\b(supplier|vendor|audit|requalification|procurement)\b/.test(text)) return 'suppliers';
  if (/\b(alert|alerts|alarm|critical|warning)\b/.test(text) && !/\bmachine|press\b/.test(text)) return 'alerts';
  if (/\b(anomaly|anomalies|abnormal)\b/.test(text)) return 'anomalies';
  if (/\b(report|handover|handoff|supervisor|daily report|shift report)\b/.test(text)) return 'reports';
  if (/\b(event|events|happened|last time|similar)\b/.test(text)) return 'events';
  if (/\b(machine|machines|press|presses|equipment|job|maintenance|bottleneck|oee|downtime|output)\b/.test(text)) return 'machines';
  if (/\b(plant|dashboard|summary|status|refresh|metric|metrics|today|current shift|data available|data missing)\b/.test(text)) return 'dashboard';

  return null;
}

function resolveDomains(input = {}) {
  const explicit = input.domains ?? input.domain;
  if (Array.isArray(explicit)) {
    return explicit.map((domain) => resolveDomain({ domain })).filter(Boolean);
  }

  const first = resolveDomain(input);
  return first ? [first] : [];
}

function resolveDateWindow(input = {}) {
  const queryText = input.query ?? input.question ?? '';
  const start = parseDateKey(input.startDate ?? input.start ?? input.from);
  const end = parseDateKey(input.endDate ?? input.end ?? input.to);
  const date = parseDateKey(input.date ?? input.reportDate ?? input.metricDate);
  if (start || end) {
    return {
      startDate: start ?? end,
      endDate: end ?? start,
      grain: input.grain ?? input.groupBy ?? 'day',
      source: 'explicit'
    };
  }

  if (date) {
    return { startDate: date, endDate: date, grain: 'day', source: 'explicit-date' };
  }

  const relativeDays = Number.parseInt(input.days ?? input.relativeDays, 10);
  if (Number.isFinite(relativeDays) && relativeDays > 0) {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - relativeDays + 1);
    return {
      startDate: formatLocalDateKey(startDate),
      endDate: formatLocalDateKey(endDate),
      grain: input.grain ?? input.groupBy ?? 'day',
      source: 'relative-days',
      relativeDays
    };
  }

  const text = normalizeText(queryText);
  const relativeMatch = text.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/);
  if (relativeMatch) {
    return resolveDateWindow({ ...input, relativeDays: relativeMatch[1] });
  }

  if (text.includes('last 30 days') || text.includes('past month')) {
    return resolveDateWindow({ ...input, relativeDays: 30 });
  }

  if (text.includes('last 90 days') || text.includes('last quarter')) {
    return resolveDateWindow({ ...input, relativeDays: 90 });
  }

  if (text.includes('last 180 days') || text.includes('last 6 months') || text.includes('six month')) {
    return resolveDateWindow({ ...input, relativeDays: 180 });
  }

  if (text.includes('last 210 days') || text.includes('last 7 months')) {
    return resolveDateWindow({ ...input, relativeDays: 210 });
  }

  const dates = parseAllDateKeys(text);
  if (dates.length >= 2) {
    return {
      startDate: dates[0].value,
      endDate: dates[1].value,
      grain: input.grain ?? input.groupBy ?? 'day',
      source: 'query-dates',
      dates: dates.map((item) => item.value)
    };
  }

  if (dates.length === 1) {
    return { startDate: dates[0].value, endDate: dates[0].value, grain: 'day', source: 'query-date' };
  }

  const months = parseMonthPhrases(text);
  if (months.length >= 1) {
    const firstRange = monthDateRange(months[0]);
    if (months.length >= 2) {
      const secondRange = monthDateRange(months[1]);
      return {
        startDate: firstRange.startDate,
        endDate: secondRange.endDate,
        grain: input.grain ?? input.groupBy ?? 'month',
        source: 'query-months',
        months: [firstRange, secondRange]
      };
    }
    return { ...firstRange, source: 'query-month' };
  }

  return {
    startDate: null,
    endDate: null,
    grain: input.grain ?? input.groupBy ?? 'current',
    source: 'current'
  };
}

function detectComparison(query) {
  const text = normalizeText(query);
  return /\b(compare|comparison|vs|versus|between|difference|changed|change)\b/.test(text);
}

function detectRank(query) {
  const text = normalizeText(query);
  if (/\b(highest|most|maximum|max|top|best)\b/.test(text)) {
    return { requested: true, order: 'desc' };
  }
  if (/\b(lowest|least|minimum|min|bottom|worst|oldest|newest|next)\b/.test(text)) {
    return { requested: true, order: /\b(newest|next)\b/.test(text) ? 'asc' : 'asc' };
  }
  return { requested: false, order: null };
}

function extractEntities(query) {
  const text = String(query ?? '');
  const normalized = normalizeText(text);
  const entities = [];

  for (const match of normalized.matchAll(/\b(?:press|p)\s*0?(\d{1,2})\b/g)) {
    entities.push({
      type: 'machine',
      id: `Press ${String(Number(match[1])).padStart(2, '0')}`,
      name: `Press ${String(Number(match[1])).padStart(2, '0')}`,
      confidence: 0.95
    });
  }

  const patterns = [
    ['ncr', /\bNCR-\d{4}-\d{4,}\b/gi],
    ['capa', /\bCAPA-\d{4}-\d{4,}\b/gi],
    ['order', /\bWO-\d+\b/gi],
    ['material', /\bMAT-\d+\b/gi],
    ['supplier', /\bSUP-\d+\b/gi],
    ['calibration', /\b(?:CAL|GA|TOR|MIC|VER|PRES|LOAD|TEMP|PROF)-\d+\b/gi]
  ];

  for (const [type, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      entities.push({ type, id: match[0].toUpperCase(), name: match[0].toUpperCase(), confidence: 0.96 });
    }
  }

  return uniqueBy(entities, (entity) => `${entity.type}:${entity.id}`);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasToRegex(alias) {
  const escaped = escapeRegex(normalizeText(alias));
  if (!escaped || escaped.endsWith('s')) return escaped;
  return `${escaped}(?:s|es)?`;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function getByPath(target, path) {
  return path.reduce((value, key) => (value && value[key] !== undefined ? value[key] : null), target);
}

function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function daysUntil(value) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return null;
  return Math.ceil((timestamp - Date.now()) / MS_PER_DAY);
}

function dueStatus(value, warningDays = 30) {
  const days = daysUntil(value);
  if (days === null) return null;
  if (days < 0) return 'Overdue';
  if (days <= warningDays) return 'Due Soon';
  return 'Current';
}

function ageDays(value) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / MS_PER_DAY));
}

function completionPercent(actions = [], fallback = null) {
  if (Number.isFinite(Number(fallback))) return Number(fallback);
  if (!Array.isArray(actions) || !actions.length) return null;
  const done = actions.filter((action) => normalizeText(action.status).includes('complete') || normalizeText(action.status).includes('done')).length;
  return Math.round((done / actions.length) * 100);
}

function orderProgress(order) {
  const ordered = Number(order.qtyOrdered ?? order.quantityOrdered ?? order.targetQty ?? 0);
  const produced = Number(order.qtyProduced ?? order.quantityProduced ?? order.completedQty ?? 0);
  if (!ordered) return null;
  return Math.round((produced / ordered) * 1000) / 10;
}

function normalizeRecordValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeRecordValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeRecordValue(item)]));
  }
  return value;
}

function makeSearchText(record) {
  return normalizeText(JSON.stringify(record));
}

function recordId(domain, item, index) {
  return String(
    item.id ??
    item.assetTag ??
    item.pressName ??
    item.name ??
    item.code ??
    item.title ??
    item.reason ??
    item.eventType ??
    `${domain}-${index + 1}`
  );
}

function recordLabel(domain, item, index) {
  return String(
    item.title ??
    item.pressName ??
    item.name ??
    item.assetTag ??
    item.type ??
    item.defectType ??
    item.id ??
    item.code ??
    item.reason ??
    item.eventType ??
    `${domain} ${index + 1}`
  );
}

function wrapRecords(domain, records, extra = {}) {
  return (records ?? []).map((item, index) => {
    const normalized = normalizeRecordValue(item);
    const record = {
      domain,
      id: recordId(domain, normalized, index),
      label: recordLabel(domain, normalized, index),
      ...normalized,
      ...extra
    };
    return {
      ...record,
      searchText: makeSearchText(record)
    };
  });
}

function buildCertificationRecords(employees = []) {
  return employees.flatMap((employee) => {
    const certs = Array.isArray(employee.certifications) ? employee.certifications : [];
    return certs.map((cert, index) => {
      const expiryDate = cert.expiryDate ?? cert.expiresAt ?? cert.validUntil ?? cert.nextDue;
      const name = cert.name ?? cert.title ?? cert.certification ?? cert.type ?? cert.machine ?? `Certification ${index + 1}`;
      return {
        id: `${employee.id ?? employee.name}-${index + 1}`,
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.role,
        assignedMachine: employee.assignedMachine,
        shiftStatus: employee.shiftStatus,
        certificationName: name,
        certificationStatus: cert.status ?? dueStatus(expiryDate),
        expiryDate,
        daysUntilExpiry: daysUntil(expiryDate),
        ...cert
      };
    });
  });
}

function buildAnomalyRecords(payload) {
  const records = [];
  const presses = payload.presses ?? [];
  const alerts = payload.alerts ?? [];
  const worstPress = [...presses].sort((a, b) => Number(a.oee ?? 0) - Number(b.oee ?? 0))[0];
  const downPresses = presses.filter((press) => normalizeText(press.status) !== 'running');

  for (const press of downPresses) {
    records.push({
      id: `anomaly-${press.pressName}`,
      title: `${press.pressName} status requires review`,
      machine: press.pressName,
      severity: normalizeText(press.status).includes('down') ? 'critical' : 'warning',
      status: 'Active',
      metric: 'status',
      metricValue: press.status,
      oee: press.oee,
      downtimeMinutes: press.downtimeMinutes,
      recommendation: 'Inspect machine status, downtime reason and linked alerts.'
    });
  }

  if (worstPress && Number(worstPress.oee) < 75) {
    records.push({
      id: `anomaly-low-oee-${worstPress.pressName}`,
      title: `${worstPress.pressName} low OEE`,
      machine: worstPress.pressName,
      severity: Number(worstPress.oee) < 70 ? 'critical' : 'warning',
      status: 'Active',
      metric: 'overall_oee',
      metricValue: worstPress.oee,
      oee: worstPress.oee,
      downtimeMinutes: worstPress.downtimeMinutes,
      recommendation: 'Check downtime, staffing coverage and open quality issues.'
    });
  }

  for (const alert of alerts.filter((item) => normalizeText(item.severity) === 'critical')) {
    records.push({
      id: `anomaly-alert-${alert.id}`,
      title: alert.title,
      machine: extractEntities(`${alert.title} ${alert.message}`).find((entity) => entity.type === 'machine')?.name ?? null,
      severity: alert.severity,
      status: 'Active',
      metric: 'alert',
      metricValue: 1,
      recommendation: alert.message
    });
  }

  return records;
}

async function loadCurrentState(shiftName = DEFAULT_SHIFT) {
  const payload = await getDashboardPayload(shiftName);
  return {
    shiftName,
    source: 'dashboardRepository',
    metadata: payload.metadata ?? {},
    summary: payload.summary ?? {},
    presses: payload.presses ?? [],
    downtime: payload.downtime ?? [],
    oeeTrend: payload.oeeTrend ?? [],
    alerts: payload.alerts ?? [],
    orders: payload.orders ?? [],
    materials: payload.materials ?? [],
    suppliers: payload.suppliers ?? [],
    employees: payload.employees ?? [],
    certifications: buildCertificationRecords(payload.employees ?? []),
    defects: payload.defects ?? [],
    prevShiftDefects: payload.prevShiftDefects ?? [],
    ncrs: payload.ncrs ?? [],
    capas: payload.capas ?? [],
    calibrations: payload.calibrations ?? [],
    anomalies: buildAnomalyRecords(payload)
  };
}

function normalizeDomainRecords(domain, state) {
  switch (domain) {
    case 'dashboard':
      return wrapRecords(domain, [{ ...state.metadata, ...state.summary, shiftName: state.shiftName }]);
    case 'machines':
      return wrapRecords(domain, state.presses);
    case 'downtime':
      return wrapRecords(domain, state.downtime);
    case 'oee_trend':
      return wrapRecords(domain, state.oeeTrend);
    case 'orders':
      return wrapRecords(domain, state.orders.map((order) => ({
        ...order,
        progressPercent: orderProgress(order),
        remainingQty: Number(order.qtyOrdered ?? 0) - Number(order.qtyProduced ?? 0),
        dueStatus: dueStatus(order.dueDate, 1)
      })));
    case 'materials':
      return wrapRecords(domain, state.materials);
    case 'suppliers':
      return wrapRecords(domain, state.suppliers.map((supplier) => ({
        ...supplier,
        nextRequalStatus: dueStatus(supplier.nextRequalDate, 30),
        daysUntilRequalification: daysUntil(supplier.nextRequalDate)
      })));
    case 'workforce':
      return wrapRecords(domain, state.employees.map((employee) => ({
        ...employee,
        certificationStatus: employee.certificationStatus ?? summarizeEmployeeCertificationStatus(employee)
      })));
    case 'certifications':
      return wrapRecords(domain, state.certifications);
    case 'quality':
      return wrapRecords(domain, state.defects);
    case 'ncr':
      return wrapRecords(domain, state.ncrs.map((ncr) => ({
        ...ncr,
        ageDays: ageDays(ncr.date ?? ncr.createdAt ?? ncr.openedDate)
      })));
    case 'capa':
      return wrapRecords(domain, state.capas.map((capa) => ({
        ...capa,
        dueStatus: dueStatus(capa.dueDate, 7),
        ageDays: ageDays(capa.openedDate ?? capa.createdAt),
        completionPercent: completionPercent(capa.actions, capa.completionPercent)
      })));
    case 'calibration':
      return wrapRecords(domain, state.calibrations.map((item) => ({
        ...item,
        instrument: item.instrument ?? item.name,
        dueStatus: item.status ?? dueStatus(item.nextDue, 30),
        daysUntilDue: daysUntil(item.nextDue)
      })));
    case 'alerts':
      return wrapRecords(domain, state.alerts);
    case 'anomalies':
      return wrapRecords(domain, state.anomalies);
    default:
      return [];
  }
}

function summarizeEmployeeCertificationStatus(employee) {
  const certs = Array.isArray(employee.certifications) ? employee.certifications : [];
  if (!certs.length) return 'Unknown';
  const statuses = certs.map((cert) => normalizeText(cert.status ?? dueStatus(cert.expiryDate)));
  if (statuses.some((status) => status.includes('overdue') || status.includes('expired'))) return 'Expired';
  if (statuses.some((status) => status.includes('due soon') || status.includes('expiring'))) return 'Expiring Soon';
  return 'Current';
}

function mergeInferredFilters(domain, filters = {}, query = '') {
  const inferred = {};
  const text = normalizeText(query);

  if (text.includes('overdue') || text.includes('past due') || text.includes('late')) {
    inferred.dueStatus = 'Overdue';
    if (domain === 'capa' || domain === 'ncr') inferred.status = filters.status ?? 'Open';
  } else if (text.includes('due soon') || text.includes('expiring soon')) {
    inferred.dueStatus = 'Due Soon';
  } else if (text.includes('current') && (domain === 'calibration' || domain === 'certifications')) {
    inferred.dueStatus = 'Current';
  }

  if (text.includes('open') && ['ncr', 'capa', 'alerts', 'anomalies'].includes(domain)) inferred.status = 'Open';
  if (text.includes('closed') && ['ncr', 'capa', 'alerts', 'anomalies'].includes(domain)) inferred.status = 'Closed';
  if (text.includes('active') && ['alerts', 'anomalies', 'workforce'].includes(domain)) inferred.status = 'Active';
  if (text.includes('resolved') && ['alerts', 'anomalies'].includes(domain)) inferred.status = 'Resolved';

  if (domain === 'orders') {
    if (text.includes('late')) delete inferred.dueStatus;
    if (text.includes('on track')) inferred.status = 'On Track';
    if (text.includes('at risk') || text.includes('risk')) inferred.status = 'At Risk';
    if (text.includes('delayed') || text.includes('late')) inferred.status = 'Delayed';
    if (text.includes('queued') || text.includes('queue')) inferred.status = 'Queued';
    if (text.includes('blocked')) inferred.status = 'Blocked';
    if (text.includes('quality hold') || text.includes('hold')) inferred.status = 'Quality Hold';
  }

  if (domain === 'suppliers') {
    if (text.includes('approved')) inferred.status = 'Approved';
    if (text.includes('suspended')) inferred.status = 'Suspended';
    if (text.includes('hold')) inferred.status = 'On Hold';
    if (text.includes('delayed')) inferred.deliveryStatus = 'Delayed';
    if ((text.includes('requalification') || text.includes('requal')) && !text.includes('not')) inferred.status = 'Requalification Due';
    if (text.includes('high risk')) inferred.riskLevel = 'High';
    if (text.includes('medium risk')) inferred.riskLevel = 'Medium';
    if (text.includes('low risk')) inferred.riskLevel = 'Low';
  }

  if (domain === 'materials') {
    if (text.includes('critical')) inferred.status = 'Critical';
    if (text.includes('low') || text.includes('below threshold') || text.includes('below stock') || text.includes('shortage')) inferred.status = ['Critical', 'Low'];
    if ((text.includes('ok') || text.includes('sufficient')) && !text.includes('not')) inferred.status = 'OK';
  }

  if (domain === 'workforce') {
    if (text.includes('present') || text.includes('active')) inferred.status = 'Active';
    if (text.includes('absent')) inferred.status = 'Absent';
    if (text.includes('break')) inferred.status = 'On Break';
    if (text.includes('off duty')) inferred.status = 'Off Duty';
  }

  if (domain === 'certifications') {
    if (text.includes('expired')) inferred.dueStatus = 'Expired';
    if (text.includes('expiring soon')) inferred.dueStatus = 'Expiring Soon';
    if (text.includes('current') || text.includes('valid')) inferred.dueStatus = 'Current';
  }

  if (domain === 'calibration') {
    if (text.includes('gauge')) inferred.type = 'Gauge';
    if (text.includes('torque')) inferred.type = 'Torque Tool';
    if (text.includes('sensor')) inferred.type = 'Sensor';
    if (text.includes('vision')) inferred.type = 'Vision System';
    if (text.includes('press bay')) inferred.location = 'Press Bay';
  }

  if (domain === 'quality') {
    if (text.includes('trending up') || text.includes('trend up') || text.includes('increasing')) inferred.trend = 'up';
    if (text.includes('trending down') || text.includes('trend down') || text.includes('decreasing')) inferred.trend = 'down';
    if (text.includes('stable')) inferred.trend = 'stable';
  }

  if (domain === 'ncr') {
    if (text.includes('under review') || text.includes('review')) inferred.status = 'Under Review';
  }

  if (domain === 'capa') {
    if (text.includes('root cause')) inferred.status = 'Root Cause Analysis';
    if (text.includes('corrective')) inferred.status = 'Corrective Action';
    if (text.includes('preventive')) inferred.status = 'Preventive Action';
    if (text.includes('verification')) inferred.status = 'Verification';
    if (text.includes('effectiveness')) inferred.status = 'Effectiveness Review';
    if (text.includes('blocked')) inferred.status = 'Blocked';
  }

  if (text.includes('critical') && ['alerts', 'anomalies', 'events', 'ncr'].includes(domain)) inferred.severity = 'critical';
  if (text.includes('warning') && ['alerts', 'anomalies', 'events', 'ncr'].includes(domain)) inferred.severity = 'warning';
  if (text.includes('major') && ['ncr', 'capa'].includes(domain)) inferred.severity = 'major';
  if (text.includes('minor') && ['ncr', 'capa'].includes(domain)) inferred.severity = 'minor';
  if (text.includes('running') && domain === 'machines') inferred.status = 'Running';
  if ((text.includes('down') || text.includes('stopped')) && domain === 'machines') inferred.status = 'Down';
  if (text.includes('minor stop') && domain === 'machines') inferred.status = 'Minor Stop';
  if (domain === 'dashboard') inferred._broad = true;

  const machine = extractEntities(query).find((entity) => entity.type === 'machine');
  if (machine) inferred.machine = machine.name;

  return { ...inferred, ...(filters ?? {}) };
}

function filterRecords(records, filters = {}, query = '') {
  const entries = Object.entries(filters ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  const keywordText = normalizeText(query);
  const domainWords = Object.values(DOMAIN_ALIASES).flatMap((aliases) => aliases.flatMap((alias) => normalizeText(alias).split(' ')));
  const filterWords = entries.flatMap(([, value]) => (Array.isArray(value) ? value : [value]).flatMap((item) => normalizeText(item).split(' ')));
  const stopWords = new Set([
    'show',
    'give',
    'me',
    'which',
    'what',
    'who',
    'is',
    'are',
    'the',
    'for',
    'in',
    'on',
    'of',
    'and',
    'with',
    'a',
    'an',
    'all',
    'current',
    'today',
    'status',
    'plant',
    'summary',
    'health',
    'data',
    'available',
    'missing',
    'quick',
    'paragraph',
    'first',
    'right',
    'now',
    'should',
    'could',
    'would',
    'before',
    'after',
    'review',
    'focus',
    'attention',
    'urgent',
    'risk',
    'risks',
    'stock',
    'threshold',
    'below',
    'late',
    'can',
    'cover',
    'backup',
    'qualified',
    'issue',
    'issues',
    'need',
    'needs',
    'needing',
    'require',
    'requires',
    'required',
    'requiring',
    'related',
    'linked',
    'trend',
    'trending',
    'increase',
    'increasing',
    'decrease',
    'decreasing',
    'assigned',
    'having',
    'has',
    'have',
    'with',
    'without',
    ...domainWords,
    ...filterWords
  ]);
  const keywords = keywordText
    .split(' ')
    .map((word) => word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 8);

  return records.filter((record) => {
    for (const [key, expected] of entries) {
      if (!recordMatchesFilter(record, key, expected)) return false;
    }

    if (keywords.length && query) {
      return keywords.every((keyword) => record.searchText.includes(keyword));
    }

    return true;
  });
}

function recordMatchesFilter(record, key, expected) {
  const normalizedKey = normalizeText(key).replace(/\s/g, '');
  const expectedValues = Array.isArray(expected) ? expected : [expected];
  const candidateKeys = Object.keys(record).filter((recordKey) => normalizeText(recordKey).replace(/\s/g, '') === normalizedKey);
  const values = candidateKeys.length ? candidateKeys.map((recordKey) => record[recordKey]) : [record[key]];

  if (normalizedKey === 'duestatus') {
    values.push(record.dueStatus, record.status, record.certificationStatus, record.nextRequalStatus);
  }

  if (normalizedKey === 'machine' || normalizedKey === 'machinename') {
    values.push(record.machine, record.machineName, record.pressName, record.assignedMachine, record.machineAssigned, record.certificationName, record.location);
  }

  if (normalizedKey === '_broad') {
    return true;
  }

  if (normalizedKey === 'status') {
    values.push(
      record.status,
      record.shiftStatus,
      record.dueStatus,
      record.certificationStatus,
      record.nextRequalStatus,
      record.isActive === true ? 'Active Open' : null,
      record.isActive === false ? 'Closed Resolved' : null,
      ['ncr', 'capa'].includes(record.domain) && normalizeText(record.status) !== 'closed' ? 'Open Active' : null
    );
  }

  if (normalizedKey === 'deliverystatus') {
    values.push(record.lastDeliveryStatus, record.deliveryStatus);
  }

  if (normalizedKey === 'risk' || normalizedKey === 'risklevel') {
    values.push(record.riskLevel);
  }

  if (normalizedKey === 'severity') {
    values.push(record.severity, record.riskLevel);
  }

  if (normalizedKey === 'type' || normalizedKey === 'defecttype' || normalizedKey === 'eventtype') {
    values.push(record.type, record.defectType, record.eventType, record.instrument, record.name);
  }

  if (normalizedKey === 'trend') {
    values.push(record.trend);
  }

  if (normalizedKey === 'stage') {
    values.push(record.stage, record.status);
  }

  if (normalizedKey === 'location') {
    values.push(record.location);
  }

  if (normalizedKey === 'employee' || normalizedKey === 'operator' || normalizedKey === 'assignee') {
    values.push(record.employeeName, record.name, record.assignedTo, record.owner);
  }

  if (normalizedKey === 'supplier') {
    values.push(record.supplier, record.name, record.id);
  }

  if (normalizedKey === 'material') {
    values.push(record.material, record.materials, record.name, record.code);
  }

  return expectedValues.some((item) => {
    const expectedText = normalizeText(item);
    return values.some((value) => recordValueMatches(value, expectedText));
  });
}

function recordValueMatches(value, expectedText) {
  const valueText = normalizeText(Array.isArray(value) ? value.join(' ') : value);
  if (!expectedText) return true;
  if (!valueText) return false;
  if (valueText.includes(expectedText)) return true;

  const synonyms = {
    'due soon': ['due soon', 'expiring soon'],
    'expiring soon': ['due soon', 'expiring soon'],
    overdue: ['overdue', 'expired', 'past due', 'late'],
    expired: ['expired', 'overdue', 'past due'],
    open: ['open', 'active'],
    active: ['active', 'open', 'present'],
    present: ['present', 'active'],
    closed: ['closed', 'resolved'],
    resolved: ['resolved', 'closed'],
    down: ['down', 'stopped'],
    delayed: ['delayed', 'late'],
    'requalification due': ['requalification due', 'requal due'],
    ok: ['ok', 'current', 'sufficient']
  };

  return (synonyms[expectedText] ?? []).some((alias) => valueText.includes(alias));
}

function canFallbackToDomainRecords(filters = {}, query = '') {
  const entries = Object.entries(filters ?? {}).filter(([key, value]) => key !== '_broad' && value !== undefined && value !== null && value !== '');
  if (entries.length) return false;
  const text = normalizeText(query);
  return !/\b(approved|suspended|expired|expiring|overdue|due soon|critical|warning|open|closed|delayed|queued|blocked|absent|present|running|down|under review|root cause)\b/.test(text);
}

function sortRecords(records, sort = {}) {
  const field = sort.field ?? sort.metric ?? sort.by;
  const direction = normalizeText(sort.direction ?? sort.order) === 'asc' ? 'asc' : 'desc';
  if (!field) return records;

  return [...records].sort((a, b) => {
    const left = sortableValue(a[field] ?? a[toCamelCase(field)] ?? a[toSnakeCase(field)]);
    const right = sortableValue(b[field] ?? b[toCamelCase(field)] ?? b[toSnakeCase(field)]);
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return direction === 'asc' ? left - right : right - left;
  });
}

function sortableValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const normalized = normalizeText(value);
  const riskScore = { low: 1, medium: 2, high: 3, critical: 4 }[normalized];
  if (riskScore !== undefined) return riskScore;
  const statusScore = {
    closed: 0,
    current: 1,
    ok: 1,
    active: 2,
    open: 2,
    queued: 2,
    'on track': 2,
    'due soon': 3,
    'at risk': 4,
    delayed: 5,
    overdue: 6,
    expired: 6,
    suspended: 6,
    down: 6
  }[normalized];
  if (statusScore !== undefined) return statusScore;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const timestamp = toTimestamp(value);
  if (timestamp !== null) return timestamp;
  return normalizeText(value).charCodeAt(0) || 0;
}

function toCamelCase(value) {
  return String(value).replace(/[_-]([a-z])/g, (_, char) => char.toUpperCase());
}

function toSnakeCase(value) {
  return String(value).replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`).replace(/^-/, '');
}

async function queryDomainRecords({ domain, shiftName, filters, query, sort, limit = DEFAULT_LIMIT } = {}) {
  if (['events', 'reports', 'ai_interactions', 'ai_feedback', 'retrieval_gaps'].includes(domain)) {
    return querySpecialDomain({ domain, shiftName, filters, query, sort, limit });
  }

  const state = await loadCurrentState(shiftName);
  const effectiveFilters = mergeInferredFilters(domain, filters, query);
  const records = normalizeDomainRecords(domain, state);
  const filtered = filterRecords(records, effectiveFilters, query);
  const fallbackRecords = !filtered.length && canFallbackToDomainRecords(effectiveFilters, query) ? records : filtered;
  const sorted = sortRecords(fallbackRecords, sort);
  const safeLimit = clampLimit(limit);

  return {
    domain,
    shiftName,
    source: DOMAIN_INFO[domain]?.source ?? 'unknown',
    total: fallbackRecords.length,
    records: sorted.slice(0, safeLimit),
    limited: fallbackRecords.length > safeLimit
  };
}

async function querySpecialDomain({ domain, shiftName, filters = {}, query = '', sort = {}, limit = DEFAULT_LIMIT } = {}) {
  const safeLimit = clampLimit(limit);
  if (!pool) {
    return { domain, shiftName, source: DOMAIN_INFO[domain]?.source ?? 'db', total: 0, records: [], limited: false, warning: 'DATABASE_URL is not configured.' };
  }

  if (domain === 'events') {
    return searchEvents({ shiftName, keywords: query, filters, limit: safeLimit });
  }

  const config = {
    ai_interactions: {
      table: 'ai_interactions',
      order: 'created_at desc',
      columns: 'request_id, created_at, endpoint, shift_name, active_tab, raw_query, normalized_query, intent, retrieval_source, retrieval_query_type, row_count, latency_ms, response_status, fallback_used, feedback_rating, feedback_comment'
    },
    ai_feedback: {
      table: 'ai_feedback',
      order: 'created_at desc',
      columns: 'id, request_id, created_at, rating, comment, correct_answer, shift_name, active_tab'
    },
    retrieval_gaps: {
      table: 'retrieval_gaps',
      order: 'updated_at desc',
      columns: 'id, gap_key, gap_type, capability_name, example_queries, frequency, failure_count, status, created_at, updated_at'
    }
  }[domain];

  if (!config) {
    return { domain, shiftName, source: 'unknown', total: 0, records: [], limited: false };
  }

  const conditions = [];
  const params = [];
  const statusColumn = domain === 'retrieval_gaps' ? 'status' : domain === 'ai_interactions' ? 'response_status' : null;
  const shiftColumn = domain === 'ai_interactions' || domain === 'ai_feedback' ? 'shift_name' : null;
  const searchExpression = {
    ai_interactions: "coalesce(raw_query, '') || ' ' || coalesce(normalized_query, '') || ' ' || coalesce(intent, '') || ' ' || coalesce(retrieval_source, '')",
    ai_feedback: "coalesce(request_id, '') || ' ' || coalesce(comment, '') || ' ' || coalesce(correct_answer, '')",
    retrieval_gaps: "coalesce(gap_key, '') || ' ' || coalesce(gap_type, '') || ' ' || coalesce(capability_name, '') || ' ' || coalesce(example_queries::text, '')"
  }[domain] ?? "''";

  if (filters.status && statusColumn) {
    params.push(filters.status);
    conditions.push(`${statusColumn} = $${params.length}`);
  }
  if ((filters.shiftName || filters.shift) && shiftColumn) {
    params.push(filters.shiftName ?? filters.shift);
    conditions.push(`${shiftColumn} = $${params.length}`);
  }
  if (query) {
    params.push(`%${normalizeText(query)}%`);
    conditions.push(`lower(${searchExpression}) like $${params.length}::text`);
  }

  const sql = `select ${config.columns} from ${config.table}${conditions.length ? ` where ${conditions.join(' and ')}` : ''} order by ${config.order} limit $${params.length + 1}`;
  const result = await pool.query(sql, [...params, safeLimit]);
  const records = wrapRecords(domain, result.rows.map((row) => normalizeDbRow(row)));
  return {
    domain,
    shiftName,
    source: DOMAIN_INFO[domain]?.source ?? 'db',
    total: records.length,
    records: sortRecords(records, sort),
    limited: records.length >= safeLimit
  };
}

function normalizeDbRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamelCase(key), normalizeRecordValue(value)]));
}

function metricSqlSelect(metrics) {
  const resolved = metrics.filter((metric) => METRICS[metric]?.historicalColumn);
  return resolved.map((metric) => {
    const definition = METRICS[metric];
    const aggregate = definition.aggregate === 'avg' ? 'avg' : 'sum';
    return `${aggregate}(${definition.historicalColumn})::numeric as ${metric}`;
  });
}

async function queryMetrics(input = {}) {
  const shiftName = resolveShiftName(input);
  const metrics = resolveMetrics(input);
  const selectedMetrics = metrics.length ? metrics : ['overall_oee', 'total_output', 'good_parts', 'downtime_minutes', 'quality_rate', 'active_alerts'];
  const window = resolveDateWindow(input);
  const grain = normalizeText(input.grain ?? input.groupBy ?? window.grain ?? 'current');

  if (!window.startDate && !window.endDate) {
    const state = await loadCurrentState(shiftName);
    const values = Object.fromEntries(selectedMetrics.map((metric) => {
      const definition = METRICS[metric];
      return [metric, definition?.currentPath ? getByPath(state, definition.currentPath) : null];
    }));
    return {
      source: 'current-state',
      shiftName,
      grain: 'current',
      metrics: selectedMetrics,
      rows: [{ shiftName, ...values }],
      rowCount: 1,
      window
    };
  }

  if (!pool) {
    return {
      source: 'history-db',
      shiftName,
      grain,
      metrics: selectedMetrics,
      rows: [],
      rowCount: 0,
      window,
      warning: 'DATABASE_URL is not configured.'
    };
  }

  const sqlMetrics = metricSqlSelect(selectedMetrics);
  if (!sqlMetrics.length) {
    return {
      source: 'history-db',
      shiftName,
      grain,
      metrics: selectedMetrics,
      rows: [],
      rowCount: 0,
      window,
      warning: 'Selected metrics are not available historically.'
    };
  }

  const startDate = window.startDate ?? window.endDate;
  const endDate = window.endDate ?? window.startDate;
  const params = [shiftName, startDate, endDate];
  let sql;

  if (grain === 'day') {
    sql = `select metric_date::text as period, count(*)::int as days, ${sqlMetrics.join(', ')}
           from shift_daily_metrics
           where shift_name = $1 and metric_date >= $2::date and metric_date <= $3::date
           group by metric_date
           order by metric_date asc`;
  } else if (grain === 'month') {
    sql = `select to_char(date_trunc('month', metric_date), 'YYYY-MM') as period, count(*)::int as days, ${sqlMetrics.join(', ')}
           from shift_daily_metrics
           where shift_name = $1 and metric_date >= $2::date and metric_date <= $3::date
           group by date_trunc('month', metric_date)
           order by date_trunc('month', metric_date) asc`;
  } else {
    sql = `select $2::date::text as start_date, $3::date::text as end_date, count(*)::int as days, ${sqlMetrics.join(', ')}
           from shift_daily_metrics
           where shift_name = $1 and metric_date >= $2::date and metric_date <= $3::date`;
  }

  const result = await pool.query(sql, params);
  const rows = result.rows.map((row) => normalizeMetricRow(row));
  return {
    source: 'history-db',
    shiftName,
    grain,
    metrics: selectedMetrics,
    rows,
    rowCount: rows.length,
    window,
    sql,
    tablesUsed: ['shift_daily_metrics']
  };
}

function normalizeMetricRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value === null) return [toCamelCase(key), null];
    const numeric = Number(value);
    return [toCamelCase(key), Number.isFinite(numeric) && !String(value).match(/^\d{4}-\d{2}/) ? numeric : value];
  }));
}

async function compareRetrieval(input = {}) {
  const shiftName = resolveShiftName(input);
  const metric = resolveMetrics(input)[0] ?? input.metric ?? 'overall_oee';
  const text = input.query ?? input.question ?? '';
  const compareBy = normalizeText(input.compareBy ?? (detectComparison(text) ? 'date' : 'unknown'));
  const window = resolveDateWindow(input);

  if ((input.left || input.right) && (input.left?.date || input.right?.date || input.left?.startDate || input.right?.startDate)) {
    const [left, right] = await Promise.all([
      queryMetrics({ ...input.left, metrics: [metric], shiftName: input.left?.shiftName ?? shiftName, grain: 'none' }),
      queryMetrics({ ...input.right, metrics: [metric], shiftName: input.right?.shiftName ?? shiftName, grain: 'none' })
    ]);
    return buildComparisonPayload(metric, left, right, compareBy || 'date');
  }

  if (window.months?.length >= 2) {
    const [leftMonth, rightMonth] = window.months;
    const [left, right] = await Promise.all([
      queryMetrics({ metrics: [metric], shiftName, startDate: leftMonth.startDate, endDate: leftMonth.endDate, grain: 'none' }),
      queryMetrics({ metrics: [metric], shiftName, startDate: rightMonth.startDate, endDate: rightMonth.endDate, grain: 'none' })
    ]);
    return buildComparisonPayload(metric, left, right, 'month', [leftMonth.label, rightMonth.label]);
  }

  const dates = parseAllDateKeys(text);
  if (dates.length >= 2) {
    const [leftDate, rightDate] = dates;
    const [left, right] = await Promise.all([
      queryMetrics({ metrics: [metric], shiftName, date: leftDate.value, grain: 'none' }),
      queryMetrics({ metrics: [metric], shiftName, date: rightDate.value, grain: 'none' })
    ]);
    return buildComparisonPayload(metric, left, right, 'date', [leftDate.value, rightDate.value]);
  }

  if (compareBy === 'shift' || normalizeText(text).includes('shift a') && normalizeText(text).includes('shift b')) {
    const [left, right] = await Promise.all([
      queryMetrics({ metrics: [metric], shiftName: 'Shift A' }),
      queryMetrics({ metrics: [metric], shiftName: 'Shift B' })
    ]);
    return buildComparisonPayload(metric, left, right, 'shift', ['Shift A', 'Shift B']);
  }

  if (compareBy === 'machine' || resolveDomain(input) === 'machines') {
    const names = extractEntities(text).filter((entity) => entity.type === 'machine').map((entity) => entity.name);
    if (names.length >= 2) {
      const domain = await queryDomainRecords({ domain: 'machines', shiftName, limit: MAX_LIMIT });
      const left = domain.records.find((record) => record.pressName === names[0]);
      const right = domain.records.find((record) => record.pressName === names[1]);
      return {
        source: 'current-state',
        compareBy: 'machine',
        metric,
        leftLabel: names[0],
        rightLabel: names[1],
        left,
        right,
        delta: calculateDelta(valueForMetric(left, metric), valueForMetric(right, metric))
      };
    }
  }

  return {
    source: 'retrieval',
    compareBy,
    metric,
    error: 'Could not resolve two comparable sides. Provide dates, months, shifts, or machine names.'
  };
}

function buildComparisonPayload(metric, leftResult, rightResult, compareBy, labels = []) {
  const leftRow = leftResult.rows?.[0] ?? null;
  const rightRow = rightResult.rows?.[0] ?? null;
  const leftValue = leftRow ? leftRow[toCamelCase(metric)] ?? leftRow[metric] : null;
  const rightValue = rightRow ? rightRow[toCamelCase(metric)] ?? rightRow[metric] : null;
  return {
    source: leftResult.source === rightResult.source ? leftResult.source : 'mixed',
    compareBy,
    metric,
    metricLabel: METRICS[metric]?.label ?? metric,
    leftLabel: labels[0] ?? leftRow?.period ?? leftResult.shiftName,
    rightLabel: labels[1] ?? rightRow?.period ?? rightResult.shiftName,
    left: leftRow,
    right: rightRow,
    delta: calculateDelta(leftValue, rightValue),
    tablesUsed: [...new Set([...(leftResult.tablesUsed ?? []), ...(rightResult.tablesUsed ?? [])])]
  };
}

function valueForMetric(record, metric) {
  if (!record) return null;
  const definition = METRICS[metric];
  if (metric === 'overall_oee') return record.oee ?? record.overallOee;
  if (metric === 'total_output') return record.outputCount ?? record.totalOutput;
  if (metric === 'downtime_minutes') return record.downtimeMinutes;
  if (definition?.currentPath) return record[definition.currentPath.at(-1)];
  return record[metric] ?? record[toCamelCase(metric)];
}

function calculateDelta(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return null;
  }
  return {
    absolute: rightNumber - leftNumber,
    percent: leftNumber === 0 ? null : ((rightNumber - leftNumber) / leftNumber) * 100
  };
}

async function rankRetrieval(input = {}) {
  const shiftName = resolveShiftName(input);
  const domain = resolveDomain(input) ?? input.entity ?? 'machines';
  const metric = resolveMetrics(input)[0] ?? input.metric ?? inferDefaultRankMetric(domain, input.query ?? input.question ?? '');
  const rank = detectRank(input.query ?? input.question ?? '');
  const sortField = metricToDomainField(domain, metric, input.sort?.field);
  const order = input.order ?? input.sort?.direction ?? rank.order ?? defaultRankOrder(metric, input.query ?? input.question ?? '');
  const limit = clampLimit(input.limit, 10);

  if ((domain === 'events' || domain === 'dashboard') && pool && resolveDateWindow(input).startDate) {
    const metricsResult = await queryMetrics({
      ...input,
      metrics: [metric],
      grain: input.grain ?? 'day'
    });
    const sorted = sortRecords(metricsResult.rows.map((row, index) => ({
      id: row.period ?? `${domain}-${index + 1}`,
      label: row.period ?? `${domain} ${index + 1}`,
      ...row
    })), { field: metric, direction: order });
    return {
      source: metricsResult.source,
      domain,
      metric,
      order,
      records: sorted.slice(0, limit),
      total: sorted.length
    };
  }

  return queryDomainRecords({
    domain,
    shiftName,
    filters: input.filters,
    query: '',
    sort: { field: sortField, direction: order },
    limit
  });
}

function inferDefaultRankMetric(domain, query) {
  const text = normalizeText(query);
  if (text.includes('downtime')) return 'downtime_minutes';
  if (text.includes('output')) return 'total_output';
  if (text.includes('quality')) return 'quality_rate';
  if (text.includes('alert')) return 'active_alerts';
  if (text.includes('risk')) return 'riskLevel';
  if (text.includes('audit')) return 'auditScore';
  if (text.includes('due') || text.includes('overdue')) return 'daysUntilDue';
  if (domain === 'machines') return 'overall_oee';
  if (domain === 'suppliers') return 'auditScore';
  if (domain === 'capa') return 'dueDate';
  if (domain === 'calibration' || domain === 'certifications') return 'daysUntilDue';
  return 'id';
}

function metricToDomainField(domain, metric, explicit) {
  if (explicit) return explicit;
  if (domain === 'machines') {
    if (metric === 'overall_oee') return 'oee';
    if (metric === 'total_output') return 'outputCount';
    if (metric === 'downtime_minutes') return 'downtimeMinutes';
  }
  if (metric === 'active_alerts') return 'activeAlerts';
  if (metric === 'quality_rate') return 'qualityRate';
  if (metric === 'total_output') return 'totalOutput';
  if (metric === 'downtime_minutes') return 'downtimeMinutes';
  return metric;
}

function defaultRankOrder(metric, query) {
  const text = normalizeText(query);
  if (text.includes('oldest') || text.includes('lowest') || text.includes('worst') || text.includes('next') || text.includes('overdue')) return 'asc';
  if (metric === 'downtime_minutes' || metric === 'active_alerts') return 'desc';
  if (metric === 'overall_oee' && text.includes('worst')) return 'asc';
  return 'desc';
}

async function searchEvents(input = {}) {
  const shiftName = resolveShiftName(input);
  const limit = clampLimit(input.limit, 100);
  const keywords = Array.isArray(input.keywords)
    ? input.keywords.map(normalizeText).filter(Boolean)
    : normalizeText(input.keywords ?? input.query ?? input.question ?? '').split(' ').filter((word) => word.length > 2);
  const window = resolveDateWindow(input);
  const filters = input.filters ?? {};

  if (!pool) {
    return { domain: 'events', shiftName, source: 'history-db', total: 0, records: [], limited: false, warning: 'DATABASE_URL is not configured.' };
  }

  const params = [shiftName];
  const conditions = ['shift_name = $1'];

  if (window.startDate) {
    params.push(window.startDate);
    conditions.push(`metric_date >= $${params.length}::date`);
  }

  if (window.endDate) {
    params.push(window.endDate);
    conditions.push(`metric_date <= $${params.length}::date`);
  }

  if (filters.severity) {
    params.push(filters.severity);
    conditions.push(`lower(severity) = lower($${params.length})`);
  }

  if (filters.eventType) {
    params.push(filters.eventType);
    conditions.push(`lower(event_type) = lower($${params.length})`);
  }

  if (filters.machineName || filters.machine) {
    params.push(filters.machineName ?? filters.machine);
    conditions.push(`lower(coalesce(machine_name, '')) = lower($${params.length})`);
  }

  const usefulKeywords = keywords.filter((keyword) => !['what', 'when', 'show', 'happened', 'events', 'event', 'shift'].includes(keyword)).slice(0, 6);
  for (const keyword of usefulKeywords) {
    params.push(`%${keyword}%`);
    conditions.push(`lower(title || ' ' || details || ' ' || coalesce(machine_name, '') || ' ' || event_type || ' ' || severity) like $${params.length}`);
  }

  params.push(limit);
  const sql = `select id, shift_name, metric_date, event_time, event_type, severity, title, details,
                      machine_name, entity_type, entity_id, metric_value
               from operational_events
               where ${conditions.join(' and ')}
               order by event_time desc
               limit $${params.length}`;
  const result = await pool.query(sql, params);
  const records = wrapRecords('events', result.rows.map(normalizeDbRow));
  return {
    domain: 'events',
    shiftName,
    source: 'history-db',
    total: records.length,
    records,
    limited: records.length >= limit,
    window,
    sql,
    tablesUsed: ['operational_events']
  };
}

async function relationQuery(input = {}) {
  const shiftName = resolveShiftName(input);
  const leftDomain = resolveDomain({ domain: input.leftDomain }) ?? 'ncr';
  const rightDomain = resolveDomain({ domain: input.rightDomain }) ?? 'capa';
  const joinBy = Array.isArray(input.joinBy) && input.joinBy.length ? input.joinBy : inferJoinKeys(leftDomain, rightDomain);
  const [left, right] = await Promise.all([
    queryDomainRecords({ domain: leftDomain, shiftName, filters: input.filters?.[leftDomain] ?? input.leftFilters ?? {}, query: input.leftQuery, limit: MAX_LIMIT }),
    queryDomainRecords({ domain: rightDomain, shiftName, filters: input.filters?.[rightDomain] ?? input.rightFilters ?? {}, query: input.rightQuery, limit: MAX_LIMIT })
  ]);

  const pairs = [];
  for (const leftRecord of left.records) {
    for (const rightRecord of right.records) {
      if (recordsRelated(leftRecord, rightRecord, joinBy)) {
        pairs.push({ left: leftRecord, right: rightRecord, joinBy });
      }
    }
  }

  return {
    source: 'current-state',
    shiftName,
    leftDomain,
    rightDomain,
    joinBy,
    leftCount: left.records.length,
    rightCount: right.records.length,
    pairCount: pairs.length,
    pairs: pairs.slice(0, clampLimit(input.limit, 50)),
    limited: pairs.length > clampLimit(input.limit, 50)
  };
}

function inferJoinKeys(leftDomain, rightDomain) {
  const pair = [leftDomain, rightDomain].sort().join(':');
  if (pair === 'capa:ncr') return ['ncrId', 'machine'];
  if (pair === 'machines:ncr' || pair === 'capa:machines' || pair === 'alerts:machines' || pair === 'anomalies:machines') return ['machine'];
  if (pair === 'machines:workforce') return ['assignedMachine'];
  if (pair === 'machines:certifications') return ['assignedMachine'];
  if (pair === 'calibration:machines') return ['location', 'machine'];
  if (pair === 'materials:suppliers') return ['materials'];
  if (pair === 'machines:orders') return ['machineAssigned'];
  return ['machine', 'ncrId', 'entityId', 'id'];
}

function recordsRelated(left, right, joinBy) {
  return joinBy.some((key) => {
    if (key === 'machine') {
      const leftMachine = normalizeText(left.machine ?? left.machineName ?? left.pressName ?? left.assignedMachine ?? left.machineAssigned);
      const rightMachine = normalizeText(right.machine ?? right.machineName ?? right.pressName ?? right.assignedMachine ?? right.machineAssigned);
      return leftMachine && rightMachine && leftMachine === rightMachine;
    }

    if (key === 'assignedMachine') {
      const leftValue = normalizeText(left.assignedMachine ?? left.machineAssigned ?? left.pressName ?? left.machine);
      const rightValue = normalizeText(right.assignedMachine ?? right.machineAssigned ?? right.pressName ?? right.machine);
      return leftValue && rightValue && leftValue === rightValue;
    }

    if (key === 'machineAssigned') {
      const leftValue = normalizeText(left.machineAssigned ?? left.pressName ?? left.machine);
      const rightValue = normalizeText(right.machineAssigned ?? right.pressName ?? right.machine);
      return leftValue && rightValue && leftValue === rightValue;
    }

    if (key === 'materials') {
      const leftMaterials = normalizeText([left.materials, left.material, left.name, left.code].flat().join(' '));
      const rightMaterials = normalizeText([right.materials, right.material, right.name, right.code].flat().join(' '));
      return leftMaterials && rightMaterials && (leftMaterials.includes(rightMaterials) || rightMaterials.includes(leftMaterials));
    }

    const leftValue = normalizeText(left[key] ?? left[toCamelCase(key)] ?? left[toSnakeCase(key)]);
    const rightValue = normalizeText(right[key] ?? right[toCamelCase(key)] ?? right[toSnakeCase(key)]);
    return leftValue && rightValue && leftValue === rightValue;
  });
}

async function reportQuery(input = {}) {
  const shiftName = resolveShiftName(input);
  const date = parseDateKey(input.reportDate ?? input.date ?? input.query ?? input.question) ?? formatLocalDateKey(new Date());
  const [metrics, events, current] = await Promise.all([
    queryMetrics({ shiftName, date, metrics: ['overall_oee', 'total_output', 'good_parts', 'downtime_minutes', 'quality_rate', 'active_alerts', 'critical_alerts', 'warning_alerts'], grain: 'none' }),
    searchEvents({ shiftName, date, startDate: date, endDate: date, limit: 20 }),
    loadCurrentState(shiftName)
  ]);
  const contextData = {
    shiftName,
    reportDate: date,
    dailyMetrics: metrics.rows[0] ?? null,
    historicalEvents: events.records,
    ...current
  };

  return {
    source: metrics.rowCount ? 'history-db' : 'current-state',
    shiftName,
    reportDate: date,
    metrics: metrics.rows[0] ?? null,
    events: events.records,
    reportText: buildDailyReportText(contextData),
    tablesUsed: ['shift_daily_metrics', 'operational_events']
  };
}

function buildUnderstanding(input = {}) {
  const query = input.query ?? input.question ?? '';
  const shiftName = resolveShiftName(input);
  const metrics = resolveMetrics(input);
  const domain = resolveDomain(input);
  const domains = resolveDomains(input);
  const dateWindow = resolveDateWindow(input);
  const entities = extractEntities(query);
  const comparison = detectComparison(query);
  const rank = detectRank(query);
  const intent = inferIntent({ query, metrics, domain, dateWindow, comparison, rank });

  return {
    rawQuery: query,
    normalizedQuery: normalizeText(query),
    intent,
    shiftName,
    domains,
    primaryDomain: domain,
    metrics,
    entities,
    dateWindow,
    comparison,
    rank,
    confidence: calculateUnderstandingConfidence({ query, metrics, domain, dateWindow, entities, comparison, rank })
  };
}

function inferIntent({ query, metrics, domain, dateWindow, comparison, rank }) {
  const text = normalizeText(query);
  if (comparison) return 'compare';
  if (rank.requested) return 'rank';
  if (domain === 'reports' || text.includes('generate report')) return 'report';
  if (domain === 'events') return 'events_search';
  if (metrics.length && dateWindow.source !== 'current') return 'historical_metric';
  if (metrics.length) return 'current_metric';
  if (domain) return 'domain_search';
  return 'general_retrieval';
}

function calculateUnderstandingConfidence({ query, metrics, domain, dateWindow, entities, comparison, rank }) {
  let score = query ? 0.25 : 0;
  if (metrics.length) score += 0.2;
  if (domain) score += 0.2;
  if (dateWindow.source !== 'current') score += 0.15;
  if (entities.length) score += 0.15;
  if (comparison || rank.requested) score += 0.1;
  return Math.min(0.95, Math.round(score * 100) / 100);
}

async function resolveEntities(input = {}) {
  const query = input.text ?? input.query ?? input.question ?? '';
  const entityTypes = Array.isArray(input.entityTypes) ? input.entityTypes.map(normalizeText) : [];
  const shiftName = resolveShiftName(input);
  const direct = extractEntities(query);
  const state = await loadCurrentState(shiftName);
  const domainEntities = [
    ...normalizeDomainRecords('machines', state).map((record) => entityFromRecord('machine', record, query)),
    ...normalizeDomainRecords('orders', state).map((record) => entityFromRecord('order', record, query)),
    ...normalizeDomainRecords('materials', state).map((record) => entityFromRecord('material', record, query)),
    ...normalizeDomainRecords('suppliers', state).map((record) => entityFromRecord('supplier', record, query)),
    ...normalizeDomainRecords('workforce', state).map((record) => entityFromRecord('employee', record, query)),
    ...normalizeDomainRecords('ncr', state).map((record) => entityFromRecord('ncr', record, query)),
    ...normalizeDomainRecords('capa', state).map((record) => entityFromRecord('capa', record, query)),
    ...normalizeDomainRecords('calibration', state).map((record) => entityFromRecord('calibration', record, query))
  ].filter(Boolean);

  const merged = uniqueBy([...direct, ...domainEntities], (entity) => `${entity.type}:${entity.id}`);
  const filtered = entityTypes.length ? merged.filter((entity) => entityTypes.includes(normalizeText(entity.type))) : merged;
  return {
    shiftName,
    rawText: query,
    matches: filtered.sort((a, b) => b.confidence - a.confidence).slice(0, clampLimit(input.limit, 25))
  };
}

function entityFromRecord(type, record, query) {
  const text = normalizeText(query);
  const label = record.label;
  const id = record.id;
  if (!text) {
    return { type, id, name: label, confidence: 0.4 };
  }

  const idText = normalizeText(id);
  const labelText = normalizeText(label);
  if (idText && text.includes(idText)) {
    return { type, id, name: label, confidence: 0.95 };
  }
  if (labelText && text.includes(labelText)) {
    return { type, id, name: label, confidence: 0.9 };
  }

  const tokens = labelText.split(' ').filter((token) => token.length > 2);
  if (tokens.length && tokens.every((token) => text.includes(token))) {
    return { type, id, name: label, confidence: 0.75 };
  }

  return null;
}

async function getCatalog() {
  const shifts = await getShifts().catch(() => [DEFAULT_SHIFT]);
  const catalog = {
    domains: Object.entries(DOMAIN_INFO).map(([name, info]) => ({
      name,
      aliases: DOMAIN_ALIASES[name] ?? [],
      ...info
    })),
    metrics: Object.entries(METRICS).map(([name, metric]) => ({
      name,
      label: metric.label,
      aliases: metric.aliases,
      historical: Boolean(metric.historicalColumn),
      aggregate: metric.aggregate,
      unit: metric.unit
    })),
    dimensions: ['shiftName', 'date', 'dateRange', 'machine', 'status', 'severity', 'supplier', 'employee', 'location', 'type', 'defectType', 'dueStatus'],
    supportedOperations: ['understand', 'entity_resolution', 'metric_query', 'domain_search', 'compare', 'rank', 'timeseries', 'events_search', 'relations', 'report_query', 'evidence', 'safe_sql'],
    availableShifts: shifts,
    dateRange: null,
    tables: [...READ_ONLY_TABLES].sort()
  };

  if (pool) {
    const result = await pool.query(
      `select min(metric_date)::text as min_date, max(metric_date)::text as max_date, count(*)::int as rows
       from shift_daily_metrics`
    );
    const row = result.rows[0] ?? {};
    catalog.dateRange = {
      minDate: row.min_date,
      maxDate: row.max_date,
      rowCount: Number(row.rows ?? 0)
    };
  }

  return catalog;
}

async function evidenceQuery(input = {}) {
  const kind = normalizeText(input.kind ?? input.source ?? '');
  if (kind === 'sql' || input.sql) {
    return executeSafeSql(input);
  }

  if (kind === 'events' || resolveDomain(input) === 'events') {
    return searchEvents(input);
  }

  if (resolveMetrics(input).length || input.metric || input.metrics) {
    return queryMetrics(input);
  }

  const domain = resolveDomain(input) ?? 'dashboard';
  return queryDomainRecords({
    domain,
    shiftName: resolveShiftName(input),
    filters: input.filters,
    query: input.query ?? input.question,
    sort: input.sort,
    limit: input.limit
  });
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validateSql(sql) {
  if (!sql || typeof sql !== 'string') {
    return { ok: false, reason: 'SQL is required.' };
  }

  let cleaned = sql.trim().replace(/;+\s*$/, '').replace(/```sql|```/gi, '').trim();
  if (!/^(with|select)\b/i.test(cleaned)) {
    return { ok: false, reason: 'Only SELECT or WITH queries are allowed.' };
  }

  if (/[;]/.test(cleaned)) {
    return { ok: false, reason: 'Multiple SQL statements are not allowed.' };
  }

  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|attach|detach|merge|call|execute)\b/i.test(cleaned)) {
    return { ok: false, reason: 'Mutating or administrative SQL is not allowed.' };
  }

  const cteNames = new Set([...cleaned.toLowerCase().matchAll(/\bwith\s+([a-z_][a-z0-9_]*)\s+as\b/g)].map((match) => match[1]));
  for (const match of cleaned.toLowerCase().matchAll(/\b,\s*([a-z_][a-z0-9_]*)\s+as\s*\(/g)) {
    cteNames.add(match[1]);
  }

  const tableMatches = [...cleaned.toLowerCase().matchAll(/\b(from|join)\s+([a-z_][a-z0-9_]*)/g)].map((match) => match[2]);
  const blocked = tableMatches.filter((table) => !READ_ONLY_TABLES.has(table) && !cteNames.has(table));
  if (blocked.length) {
    return { ok: false, reason: `Table not allowed: ${blocked.join(', ')}.` };
  }

  return { ok: true, sql: cleaned, tablesUsed: [...new Set(tableMatches.filter((table) => READ_ONLY_TABLES.has(table)))] };
}

async function generateSqlPlanFromQuestion(question, shiftName) {
  if (!question || AI_PROVIDER === 'deterministic') return null;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SQL_AGENT_MODEL,
        stream: false,
        messages: [
          {
            role: 'system',
            content: [
              'You are a PostgreSQL query planner for a manufacturing dashboard retrieval API.',
              'Return strict JSON only with keys: sql, explanation, confidence.',
              'Use only read-only SELECT or WITH queries.',
              'Always include the requested shift_name filter when the table has shift_name.',
              'Use only these tables:',
              '- dashboard_snapshots(shift_name, plant_name, last_updated, overall_oee, total_output, good_parts, downtime_label, downtime_minutes, active_alerts, critical_alerts, warning_alerts, quality_rate)',
              '- presses(shift_name, press_name, status, oee, output_count, downtime_minutes, current_job, sort_order)',
              '- downtime_events(shift_name, reason, minutes, percent, sort_order)',
              '- oee_trend(shift_name, day_label, value, sort_order)',
              '- alerts(shift_name, severity, title, message, created_at, is_active)',
              '- shift_daily_metrics(shift_name, metric_date, plant_name, overall_oee, total_output, good_parts, downtime_minutes, quality_rate, active_alerts, critical_alerts, warning_alerts)',
              '- production_orders(order_id, shift_name, part_number, part_name, machine_assigned, qty_ordered, qty_produced, due_date, status)',
              '- material_inventory_current(material_code, shift_name, material_name, unit, stock_qty, reorder_point, daily_usage_rate, days_of_supply, status)',
              '- supplier_records(supplier_id, supplier_name, materials, contact, lead_time_days, last_delivery_status, risk_level, audit_score, qualified_date, next_requal_date, status)',
              '- supplier_audit_records(supplier_id, audit_date, audit_type, score, outcome, note)',
              '- workforce_roster_current(shift_name, employee_id, employee_name, role, assigned_machine, shift_status)',
              '- employee_certification_records(shift_name, employee_id, certification_name, issued_date, expiry_date, issued_by, status)',
              '- quality_defects_current(shift_name, defect_type, defect_count, trend, period)',
              '- ncr_records(ncr_id, shift_name, opened_at, machine_name, defect_type, qty_affected, status, assigned_to, capa_id, description, severity)',
              '- capa_records(capa_id, shift_name, ncr_id, machine_name, defect_type, source, issue_description, severity, assigned_to, opened_at, due_at, closed_at, status, percent_complete, root_cause)',
              '- capa_actions(capa_id, action_id, description, owner, due_at, completed)',
              '- calibration_records(asset_tag, instrument_name, instrument_type, location, interval_days, last_calibrated, next_due, cert_number, calibrated_by, status)',
              '- operational_events(shift_name, metric_date, event_time, event_type, severity, title, details, machine_name, entity_type, entity_id, metric_value)',
              '- order_history(order_id, shift_name, metric_date, machine_name, part_number, part_name, status, qty_ordered, qty_produced, progress_percent, due_date, risk_reason)',
              '- material_inventory_history(material_code, material_name, shift_name, metric_date, supplier_id, supplier_name, stock_qty, reorder_point, daily_usage_rate, days_of_supply, status)',
              '- supplier_audit_history(supplier_id, supplier_name, audit_date, status, risk_level, audit_score, outcome, lead_time_days, materials)',
              '- workforce_roster_history(employee_id, employee_name, shift_name, metric_date, role, assigned_machine, shift_status, coverage_gap, output_impact, downtime_impact_minutes)',
              '- certification_history(employee_id, employee_name, shift_name, metric_date, certification_name, assigned_machine, status, issued_date, expiry_date, days_until_expiry)',
              '- defect_history(shift_name, metric_date, machine_name, defect_type, defect_count, scrap_count, rework_count, severity, trend)',
              '- ncr_history(ncr_id, shift_name, opened_date, closed_date, machine_name, defect_type, qty_affected, severity, status, assigned_to, capa_id, description)',
              '- capa_history(capa_id, ncr_id, shift_name, opened_date, due_date, closed_date, machine_name, defect_type, severity, status, percent_complete, action_count, completed_action_count, root_cause)',
              '- calibration_history(asset_tag, metric_date, instrument_name, instrument_type, location, status, last_calibrated, next_due, interval_days, outcome, calibrated_by)',
              '- anomaly_history(anomaly_id, shift_name, metric_date, machine_name, anomaly_type, severity, status, metric_name, metric_value, title, recommendation)',
              '- generated_reports(shift_name, report_date, report_type, summary_text, source_metrics)',
              '- ai_interactions(request_id, created_at, endpoint, shift_name, raw_query, normalized_query, intent, retrieval_source, retrieval_query_type, row_count, latency_ms, response_status, fallback_used, feedback_rating)',
              '- ai_feedback(id, request_id, created_at, rating, comment, correct_answer, shift_name, active_tab)',
              '- ai_failures(id, request_id, created_at, failure_type, failure_reason, raw_query, normalized_query, shift_name, detected_gap, severity, status)',
              '- retrieval_gaps(id, gap_key, gap_type, capability_name, example_queries, frequency, failure_count, status, created_at, updated_at)',
              `Shift in context: ${shiftName}.`,
              'If the question cannot be answered from these tables, set sql to null.'
            ].join(' ')
          },
          { role: 'user', content: question }
        ],
        options: {
          temperature: 0,
          num_predict: 450
        }
      })
    });

    if (!response.ok) return null;
    const payload = await response.json();
    const plan = extractJson(payload?.message?.content ?? '');
    const validation = validateSql(plan?.sql);
    if (!validation.ok) return null;
    return {
      sql: validation.sql,
      explanation: typeof plan?.explanation === 'string' ? plan.explanation : '',
      confidence: Number.isFinite(Number(plan?.confidence)) ? Number(plan.confidence) : 0.65,
      tablesUsed: validation.tablesUsed
    };
  } catch {
    return null;
  }
}

function deterministicSqlPlan(question, shiftName) {
  const understanding = buildUnderstanding({ query: question, shiftName });
  const metric = understanding.metrics[0];
  if (metric && METRICS[metric]?.historicalColumn && understanding.dateWindow.startDate) {
    const aggregate = METRICS[metric].aggregate === 'avg' ? 'avg' : 'sum';
    return {
      sql: `select ${aggregate}(${METRICS[metric].historicalColumn})::numeric as ${metric}, count(*)::int as days
            from shift_daily_metrics
            where shift_name = '${escapeSqlLiteral(understanding.shiftName)}'
              and metric_date >= '${escapeSqlLiteral(understanding.dateWindow.startDate)}'::date
              and metric_date <= '${escapeSqlLiteral(understanding.dateWindow.endDate ?? understanding.dateWindow.startDate)}'::date`,
      explanation: 'Deterministic metric/date retrieval plan.',
      confidence: understanding.confidence,
      tablesUsed: ['shift_daily_metrics']
    };
  }

  if (understanding.primaryDomain === 'events') {
    return {
      sql: `select metric_date, event_time, event_type, severity, title, details, machine_name
            from operational_events
            where shift_name = '${escapeSqlLiteral(understanding.shiftName)}'
            order by event_time desc`,
      explanation: 'Deterministic event retrieval plan.',
      confidence: 0.55,
      tablesUsed: ['operational_events']
    };
  }

  return null;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function executeSafeSql(input = {}) {
  if (!pool) {
    return { source: 'safe-sql', rows: [], rowCount: 0, warning: 'DATABASE_URL is not configured.' };
  }

  const shiftName = resolveShiftName(input);
  const limit = clampLimit(input.limit, 100);
  let plan = null;
  if (input.sql) {
    const validation = validateSql(input.sql);
    if (!validation.ok) {
      return { source: 'safe-sql', error: validation.reason, rows: [], rowCount: 0 };
    }
    plan = { sql: validation.sql, explanation: 'User supplied safe SQL.', confidence: 1, tablesUsed: validation.tablesUsed };
  } else {
    const question = input.question ?? input.query;
    plan = deterministicSqlPlan(question, shiftName) ?? await generateSqlPlanFromQuestion(question, shiftName);
    if (!plan?.sql) {
      return { source: 'safe-sql', error: 'Could not produce a safe SQL plan for the question.', rows: [], rowCount: 0 };
    }
  }

  const validation = validateSql(plan.sql);
  if (!validation.ok) {
    return { source: 'safe-sql', error: validation.reason, rows: [], rowCount: 0 };
  }

  const wrappedSql = `select * from (${validation.sql}) as retrieval_result limit ${limit}`;
  const result = await pool.query(wrappedSql);
  return {
    source: 'safe-sql',
    shiftName,
    sql: validation.sql,
    executedSql: wrappedSql,
    explanation: plan.explanation,
    confidence: plan.confidence,
    tablesUsed: validation.tablesUsed,
    rowCount: result.rowCount,
    rows: result.rows.map(normalizeDbRow),
    limited: result.rowCount >= limit
  };
}

function sendError(response, statusCode, message, details = undefined) {
  response.status(statusCode).json({
    ok: false,
    error: message,
    ...(details ? { details } : {})
  });
}

function asyncRoute(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      sendError(response, 500, error.message || 'Retrieval request failed.');
    }
  };
}

export function registerRetrievalRoutes(app) {
  app.get('/api/retrieval/catalog', asyncRoute(async (_request, response) => {
    response.json({ ok: true, catalog: await getCatalog() });
  }));

  app.get('/api/retrieval/current-state', asyncRoute(async (request, response) => {
    const shiftName = resolveShiftName({ shiftName: request.query.shift ?? request.query.shiftName });
    response.json({ ok: true, state: await loadCurrentState(shiftName) });
  }));

  app.post('/api/retrieval/understand', asyncRoute(async (request, response) => {
    response.json({ ok: true, understanding: buildUnderstanding(request.body ?? {}) });
  }));

  app.post('/api/retrieval/entities/resolve', asyncRoute(async (request, response) => {
    response.json({ ok: true, ...(await resolveEntities(request.body ?? {})) });
  }));

  app.post('/api/retrieval/metrics/query', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await queryMetrics(request.body ?? {}) });
  }));

  app.post('/api/retrieval/compare', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await compareRetrieval(request.body ?? {}) });
  }));

  app.post('/api/retrieval/rank', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await rankRetrieval(request.body ?? {}) });
  }));

  app.post('/api/retrieval/domain/search', asyncRoute(async (request, response) => {
    const body = request.body ?? {};
    const domain = resolveDomain(body);
    if (!domain) {
      return sendError(response, 400, 'domain is required or must be inferable from query.');
    }

    response.json({
      ok: true,
      result: await queryDomainRecords({
        domain,
        shiftName: resolveShiftName(body),
        filters: body.filters,
        query: body.query ?? body.question,
        sort: body.sort,
        limit: body.limit
      })
    });
  }));

  app.post('/api/retrieval/timeseries', asyncRoute(async (request, response) => {
    const body = request.body ?? {};
    response.json({
      ok: true,
      result: await queryMetrics({
        ...body,
        grain: body.grain ?? body.groupBy ?? 'day'
      })
    });
  }));

  app.post('/api/retrieval/events/search', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await searchEvents(request.body ?? {}) });
  }));

  app.post('/api/retrieval/relations/query', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await relationQuery(request.body ?? {}) });
  }));

  app.post('/api/retrieval/history/summary', asyncRoute(async (request, response) => {
    const body = request.body ?? {};
    response.json({
      ok: true,
      result: await queryMetrics({
        ...body,
        grain: body.groupBy ?? body.grain ?? 'none'
      })
    });
  }));

  app.post('/api/retrieval/reports/query', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await reportQuery(request.body ?? {}) });
  }));

  app.post('/api/retrieval/evidence', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await evidenceQuery(request.body ?? {}) });
  }));

  app.post('/api/retrieval/sql/query', asyncRoute(async (request, response) => {
    response.json({ ok: true, result: await executeSafeSql(request.body ?? {}) });
  }));
}

export const retrievalLayer = {
  buildUnderstanding,
  resolveEntities,
  queryMetrics,
  compareRetrieval,
  rankRetrieval,
  queryDomainRecords,
  searchEvents,
  relationQuery,
  reportQuery,
  evidenceQuery,
  executeSafeSql,
  getCatalog
};
