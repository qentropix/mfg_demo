import dotenv from 'dotenv';
import pg from 'pg';
import { getDashboardPayload } from './dashboardRepository.js';
import { insertOperationalEvents, upsertDailyMetrics, upsertIngestionCheckpoint } from './historyRepository.js';

dotenv.config();

const { Client } = pg;
const intervalMs = Number.parseInt(process.env.HISTORY_WORKER_INTERVAL_MS || '60000', 10);
const shifts = ['Shift A', 'Shift B'];
const lastSignatureByShift = new Map();

async function notify(client, shiftName) {
  await client.query(`select pg_notify('dashboard_update', $1)`, [JSON.stringify({ shiftName })]);
}

function buildSignature(payload) {
  return JSON.stringify({
    summary: payload.summary,
    presses: payload.presses.map((press) => [
      press.pressName,
      press.status,
      press.oee,
      press.outputCount,
      press.downtimeMinutes,
      press.currentJob
    ]),
    alerts: (payload.alerts ?? []).map((alert) => [alert.id, alert.severity, alert.title, alert.message]),
    downtime: (payload.downtime ?? []).map((row) => [row.reason, row.minutes, row.percent]),
    trend: (payload.oeeTrend ?? []).map((row) => [row.label, row.value])
  });
}

function buildDailyMetric(shiftName, payload) {
  return {
    shift_name: shiftName,
    metric_date: new Date().toISOString().slice(0, 10),
    plant_name: payload.metadata.plantName,
    overall_oee: payload.summary.overallOee,
    total_output: payload.summary.totalOutput,
    good_parts: payload.summary.goodParts,
    downtime_minutes: payload.summary.downtimeMinutes,
    quality_rate: payload.summary.qualityRate,
    active_alerts: payload.summary.activeAlerts,
    critical_alerts: payload.summary.criticalAlerts,
    warning_alerts: payload.summary.warningAlerts
  };
}

function buildSyncEvent(shiftName, payload) {
  const targetPress = payload.presses.find((press) => press.status !== 'Running') ?? payload.presses[0];
  return {
    shift_name: shiftName,
    metric_date: new Date().toISOString().slice(0, 10),
    event_time: new Date().toISOString(),
    event_type: 'state_sync',
    severity: payload.summary.criticalAlerts > 0 ? 'warning' : 'info',
    title: `${shiftName} snapshot synced`,
    details: `Database state synced with ${payload.summary.overallOee.toFixed(1)}% OEE and ${payload.summary.activeAlerts} active alerts.`,
    machine_name: targetPress?.pressName ?? null,
    entity_type: 'shift',
    entity_id: shiftName,
    metric_value: payload.summary.overallOee
  };
}

async function syncShift(client, shiftName) {
  const payload = await getDashboardPayload(shiftName);
  const signature = buildSignature(payload);

  if (lastSignatureByShift.get(shiftName) === signature) {
    return false;
  }

  lastSignatureByShift.set(shiftName, signature);

  await upsertDailyMetrics(client, buildDailyMetric(shiftName, payload));
  await insertOperationalEvents(client, [buildSyncEvent(shiftName, payload)]);
  await upsertIngestionCheckpoint(client, `live-sync:${shiftName}`, new Date().toISOString(), 1);
  await notify(client, shiftName);
  return true;
}

async function runOnce(client) {
  let updated = 0;
  for (const shiftName of shifts) {
    const changed = await syncShift(client, shiftName);
    if (changed) {
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('HISTORY_WORKER: DATABASE_URL missing, worker disabled.');
    setInterval(() => {}, 60 * 60 * 1000);
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let running = false;
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const updated = await runOnce(client);
      if (updated) {
        console.log(`HISTORY_WORKER: synced ${updated} shift(s) from DB`);
      }
    } catch (error) {
      console.error(`HISTORY_WORKER: ${error.message}`);
    } finally {
      running = false;
    }
  };

  await tick();
  const timer = setInterval(tick, intervalMs);

  const shutdown = async () => {
    clearInterval(timer);
    await client.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
