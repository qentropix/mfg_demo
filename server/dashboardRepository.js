import { pool } from './db.js';
import {
  capas as demoCapas,
  calibrations,
  employees,
  getBaseDemoDashboard,
  getDemoDashboard,
  getShiftOptions,
  removeDemoAlert,
  suppliers
} from './demoData.js';

const ncrStoreByShift = new Map();
let capaStore = demoCapas.map((capa) => cloneCapa(capa));

function toNumber(value) {
  return Number.parseFloat(value);
}

function cloneNcr(ncr) {
  return { ...ncr };
}

function cloneCapa(capa) {
  return {
    ...capa,
    actions: (capa.actions ?? []).map((action) => ({ ...action })),
    stageHistory: (capa.stageHistory ?? []).map((entry) => ({ ...entry }))
  };
}

function getMergedNcrs(shiftName) {
  if (!ncrStoreByShift.has(shiftName)) {
    const demo = getDemoDashboard(shiftName);
    ncrStoreByShift.set(shiftName, demo.ncrs.map(cloneNcr));
  }

  return (ncrStoreByShift.get(shiftName) ?? []).map(cloneNcr).sort((a, b) => b.date - a.date);
}

function setMergedNcrs(shiftName, ncrs) {
  ncrStoreByShift.set(
    shiftName,
    ncrs.map((ncr) => cloneNcr(ncr))
  );
}

export function replaceMergedNcrs(shiftName, ncrs) {
  setMergedNcrs(shiftName, ncrs);
  return getMergedNcrs(shiftName);
}

function getMergedCapas() {
  return capaStore.map(cloneCapa);
}

export function replaceMergedCapas(nextCapas) {
  capaStore = nextCapas.map(cloneCapa);
  return getMergedCapas();
}

function mapPressRow(row) {
  return {
    id: Number(row.id),
    shiftName: row.shift_name,
    pressName: row.press_name,
    status: row.status,
    oee: toNumber(row.oee),
    outputCount: Number(row.output_count),
    downtimeMinutes: Number(row.downtime_minutes),
    currentJob: row.current_job,
    sortOrder: Number(row.sort_order)
  };
}

function mapAlertRow(row) {
  return {
    id: Number(row.id),
    shiftName: row.shift_name,
    severity: row.severity,
    title: row.title,
    message: row.message,
    createdAt: new Date(row.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }),
    isActive: row.is_active
  };
}

function getAllowedUpdatePairs(updates, columnMap) {
  const pairs = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const column = columnMap[key];
    if (!column) {
      continue;
    }

    pairs.push([column, value]);
  }

  return pairs;
}

function getShiftFallback(shiftName) {
  const demo = getDemoDashboard(shiftName);
  return {
    metadata: {
      shiftName: demo.shiftName,
      plantName: demo.plantName,
      lastUpdated: demo.lastUpdated
    },
    summary: {
      overallOee: demo.overallOee,
      totalOutput: demo.totalOutput,
      targetOutput: demo.targetOutput,
      goodParts: demo.goodParts,
      downtimeLabel: demo.downtimeLabel,
      downtimeMinutes: demo.downtimeMinutes,
      activeAlerts: demo.activeAlerts,
      criticalAlerts: demo.criticalAlerts,
      warningAlerts: demo.warningAlerts,
      qualityRate: demo.qualityRate,
      inspectionPassRate: demo.qualityRate
    },
    presses: demo.presses,
    downtime: demo.downtime,
    oeeTrend: demo.oeeTrend,
      alerts: demo.alerts.map((alert, index) => ({
        id: Number.isFinite(alert.id) ? alert.id : index + 1,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt
      })),
    orders: demo.orders,
    materials: demo.materials,
    defects: demo.defects,
    prevShiftDefects: demo.prevShiftDefects,
    ncrs: getMergedNcrs(shiftName),
    suppliers,
    employees,
    capas: getMergedCapas(),
    calibrations
  };
}

