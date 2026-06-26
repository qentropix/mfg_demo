import { query as dbQuery } from './db.js';
import { getHistoryDay, listHistorySummary } from './historyRepository.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const SQL_AGENT_MODEL = process.env.OLLAMA_REASONING_MODEL || process.env.AI_REASONING_MODEL || 'deepseek-r1';
const AI_PROVIDER = String(process.env.AI_PROVIDER ?? 'auto').toLowerCase();

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

const READ_ONLY_TABLES = new Set([
  'dashboard_snapshots',
  'presses',
  'downtime_events',
  'oee_trend',
  'alerts',
  'shift_daily_metrics',
  'operational_events'
]);

function normalize(text) {
  return String(text ?? '').trim().toLowerCase();
}

function normalizeHistoricalDateQuery(query) {
  return String(query ?? '').toLowerCase().replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');
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

function formatMonthLabel(year, monthIndex) {
  return `${new Date(year, monthIndex, 1).toLocaleString('en-US', { month: 'long' })} ${year}`;
}

function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : 'n/a';
}

function formatPercent(value, digits = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(digits)}%` : 'n/a';
}

function formatSignedNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  return `${num > 0 ? '+' : ''}${num.toLocaleString()}`;
}

function formatSignedPercent(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  return `${num > 0 ? '+' : ''}${num.toFixed(digits)}%`;
}

function parseHistoricalDate(query) {
  const text = normalizeHistoricalDateQuery(query);
  const currentYear = new Date().getFullYear();
  const matchers = [
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s+(\d{4}))?\b/i,
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    /\b(\d{2})-(\d{2})-(\d{4})\b/
  ];

  for (const matcher of matchers) {
    const match = text.match(matcher);
    if (!match) continue;

    if (matcher.source.includes('\\d{4}-')) {
      const [, year, month, day] = match;
      const candidate = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(candidate.getTime())) return candidate;
    } else if (matcher.source.includes('\\d{2}-\\d{2}-\\d{4}')) {
      const [, day, month, year] = match;
      const candidate = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(candidate.getTime())) return candidate;
    } else {
      const first = match[1];
      const second = match[2];
      const third = match[3];
      const dayFirst = Number(first);
      const monthFirst = MONTHS[first];
      const daySecond = Number(second);
      const monthSecond = MONTHS[second];
      const year = third ? Number(third) : currentYear;

      if (monthFirst !== undefined) {
        const candidate = new Date(year, monthFirst, daySecond);
        if (!Number.isNaN(candidate.getTime())) return candidate;
      }

      if (monthSecond !== undefined) {
        const candidate = new Date(year, monthSecond, dayFirst);
        if (!Number.isNaN(candidate.getTime())) return candidate;
      }
    }
  }

  return null;
}

function parseMonthPhrase(query) {
  const text = normalizeHistoricalDateQuery(query);
  const currentYear = new Date().getFullYear();
  const explicitYears = [...text.matchAll(/\b(\d{4})\b/g)].map((match) => Number(match[1])).filter((value) => Number.isFinite(value));
  const sharedYear = explicitYears.length === 1 ? explicitYears[0] : currentYear;
  const tokens = [];
  const seen = new Set();

  for (const match of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi)) {
    const month = MONTHS[match[1].toLowerCase()];
    const year = Number(match[2]);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push({ index: match.index ?? 0, year, month });
    }
  }

  for (const match of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?!\s+\d{4})/gi)) {
    const month = MONTHS[match[1].toLowerCase()];
    const year = sharedYear;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push({ index: match.index ?? 0, year, month });
    }
  }

  return tokens
    .sort((a, b) => a.index - b.index)
    .map((token) => ({
      year: token.year,
      month: token.month,
      label: formatMonthLabel(token.year, token.month)
    }));
}

function parseRelativeDays(query) {
  const text = normalize(query);
  const match = text.match(/\b(last|past|previous)\s+(\d{1,3})\s+days?\b/);
  if (match) {
    return Number(match[2]);
  }
  if (text.includes('last 30 days') || text.includes('past month')) return 30;
  if (text.includes('last 90 days') || text.includes('last quarter')) return 90;
  if (text.includes('last 180 days') || text.includes('last 6 months')) return 180;
  if (text.includes('last 210 days') || text.includes('last 7 months')) return 210;
  return null;
}

function isComparisonQuery(query) {
  const text = normalize(query);
  return text.includes('compare') || text.includes('comparison') || text.includes('vs') || text.includes('versus') || text.includes('between') || text.includes('difference') || text.includes('changed');
}

function formatDailyMetrics(day) {
  if (!day) return 'No data found for that day.';
  return [
    `On ${day.metricDate}, ${day.shiftName} recorded ${formatPercent(day.overallOee)} OEE.`,
    `Output was ${formatNumber(day.totalOutput)} units with ${formatNumber(day.goodParts)} good parts.`,
    `Downtime was ${formatNumber(day.downtimeMinutes)} minutes and quality rate was ${formatPercent(day.qualityRate)}.`,
    `Alerts that day were ${formatNumber(day.activeAlerts)} total, including ${formatNumber(day.criticalAlerts)} critical and ${formatNumber(day.warningAlerts)} warning.`
  ].join(' ');
}

function formatComparison(left, right, leftLabel, rightLabel) {
  if (!left || !right) {
    return `I could not compare ${leftLabel} and ${rightLabel} because one or both dates are missing from the history table.`;
  }

  const oeeDelta = Number(right.overallOee ?? 0) - Number(left.overallOee ?? 0);
  const outputDelta = Number(right.totalOutput ?? 0) - Number(left.totalOutput ?? 0);
  const downtimeDelta = Number(right.downtimeMinutes ?? 0) - Number(left.downtimeMinutes ?? 0);
  const qualityDelta = Number(right.qualityRate ?? 0) - Number(left.qualityRate ?? 0);

  return [
    `${leftLabel}: ${formatPercent(left.overallOee)} OEE, ${formatNumber(left.totalOutput)} output, ${formatNumber(left.downtimeMinutes)} downtime minutes, ${formatPercent(left.qualityRate)} quality.`,
    `${rightLabel}: ${formatPercent(right.overallOee)} OEE, ${formatNumber(right.totalOutput)} output, ${formatNumber(right.downtimeMinutes)} downtime minutes, ${formatPercent(right.qualityRate)} quality.`,
    `Change: ${formatSignedPercent(oeeDelta)} OEE, ${formatSignedNumber(outputDelta)} output, ${formatSignedNumber(downtimeDelta)} downtime minutes, ${formatSignedPercent(qualityDelta)} quality.`
  ].join(' ');
}

async function runMonthAggregate(shiftName, year, monthIndex) {
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 1);
  const result = await dbQuery(
    `select
       count(*)::int as days,
       sum(total_output)::numeric as total_output,
       sum(good_parts)::numeric as good_parts,
       sum(downtime_minutes)::numeric as downtime_minutes,
       avg(overall_oee)::numeric as avg_oee,
       avg(quality_rate)::numeric as avg_quality_rate,
       sum(active_alerts)::numeric as active_alerts,
       sum(critical_alerts)::numeric as critical_alerts,
       sum(warning_alerts)::numeric as warning_alerts
     from shift_daily_metrics
     where shift_name = $1
       and metric_date >= $2::date
       and metric_date < $3::date`,
    [shiftName, formatLocalDateKey(startDate), formatLocalDateKey(endDate)]
  );

  const row = result.rows[0] ?? {};
  return {
    label: formatMonthLabel(year, monthIndex),
    startDate: formatLocalDateKey(startDate),
    endDate: formatLocalDateKey(endDate),
    days: Number(row.days ?? 0),
    totalOutput: Number(row.total_output ?? 0),
    goodParts: Number(row.good_parts ?? 0),
    downtimeMinutes: Number(row.downtime_minutes ?? 0),
    avgOee: Number(row.avg_oee ?? 0),
    avgQualityRate: Number(row.avg_quality_rate ?? 0),
    activeAlerts: Number(row.active_alerts ?? 0),
    criticalAlerts: Number(row.critical_alerts ?? 0),
    warningAlerts: Number(row.warning_alerts ?? 0)
  };
}

function formatMonthAggregate(month) {
  return [
    `${month.label}: ${month.days} day(s), ${formatNumber(month.totalOutput)} output, ${formatPercent(month.avgOee)} avg OEE, ${formatNumber(month.downtimeMinutes)} downtime minutes, ${formatPercent(month.avgQualityRate)} avg quality, ${formatNumber(month.activeAlerts)} alerts.`
  ].join(' ');
}

function formatMonthComparison(left, right) {
  if (!left || !right || !left.days || !right.days) {
    return `I could not compare the selected months because one or both months are missing from the history table.`;
  }

  const outputDelta = Number(right.totalOutput ?? 0) - Number(left.totalOutput ?? 0);
  const oeeDelta = Number(right.avgOee ?? 0) - Number(left.avgOee ?? 0);
  const downtimeDelta = Number(right.downtimeMinutes ?? 0) - Number(left.downtimeMinutes ?? 0);
  const qualityDelta = Number(right.avgQualityRate ?? 0) - Number(left.avgQualityRate ?? 0);
  const alertsDelta = Number(right.activeAlerts ?? 0) - Number(left.activeAlerts ?? 0);

  return [
    formatMonthAggregate(left),
    formatMonthAggregate(right),
    `Change: ${formatSignedNumber(outputDelta)} output, ${formatSignedPercent(oeeDelta)} OEE, ${formatSignedNumber(downtimeDelta)} downtime minutes, ${formatSignedPercent(qualityDelta)} quality, ${formatSignedNumber(alertsDelta)} alerts.`
  ].join(' ');
}

function shouldUseSqlAgent(query) {
  const text = normalize(query);
  return (
    text.includes('trend') ||
    text.includes('average') ||
    text.includes('avg') ||
    text.includes('sum') ||
    text.includes('total') ||
    text.includes('count') ||
    text.includes('top') ||
    text.includes('most') ||
    text.includes('least') ||
    text.includes('group by') ||
    text.includes('rank') ||
    text.includes('highest') ||
    text.includes('lowest')
  );
}

function extractJson(text) {
  const raw = String(text ?? '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validateSql(sql) {
  if (!sql || typeof sql !== 'string') return null;
  let cleaned = sql.trim().replace(/;+\s*$/, '');
  cleaned = cleaned.replace(/```sql|```/gi, '').trim();
  if (!/^(with|select)\b/i.test(cleaned)) return null;
  if (/[;]/.test(cleaned)) return null;
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|attach|detach|merge|call)\b/i.test(cleaned)) {
    return null;
  }

  const tableMatches = [...cleaned.toLowerCase().matchAll(/\b(from|join)\s+([a-z_][a-z0-9_]*)/g)].map((match) => match[2]);
  if (tableMatches.length && tableMatches.some((table) => !READ_ONLY_TABLES.has(table))) {
    return null;
  }

  return cleaned;
}

async function generateSqlPlan(query, shiftName) {
  if (AI_PROVIDER === 'deterministic') {
    return null;
  }

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
              'You are a PostgreSQL query planner for a manufacturing dashboard.',
              'Return STRICT JSON only with keys: sql, explanation, label.',
              'Use only read-only SELECT or WITH queries.',
              'Use only these tables:',
              '- dashboard_snapshots(shift_name, plant_name, last_updated, overall_oee, total_output, good_parts, downtime_label, downtime_minutes, active_alerts, critical_alerts, warning_alerts, quality_rate)',
              '- presses(shift_name, press_name, status, oee, output_count, downtime_minutes, current_job, sort_order)',
              '- downtime_events(shift_name, reason, minutes, percent, sort_order)',
              '- oee_trend(shift_name, day_label, value, sort_order)',
              '- alerts(shift_name, severity, title, message, created_at, is_active)',
              '- shift_daily_metrics(shift_name, metric_date, plant_name, overall_oee, total_output, good_parts, downtime_minutes, quality_rate, active_alerts, critical_alerts, warning_alerts)',
              '- operational_events(shift_name, metric_date, event_time, event_type, severity, title, details, machine_name, entity_type, entity_id, metric_value)',
              `Shift in context: ${shiftName}.`,
              'If the user asks for a comparison, use SQL with aggregations or a CTE.',
              'If the request cannot be answered from these tables, set sql to null and explain why.'
            ].join(' ')
          },
          {
            role: 'user',
            content: `Question: ${query}`
          }
        ],
        options: {
          temperature: 0,
          num_predict: 350
        }
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const content = payload?.message?.content ?? '';
    const plan = extractJson(content);
    const sql = validateSql(plan?.sql);
    if (!sql) {
      return null;
    }

    return {
      sql,
      explanation: typeof plan?.explanation === 'string' ? plan.explanation : '',
      label: typeof plan?.label === 'string' ? plan.label : 'Ad hoc query'
    };
  } catch {
    return null;
  }
}

function formatRows(rows, limit = 8) {
  if (!rows.length) {
    return 'No rows matched your query.';
  }

  if (rows.length === 1) {
    return Object.entries(rows[0])
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
      .join(', ');
  }

  return rows.slice(0, limit).map((row, index) => {
    const entries = Object.entries(row).slice(0, 4).map(([key, value]) => `${key.replace(/_/g, ' ')}=${value}`);
    return `${index + 1}. ${entries.join(', ')}`;
  }).join('\n');
}

async function runSqlAgent(query, shiftName) {
  const plan = await generateSqlPlan(query, shiftName);
  if (!plan?.sql) {
    return null;
  }

  const result = await dbQuery(plan.sql);
  return {
    source: 'sql-agent',
    label: plan.label || 'Query result',
    sql: plan.sql,
    explanation: plan.explanation,
    answer: result.rowCount
      ? `${plan.label || 'Query result'}\n${formatRows(result.rows)}`
      : `No rows matched the query.`
  };
}

export async function resolveRetrievalAnswer({ query, shiftName = 'Shift A' } = {}) {
  try {
    const text = normalize(query);
    if (!text) {
      return null;
    }

    const exactDates = [...text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|(?:\d{1,2})(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})(?:\s+\d{4})?\b/gi)]
      .map((match) => parseHistoricalDate(match[0]))
      .filter(Boolean)
      .map((date) => formatLocalDateKey(date));
    const monthPhrases = parseMonthPhrase(text);

    if (exactDates.length >= 2 || (isComparisonQuery(text) && monthPhrases.length >= 2)) {
      if (exactDates.length >= 2) {
        const [leftDate, rightDate] = exactDates;
        const [left, right] = await Promise.all([
          getHistoryDay(shiftName, leftDate),
          getHistoryDay(shiftName, rightDate)
        ]);
        return {
          source: 'history-compare',
          queryType: 'day-compare',
          answer: formatComparison(left, right, leftDate, rightDate)
        };
      }

      const [leftMonth, rightMonth] = monthPhrases;
      const [left, right] = await Promise.all([
        runMonthAggregate(shiftName, leftMonth.year, leftMonth.month),
        runMonthAggregate(shiftName, rightMonth.year, rightMonth.month)
      ]);
      return {
        source: 'history-compare',
        queryType: 'month-compare',
        answer: formatMonthComparison(left, right)
      };
    }

    const directDate = parseHistoricalDate(text);
    if (directDate) {
      const dateKey = formatLocalDateKey(directDate);
      const day = dateKey ? await getHistoryDay(shiftName, dateKey) : null;
      return {
        source: 'history-day',
        queryType: 'exact-day',
        answer: day ? formatDailyMetrics(day) : `I could not find history for ${dateKey ?? 'that date'}.`
      };
    }

    if (monthPhrases.length === 1 && (text.includes('output') || text.includes('oee') || text.includes('downtime') || text.includes('quality') || text.includes('alert') || text.includes('metric'))) {
      const month = monthPhrases[0];
      const aggregate = await runMonthAggregate(shiftName, month.year, month.month);
      return {
        source: 'history-month',
        queryType: 'month-summary',
        answer: formatMonthAggregate(aggregate)
      };
    }

    const relativeDays = parseRelativeDays(text);
    if (relativeDays) {
      const summary = await listHistorySummary(shiftName, relativeDays);
      if (!summary.length) {
        return {
          source: 'history-range',
          queryType: 'range-summary',
          answer: `No historical data found for the last ${relativeDays} days.`
        };
      }
      const first = summary[0];
      const last = summary[summary.length - 1];
      const totalOutput = summary.reduce((sum, day) => sum + Number(day.totalOutput ?? 0), 0);
      const downtime = summary.reduce((sum, day) => sum + Number(day.downtimeMinutes ?? 0), 0);
      const avgOee = summary.reduce((sum, day) => sum + Number(day.overallOee ?? 0), 0) / summary.length;
      return {
        source: 'history-range',
        queryType: 'range-summary',
        answer: [
          `I found ${summary.length} day(s) of history from ${first.metricDate} to ${last.metricDate}.`,
          `Average OEE was ${formatPercent(avgOee)} with ${formatNumber(totalOutput)} total output and ${formatNumber(downtime)} downtime minutes.`
        ].join(' ')
      };
    }

    if (shouldUseSqlAgent(text)) {
      const sqlAgentResult = await runSqlAgent(text, shiftName);
      if (sqlAgentResult) {
        return sqlAgentResult;
      }
    }

    return null;
  } catch {
    return null;
  }
}
