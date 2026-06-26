import { pool } from './db.js';

function db(target = pool) {
  if (!target) {
    throw new Error('DATABASE_URL is not configured');
  }
  return target;
}

function mapDailyMetric(row) {
  return {
    id: Number(row.id),
    shiftName: row.shift_name,
    metricDate: row.metric_date,
    plantName: row.plant_name,
    overallOee: Number(row.overall_oee),
    totalOutput: Number(row.total_output),
    goodParts: Number(row.good_parts),
    downtimeMinutes: Number(row.downtime_minutes),
    qualityRate: Number(row.quality_rate),
    activeAlerts: Number(row.active_alerts),
    criticalAlerts: Number(row.critical_alerts),
    warningAlerts: Number(row.warning_alerts),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOperationalEvent(row) {
  return {
    id: Number(row.id),
    shiftName: row.shift_name,
    metricDate: row.metric_date,
    eventTime: row.event_time,
    eventType: row.event_type,
    severity: row.severity,
    title: row.title,
    details: row.details,
    machineName: row.machine_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metricValue: row.metric_value === null ? null : Number(row.metric_value)
  };
}

export async function upsertDailyMetrics(clientOrPool, metric) {
  const target = db(clientOrPool);
  await target.query(
    `insert into shift_daily_metrics (
       shift_name, metric_date, plant_name, overall_oee, total_output, good_parts,
       downtime_minutes, quality_rate, active_alerts, critical_alerts, warning_alerts, updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     on conflict (shift_name, metric_date)
     do update set
       plant_name = excluded.plant_name,
       overall_oee = excluded.overall_oee,
       total_output = excluded.total_output,
       good_parts = excluded.good_parts,
       downtime_minutes = excluded.downtime_minutes,
       quality_rate = excluded.quality_rate,
       active_alerts = excluded.active_alerts,
       critical_alerts = excluded.critical_alerts,
       warning_alerts = excluded.warning_alerts,
       updated_at = now()`,
    [
      metric.shift_name,
      metric.metric_date,
      metric.plant_name,
      metric.overall_oee,
      metric.total_output,
      metric.good_parts,
      metric.downtime_minutes,
      metric.quality_rate,
      metric.active_alerts,
      metric.critical_alerts,
      metric.warning_alerts
    ]
  );
}

export async function insertOperationalEvents(clientOrPool, events) {
  if (!events.length) return;
  const target = db(clientOrPool);
  for (const event of events) {
    await target.query(
      `insert into operational_events (
         shift_name, metric_date, event_time, event_type, severity, title, details,
         machine_name, entity_type, entity_id, metric_value
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.shift_name,
        event.metric_date,
        event.event_time,
        event.event_type,
        event.severity,
        event.title,
        event.details,
        event.machine_name,
        event.entity_type,
        event.entity_id,
        event.metric_value
      ]
    );
  }
}

export async function upsertIngestionCheckpoint(clientOrPool, sourceName, lastEventTime, rowCount) {
  const target = db(clientOrPool);
  await target.query(
    `insert into ingestion_checkpoints (source_name, last_event_time, row_count, updated_at)
     values ($1, $2, $3, now())
     on conflict (source_name)
     do update set last_event_time = excluded.last_event_time, row_count = excluded.row_count, updated_at = now()`,
    [sourceName, lastEventTime, rowCount]
  );
}

export async function listHistorySummary(shiftName = 'Shift A', days = 180, clientOrPool = pool) {
  if (!clientOrPool) {
    return [];
  }
  const target = db(clientOrPool);
  const result = await target.query(
    `select id, shift_name, metric_date, plant_name, overall_oee, total_output, good_parts,
            downtime_minutes, quality_rate, active_alerts, critical_alerts, warning_alerts,
            created_at, updated_at
     from shift_daily_metrics
     where shift_name = $1
       and metric_date >= current_date - ($2::int - 1)
     order by metric_date asc`,
    [shiftName, days]
  );

  return result.rows.map(mapDailyMetric);
}

export async function getHistoryDay(shiftName = 'Shift A', metricDate, clientOrPool = pool) {
  if (!clientOrPool || !metricDate) {
    return null;
  }

  const target = db(clientOrPool);
  const result = await target.query(
    `select id, shift_name, metric_date, plant_name, overall_oee, total_output, good_parts,
            downtime_minutes, quality_rate, active_alerts, critical_alerts, warning_alerts,
            created_at, updated_at
     from shift_daily_metrics
     where shift_name = $1
       and metric_date = $2::date
     limit 1`,
    [shiftName, metricDate]
  );

  return result.rows[0] ? mapDailyMetric(result.rows[0]) : null;
}

export async function listHistoryEventsForDay(shiftName = 'Shift A', metricDate, clientOrPool = pool) {
  if (!clientOrPool || !metricDate) {
    return [];
  }

  const target = db(clientOrPool);
  const result = await target.query(
    `select id, shift_name, metric_date, event_time, event_type, severity, title, details,
            machine_name, entity_type, entity_id, metric_value
     from operational_events
     where shift_name = $1
       and metric_date = $2::date
     order by event_time asc`,
    [shiftName, metricDate]
  );

  return result.rows.map(mapOperationalEvent);
}

export async function listHistoryEvents(shiftName = 'Shift A', days = 30, limit = 120, clientOrPool = pool) {
  if (!clientOrPool) {
    return [];
  }
  const target = db(clientOrPool);
  const result = await target.query(
    `select id, shift_name, metric_date, event_time, event_type, severity, title, details,
            machine_name, entity_type, entity_id, metric_value
     from operational_events
     where shift_name = $1
       and event_time >= now() - ($2::int || ' days')::interval
     order by event_time desc
     limit $3`,
    [shiftName, days, limit]
  );

  return result.rows.map(mapOperationalEvent);
}

export async function listHistoryInsights(shiftName = 'Shift A', days = 180, clientOrPool = pool) {
  if (!clientOrPool) {
    return {
      shiftName,
      days,
      summary: {
        avgOee: null,
        minOee: null,
        maxOee: null,
        totalOutput: 0,
        goodParts: 0,
        downtimeMinutes: 0,
        avgQualityRate: null,
        activeAlerts: 0
      },
      eventBreakdown: []
    };
  }
  const target = db(clientOrPool);
  const [summaryResult, eventResult] = await Promise.all([
    target.query(
      `select
         avg(overall_oee) as avg_oee,
         min(overall_oee) as min_oee,
         max(overall_oee) as max_oee,
         sum(total_output) as total_output,
         sum(good_parts) as good_parts,
         sum(downtime_minutes) as downtime_minutes,
         avg(quality_rate) as avg_quality_rate,
         sum(active_alerts) as active_alerts
       from shift_daily_metrics
       where shift_name = $1
         and metric_date >= current_date - ($2::int - 1)`,
      [shiftName, days]
    ),
    target.query(
      `select event_type, severity, count(*)::int as count
       from operational_events
       where shift_name = $1
         and event_time >= now() - ($2::int || ' days')::interval
       group by event_type, severity
       order by count desc`,
      [shiftName, days]
    )
  ]);

  const summary = summaryResult.rows[0] ?? {};
  const eventBreakdown = eventResult.rows.map((row) => ({
    eventType: row.event_type,
    severity: row.severity,
    count: Number(row.count)
  }));

  return {
    shiftName,
    days,
    summary: {
      avgOee: summary.avg_oee === null ? null : Number(summary.avg_oee),
      minOee: summary.min_oee === null ? null : Number(summary.min_oee),
      maxOee: summary.max_oee === null ? null : Number(summary.max_oee),
      totalOutput: summary.total_output === null ? 0 : Number(summary.total_output),
      goodParts: summary.good_parts === null ? 0 : Number(summary.good_parts),
      downtimeMinutes: summary.downtime_minutes === null ? 0 : Number(summary.downtime_minutes),
      avgQualityRate: summary.avg_quality_rate === null ? null : Number(summary.avg_quality_rate),
      activeAlerts: summary.active_alerts === null ? 0 : Number(summary.active_alerts)
    },
    eventBreakdown
  };
}