export async function getDashboardPayload(shiftName = 'Shift A') {
  if (!pool) {
    return getShiftFallback(shiftName);
  }

  try {
    const [snapshotResult, pressesResult, downtimeResult, trendResult, alertsResult] = await Promise.all([
      pool.query(
        `select shift_name, plant_name, last_updated, overall_oee, total_output, good_parts, downtime_label,
                downtime_minutes, active_alerts, critical_alerts, warning_alerts, quality_rate
         from dashboard_snapshots
         where shift_name = $1
         order by last_updated desc
         limit 1`,
        [shiftName]
      ),
      pool.query(
        `select press_name, status, oee, output_count, downtime_minutes, current_job
         from presses
         where shift_name = $1
         order by sort_order asc`,
        [shiftName]
      ),
      pool.query(
        `select reason, minutes, percent
         from downtime_events
         where shift_name = $1
         order by sort_order asc`,
        [shiftName]
      ),
      pool.query(
        `select day_label, value
         from oee_trend
         where shift_name = $1
         order by sort_order asc`,
        [shiftName]
      ),
      pool.query(
        `select id, severity, title, message, created_at
         from alerts
         where shift_name = $1 and is_active = true
         order by
           case severity when 'critical' then 1 when 'warning' then 2 else 3 end,
           created_at desc`,
        [shiftName]
      )
    ]);

    if (!snapshotResult.rowCount) {
      return getShiftFallback(shiftName);
    }

    const snapshot = snapshotResult.rows[0];
    const fallback = getShiftFallback(shiftName);
    return {
      metadata: {
        shiftName: snapshot.shift_name,
        plantName: snapshot.plant_name,
        lastUpdated: new Date(snapshot.last_updated).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit'
        })
      },
      summary: {
        overallOee: toNumber(snapshot.overall_oee),
        totalOutput: Number(snapshot.total_output),
        targetOutput: fallback.summary.targetOutput,
        goodParts: Number(snapshot.good_parts),
        downtimeLabel: snapshot.downtime_label,
        downtimeMinutes: Number(snapshot.downtime_minutes),
        activeAlerts: Number(snapshot.active_alerts),
        criticalAlerts: Number(snapshot.critical_alerts),
        warningAlerts: Number(snapshot.warning_alerts),
        qualityRate: toNumber(snapshot.quality_rate),
        inspectionPassRate: toNumber(snapshot.quality_rate)
      },
      presses: pressesResult.rows.map((row) => ({
        pressName: row.press_name,
        status: row.status,
        oee: toNumber(row.oee),
        outputCount: Number(row.output_count),
        downtimeMinutes: Number(row.downtime_minutes),
        currentJob: row.current_job
      })),
      downtime: downtimeResult.rows.map((row) => ({
        reason: row.reason,
        minutes: Number(row.minutes),
        percent: toNumber(row.percent)
      })),
      oeeTrend: trendResult.rows.map((row) => ({
        label: row.day_label,
        value: toNumber(row.value)
      })),
      alerts: alertsResult.rows.map((row) => ({
        id: Number(row.id),
        severity: row.severity,
        title: row.title,
        message: row.message,
        createdAt: new Date(row.created_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        })
      })),
      orders: fallback.orders,
      materials: fallback.materials,
      defects: fallback.defects,
      prevShiftDefects: fallback.prevShiftDefects,
      ncrs: getMergedNcrs(shiftName),
      suppliers,
      employees,
      capas: getMergedCapas(),
      calibrations
    };
  } catch (error) {
    console.warn(`Falling back to demo data: ${error.message}`);
    return getShiftFallback(shiftName);
  }
}

export async function listNcrs(shiftName = 'Shift A') {
  return getMergedNcrs(shiftName);
}

export async function createNcr(shiftName, ncr) {
  const record = cloneNcr({
    ...ncr,
    shiftName
  });
  const current = getMergedNcrs(shiftName);
  current.unshift(record);
  setMergedNcrs(shiftName, current);
  return record;
}

export function getShifts() {
  if (!pool) {
    return getShiftOptions();
  }

  return pool
    .query(`select distinct shift_name from dashboard_snapshots order by shift_name asc`)
    .then((result) => result.rows.map((row) => row.shift_name))
    .catch(() => getShiftOptions());
}

export async function listPresses(shiftName = 'Shift A') {
  if (!pool) {
    return getDemoDashboard(shiftName).presses.map((press, index) => ({
      id: index + 1,
      shiftName,
      pressName: press.pressName,
      status: press.status,
      oee: press.oee,
      outputCount: press.outputCount,
      downtimeMinutes: press.downtimeMinutes,
      currentJob: press.currentJob,
      sortOrder: index + 1
    }));
  }

  const result = await pool.query(
    `select id, shift_name, press_name, status, oee, output_count, downtime_minutes, current_job, sort_order
     from presses
     where shift_name = $1
     order by sort_order asc`,
    [shiftName]
  );

  return result.rows.map(mapPressRow);
}

export async function updatePress(shiftName, pressName, updates) {
  if (!pool) {
    throw new Error('Write endpoints require PostgreSQL. Set DATABASE_URL and run the API against the database.');
  }

  const columnMap = {
    status: 'status',
    oee: 'oee',
    outputCount: 'output_count',
    downtimeMinutes: 'downtime_minutes',
    currentJob: 'current_job'
  };

  const pairs = getAllowedUpdatePairs(updates, columnMap);
  if (!pairs.length) {
    throw new Error('No supported fields were provided for update.');
  }

  const setFragments = pairs.map(([column], index) => `${column} = $${index + 3}`);
  const values = [shiftName, pressName, ...pairs.map(([, value]) => value)];

  const result = await pool.query(
    `update presses
     set ${setFragments.join(', ')}
     where shift_name = $1 and press_name = $2
     returning id, shift_name, press_name, status, oee, output_count, downtime_minutes, current_job, sort_order`,
    values
  );

  if (!result.rowCount) {
    return null;
  }

  await pool.query(`update dashboard_snapshots set last_updated = now() where shift_name = $1`, [shiftName]);

  return mapPressRow(result.rows[0]);
}

export async function updateDashboardSnapshot(shiftName, updates) {
  if (!pool) {
    throw new Error('Write endpoints require PostgreSQL. Set DATABASE_URL and run the API against the database.');
  }

  const columnMap = {
    plantName: 'plant_name',
    overallOee: 'overall_oee',
    totalOutput: 'total_output',
    goodParts: 'good_parts',
    downtimeLabel: 'downtime_label',
    downtimeMinutes: 'downtime_minutes',
    activeAlerts: 'active_alerts',
    criticalAlerts: 'critical_alerts',
    warningAlerts: 'warning_alerts',
    qualityRate: 'quality_rate'
  };

  const pairs = getAllowedUpdatePairs(updates, columnMap);
  if (!pairs.length) {
    throw new Error('No supported fields were provided for update.');
  }

  const setFragments = pairs.map(([column], index) => `${column} = $${index + 2}`);
  const values = [shiftName, ...pairs.map(([, value]) => value)];

  const result = await pool.query(
    `update dashboard_snapshots
     set ${setFragments.join(', ')}, last_updated = now()
     where shift_name = $1
     returning shift_name, plant_name, last_updated, overall_oee, total_output, good_parts, downtime_label,
               downtime_minutes, active_alerts, critical_alerts, warning_alerts, quality_rate`,
    values
  );

  if (!result.rowCount) {
    return null;
  }

  const snapshot = result.rows[0];
  return {
    metadata: {
      shiftName: snapshot.shift_name,
      plantName: snapshot.plant_name,
      lastUpdated: new Date(snapshot.last_updated).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
      })
    },
    summary: {
      overallOee: toNumber(snapshot.overall_oee),
      totalOutput: Number(snapshot.total_output),
      targetOutput: getShiftFallback(shiftName).summary.targetOutput,
      goodParts: Number(snapshot.good_parts),
      downtimeLabel: snapshot.downtime_label,
      downtimeMinutes: Number(snapshot.downtime_minutes),
      activeAlerts: Number(snapshot.active_alerts),
      criticalAlerts: Number(snapshot.critical_alerts),
      warningAlerts: Number(snapshot.warning_alerts),
      qualityRate: toNumber(snapshot.quality_rate),
      inspectionPassRate: toNumber(snapshot.quality_rate)
    }
  };
}

export async function replaceShiftSeries(shiftName, { downtime, trend }) {
  if (!pool) {
    throw new Error('Write endpoints require PostgreSQL. Set DATABASE_URL and run the API against the database.');
  }

  if (downtime !== undefined) {
    await pool.query('delete from downtime_events where shift_name = $1', [shiftName]);
    for (let index = 0; index < downtime.length; index += 1) {
      const row = downtime[index];
      await pool.query(
        `insert into downtime_events (shift_name, reason, minutes, percent, sort_order)
         values ($1, $2, $3, $4, $5)`,
        [shiftName, row.reason, row.minutes, row.percent, index + 1]
      );
    }
  }

  if (trend !== undefined) {
    await pool.query('delete from oee_trend where shift_name = $1', [shiftName]);
    for (let index = 0; index < trend.length; index += 1) {
      const row = trend[index];
      await pool.query(
        `insert into oee_trend (shift_name, day_label, value, sort_order)
         values ($1, $2, $3, $4)`,
        [shiftName, row.label, row.value, index + 1]
      );
    }
  }

  await pool.query('update dashboard_snapshots set last_updated = now() where shift_name = $1', [shiftName]);
}

export async function replaceAlerts(shiftName, alerts) {
  if (!pool) {
    throw new Error('Write endpoints require PostgreSQL. Set DATABASE_URL and run the API against the database.');
  }

  await pool.query('delete from alerts where shift_name = $1', [shiftName]);

  for (const alert of alerts) {
    await pool.query(
      `insert into alerts (shift_name, severity, title, message, created_at, is_active)
       values ($1, $2, $3, $4, coalesce($5, now()), coalesce($6, true))`,
      [
        shiftName,
        alert.severity || 'warning',
        alert.title,
        alert.message,
        alert.createdAt ? new Date(alert.createdAt).toISOString() : null,
        alert.isActive
      ]
    );
  }

  await refreshAlertCounts(shiftName);
}

export async function listAlerts(shiftName = 'Shift A') {
  if (!pool) {
    return getDemoDashboard(shiftName).alerts.map((alert, index) => ({
      id: index + 1,
      shiftName,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      createdAt: alert.createdAt,
      isActive: true
    }));
  }

  const result = await pool.query(
    `select id, shift_name, severity, title, message, created_at, is_active
     from alerts
     where shift_name = $1
     order by
       case severity when 'critical' then 1 when 'warning' then 2 else 3 end,
       created_at desc`,
    [shiftName]
  );

  return result.rows.map(mapAlertRow);
}

async function refreshAlertCounts(shiftName) {
  const countsResult = await pool.query(
    `select
       count(*) filter (where is_active) as active_alerts,
       count(*) filter (where is_active and severity = 'critical') as critical_alerts,
       count(*) filter (where is_active and severity = 'warning') as warning_alerts
     from alerts
     where shift_name = $1`,
    [shiftName]
  );

  const counts = countsResult.rows[0];
  await pool.query(
    `update dashboard_snapshots
     set active_alerts = $2,
         critical_alerts = $3,
         warning_alerts = $4,
         last_updated = now()
     where shift_name = $1`,
    [
      shiftName,
      Number(counts.active_alerts),
      Number(counts.critical_alerts),
      Number(counts.warning_alerts)
    ]
  );
}

export async function createAlert(shiftName, alert) {
  if (!pool) {
    throw new Error('Write endpoints require PostgreSQL. Set DATABASE_URL and run the API against the database.');
  }

  const severity = alert.severity || 'warning';
  const title = alert.title;
  const message = alert.message;

  if (!title || !message) {
    throw new Error('title and message are required.');
  }

  const result = await pool.query(
    `insert into alerts (shift_name, severity, title, message, is_active)
     values ($1, $2, $3, $4, coalesce($5, true))
     returning id, shift_name, severity, title, message, created_at, is_active`,
    [shiftName, severity, title, message, alert.isActive]
  );

  await refreshAlertCounts(shiftName);
  return mapAlertRow(result.rows[0]);
}

export async function deleteAlert(shiftName, alertId) {
  if (!pool) {
    const removed = removeDemoAlert(shiftName, alertId);
    if (!removed) {
      return null;
    }
    return { id: Number(alertId), deleted: true };
  }

  const result = await pool.query(
    `update alerts
     set is_active = false
     where shift_name = $1 and id = $2
     returning id`,
    [shiftName, alertId]
  );

  if (!result.rowCount) {
    return null;
  }

  await refreshAlertCounts(shiftName);
  return { id: Number(result.rows[0].id), deleted: true };
}

export async function resetShift(shiftName = null) {
  const shifts = shiftName ? [shiftName] : ['Shift A', 'Shift B'];

  for (const shift of shifts) {
    ncrStoreByShift.delete(shift);
  }

  capaStore = demoCapas.map((capa) => cloneCapa(capa));

  if (!pool) {
    return { reset: shifts, mode: 'demo' };
  }

  for (const shift of shifts) {
    const demo = getBaseDemoDashboard(shift);

    await pool.query('delete from alerts where shift_name = $1', [shift]);
    await pool.query('delete from oee_trend where shift_name = $1', [shift]);
    await pool.query('delete from downtime_events where shift_name = $1', [shift]);
    await pool.query('delete from presses where shift_name = $1', [shift]);
    await pool.query('delete from dashboard_snapshots where shift_name = $1', [shift]);

    await pool.query(
      `insert into dashboard_snapshots
         (shift_name, plant_name, last_updated, overall_oee, total_output, good_parts,
          downtime_label, downtime_minutes, active_alerts, critical_alerts, warning_alerts, quality_rate)
       values ($1,$2,now(),$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [shift, demo.plantName, demo.overallOee, demo.totalOutput, demo.goodParts,
       demo.downtimeLabel, demo.downtimeMinutes, demo.activeAlerts,
       demo.criticalAlerts, demo.warningAlerts, demo.qualityRate]
    );

    for (const [i, press] of demo.presses.entries()) {
      await pool.query(
        `insert into presses
           (shift_name, press_name, status, oee, output_count, downtime_minutes, current_job, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [shift, press.pressName, press.status, press.oee,
         press.outputCount, press.downtimeMinutes, press.currentJob, i + 1]
      );
    }

    for (const [i, d] of demo.downtime.entries()) {
      await pool.query(
        `insert into downtime_events (shift_name, reason, minutes, percent, sort_order)
         values ($1,$2,$3,$4,$5)`,
        [shift, d.reason, d.minutes, d.percent, i + 1]
      );
    }

    for (const [i, t] of demo.oeeTrend.entries()) {
      await pool.query(
        `insert into oee_trend (shift_name, day_label, value, sort_order)
         values ($1,$2,$3,$4)`,
        [shift, t.label, t.value, i + 1]
      );
    }

    for (const alert of demo.alerts) {
      await pool.query(
        `insert into alerts (shift_name, severity, title, message, created_at, is_active)
         values ($1,$2,$3,$4,now(),true)`,
        [shift, alert.severity, alert.title, alert.message]
      );
    }
  }

  return { reset: shifts, mode: 'db' };
}

export async function listCapas() {
  return getMergedCapas();
}

export async function createCapa(capa) {
  const record = cloneCapa({
    ...capa,
    openedDate: capa.openedDate ?? Date.now(),
    stageHistory: capa.stageHistory ?? [{ stage: 'Open', timestamp: capa.openedDate ?? Date.now() }]
  });

  capaStore = [record, ...capaStore];
  return cloneCapa(record);
}

export async function updateCapa(capaId, updates) {
  const index = capaStore.findIndex((capa) => capa.id === capaId);
  if (index === -1) return null;

  const current = capaStore[index];
  const next = cloneCapa({
    ...current,
    ...updates,
    actions: updates.actions ? updates.actions.map((action) => ({ ...action })) : current.actions,
    stageHistory: updates.stageHistory ? updates.stageHistory.map((entry) => ({ ...entry })) : current.stageHistory
  });

  capaStore = capaStore.map((capa, itemIndex) => (itemIndex === index ? next : capa));
  return cloneCapa(next);
}

export async function updateNcr(shiftName, ncrId, updates) {
  const current = getMergedNcrs(shiftName);
  const index = current.findIndex((ncr) => ncr.id === ncrId);
  if (index === -1) return null;

  const next = cloneNcr({
    ...current[index],
    ...updates
  });

  current[index] = next;
  setMergedNcrs(shiftName, current);
  return cloneNcr(next);
}
