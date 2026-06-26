const DAY_MS = 86400000;
const SHIFTS = ['Shift A', 'Shift B'];
const MACHINES = ['Press 01', 'Press 02', 'Press 03', 'Press 04', 'Press 05', 'Press 06'];

function hashSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed);
  return function next() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function shiftBase(shiftName) {
  return shiftName === 'Shift A'
    ? {
        plantName: 'Plant 1',
        oee: 77.6,
        output: 18400,
        goodRate: 0.931,
        downtime: 158,
        alerts: 5
      }
    : {
        plantName: 'Plant 1',
        oee: 73.8,
        output: 17650,
        goodRate: 0.926,
        downtime: 182,
        alerts: 4
      };
}

function buildMachineStatuses(shiftName, dayIndex, rng) {
  return MACHINES.map((pressName, index) => {
    const bias = shiftName === 'Shift A' ? 1.6 : -0.8;
    const wave = Math.sin((dayIndex + index) / 5) * 4.5;
    const oee = clamp(round(78 + bias + wave + (rng() - 0.5) * 8, 1), 0, 94);
    const downtimeMinutes = Math.max(0, Math.round(14 + index * 5 + rng() * 26 + (pressName === 'Press 05' ? 24 : 0)));
    const outputCount = Math.max(0, Math.round(2400 + index * 160 + dayIndex * 10 + rng() * 220));
    const status =
      pressName === 'Press 05' && (dayIndex % 17 === 0 || shiftName === 'Shift A')
        ? 'Down'
        : oee < 65
          ? 'Minor Stop'
          : 'Running';

    return {
      pressName,
      status,
      oee,
      outputCount,
      downtimeMinutes,
      currentJob: ['Auto Door Panels', 'Side Frame Batch', 'Hinge Mount Kits', 'Reinforcement Brackets', 'Tool Change Queue', 'Latch Assembly'][
        index
      ]
    };
  });
}

function buildDowntimeReasons(shiftName, metrics) {
  const leadingPress = metrics.find((press) => press.status === 'Down')?.pressName ?? 'Press 05';
  const base = shiftName === 'Shift A' ? 132 : 146;
  return [
    { reason: 'Tool Change', minutes: base, percent: 35.2 },
    { reason: 'Material Shortage', minutes: Math.round(base * 0.52), percent: 18.4 },
    { reason: 'Setup', minutes: Math.round(base * 0.34), percent: 12.6 },
    { reason: 'Breakdown', minutes: Math.round(base * 0.24), percent: 8.8 },
    { reason: 'Quality Hold', minutes: Math.round(base * 0.18), percent: 6.5 },
    { reason: 'Operator Delay', minutes: Math.round(base * 0.14), percent: 5.1 },
    { reason: `${leadingPress} Hold`, minutes: Math.round(base * 0.11), percent: 4.0 }
  ];
}

function buildTrend(shiftName, dayIndex) {
  const base = shiftName === 'Shift A' ? 68.5 : 66.8;
  return Array.from({ length: 7 }, (_, index) => ({
    label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'][index],
    value: round(base + dayIndex * 0.11 + Math.sin((dayIndex + index) / 3.4) * 2.4 + index * 0.46, 1)
  }));
}

function buildAlerts(shiftName, metricDate, metrics, dayIndex) {
  const timestampBase = new Date(metricDate.getTime() + 8 * 60 * 60000);
  const primaryDown = metrics.find((press) => press.status === 'Down');
  const secondaryStop = metrics.find((press) => press.oee < 70 && press.pressName !== primaryDown?.pressName);
  const alerts = [];

  if (primaryDown) {
    alerts.push({
      severity: 'critical',
      title: `${primaryDown.pressName} is down`,
      message: `Hydraulic pressure dropped below threshold. Maintenance team notified for ${primaryDown.pressName}.`,
      createdAt: new Date(timestampBase.getTime() + 17 * 60000).toISOString(),
      isActive: true
    });
  }

  if (secondaryStop && dayIndex % 4 !== 0) {
    alerts.push({
      severity: 'warning',
      title: `Quality hold on ${secondaryStop.pressName}`,
      message: `Three consecutive defects flagged during inspection on ${secondaryStop.pressName}.`,
      createdAt: new Date(timestampBase.getTime() + 33 * 60000).toISOString(),
      isActive: true
    });
  }

  if (dayIndex % 5 === 0) {
    alerts.push({
      severity: 'warning',
      title: 'Material shortage risk',
      message: 'Inbound stock will cover the next 2.5 hours at current rate.',
      createdAt: new Date(timestampBase.getTime() + 49 * 60000).toISOString(),
      isActive: true
    });
  }

  return alerts;
}

function buildOperationalEvents(shiftName, metricDate, metrics, dayIndex, rng) {
  const timestampBase = new Date(metricDate.getTime() + 7 * 60 * 60000);
  const downPress = metrics.find((press) => press.status === 'Down') ?? metrics[4];
  const lowOeePress = [...metrics].sort((a, b) => a.oee - b.oee)[0];
  const result = [];

  result.push({
    shift_name: shiftName,
    metric_date: metricDate.toISOString().slice(0, 10),
    event_time: new Date(timestampBase.getTime() + 11 * 60000).toISOString(),
    event_type: 'downtime',
    severity: downPress.status === 'Down' ? 'critical' : 'warning',
    title: `${downPress.pressName} availability drop`,
    details: `${downPress.pressName} moved to ${downPress.status.toLowerCase()} while handling ${downPress.currentJob}.`,
    machine_name: downPress.pressName,
    entity_type: 'press',
    entity_id: downPress.pressName,
    metric_value: downPress.oee
  });

  result.push({
    shift_name: shiftName,
    metric_date: metricDate.toISOString().slice(0, 10),
    event_time: new Date(timestampBase.getTime() + 28 * 60000).toISOString(),
    event_type: 'quality',
    severity: lowOeePress.oee < 70 ? 'warning' : 'info',
    title: `${lowOeePress.pressName} quality drift`,
    details: `${lowOeePress.pressName} settled at ${lowOeePress.oee.toFixed(1)}% OEE with ${Math.max(1, Math.round((100 - lowOeePress.oee) / 6))} defect checks.`,
    machine_name: lowOeePress.pressName,
    entity_type: 'press',
    entity_id: lowOeePress.pressName,
    metric_value: lowOeePress.oee
  });

  if (dayIndex % 2 === 0 || rng() > 0.45) {
    result.push({
      shift_name: shiftName,
      metric_date: metricDate.toISOString().slice(0, 10),
      event_time: new Date(timestampBase.getTime() + 46 * 60000).toISOString(),
      event_type: 'workforce',
      severity: 'info',
      title: `${shiftName} staffing check`,
      details: `Coverage gap review completed with ${Math.max(0, Math.round((rng() - 0.25) * 3))} open assignment issues.`,
      machine_name: null,
      entity_type: 'shift',
      entity_id: shiftName,
      metric_value: null
    });
  }

  return result;
}

export function generateHistoryRange({ startDate, endDate }) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const snapshots = [];
  const dailyMetrics = [];
  const operationalEvents = [];

  let dayIndex = 0;
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    for (const shiftName of SHIFTS) {
      const rng = createRng(`${shiftName}:${cursor.toISOString().slice(0, 10)}`);
      const base = shiftBase(shiftName);
      const machineStatuses = buildMachineStatuses(shiftName, dayIndex, rng);
      const downtimeMinutes = Math.max(28, Math.round(base.downtime + (rng() - 0.5) * 32 + dayIndex * 0.18));
      const totalOutput = Math.max(14000, Math.round(base.output + Math.sin(dayIndex / 6) * 640 + (rng() - 0.5) * 540));
      const goodParts = Math.max(0, Math.round(totalOutput * (base.goodRate + (rng() - 0.5) * 0.01)));
      const qualityRate = round((goodParts / Math.max(totalOutput, 1)) * 100, 1);
      const overallOee = round(
        clamp(
          base.oee + Math.sin(dayIndex / 8) * 2.2 + (shiftName === 'Shift A' ? 0.5 : -0.4) + (rng() - 0.5) * 2.4,
          58,
          92
        ),
        1
      );
      const activeAlerts = Math.max(2, Math.round(base.alerts + (shiftName === 'Shift A' ? 1 : 0) + (dayIndex % 3 === 0 ? 1 : 0)));
      const criticalAlerts = Math.max(1, Math.round(activeAlerts / 2));
      const warningAlerts = Math.max(1, activeAlerts - criticalAlerts);

      const metricDate = new Date(cursor);
      const daily = {
        shift_name: shiftName,
        metric_date: metricDate.toISOString().slice(0, 10),
        plant_name: base.plantName,
        overall_oee: overallOee,
        total_output: totalOutput,
        good_parts: goodParts,
        downtime_minutes: downtimeMinutes,
        quality_rate: qualityRate,
        active_alerts: activeAlerts,
        critical_alerts: criticalAlerts,
        warning_alerts: warningAlerts,
        machine_statuses: machineStatuses,
        downtime_reasons: buildDowntimeReasons(shiftName, machineStatuses),
        oee_trend: buildTrend(shiftName, dayIndex),
        alerts: buildAlerts(shiftName, metricDate, machineStatuses, dayIndex),
        events: buildOperationalEvents(shiftName, metricDate, machineStatuses, dayIndex, rng)
      };

      snapshots.push({
        shiftName,
        plantName: base.plantName,
        lastUpdated: new Date(metricDate.getTime() + 12 * 60 * 60000).toISOString(),
        overallOee: overallOee,
        totalOutput,
        goodParts,
        downtimeLabel: `${Math.floor(downtimeMinutes / 60)}h ${downtimeMinutes % 60}m`,
        downtimeMinutes,
        activeAlerts,
        criticalAlerts,
        warningAlerts,
        qualityRate
      });

      dailyMetrics.push(daily);
      operationalEvents.push(...daily.events);
    }

    dayIndex += 1;
  }

  return { snapshots, dailyMetrics, operationalEvents };
}

export function generateWorkerTick({ now = Date.now(), shiftName = 'Shift A' } = {}) {
  const currentDate = new Date(now);
  const dayIndex = Math.max(0, Math.floor(now / DAY_MS) % 365);
  const rng = createRng(`${shiftName}:${currentDate.toISOString().slice(0, 10)}:${currentDate.getHours()}`);
  const base = shiftBase(shiftName);
  const machineStatuses = buildMachineStatuses(shiftName, dayIndex, rng);
  const downtimeMinutes = Math.max(24, Math.round(base.downtime + (rng() - 0.5) * 22));
  const totalOutput = Math.max(14000, Math.round(base.output + (rng() - 0.5) * 340));
  const goodParts = Math.max(0, Math.round(totalOutput * (base.goodRate + (rng() - 0.5) * 0.008)));
  const qualityRate = round((goodParts / Math.max(totalOutput, 1)) * 100, 1);
  const overallOee = round(clamp(base.oee + (rng() - 0.5) * 1.8, 58, 94), 1);
  const activeAlerts = Math.max(2, Math.round(base.alerts + (rng() > 0.55 ? 1 : 0)));
  const criticalAlerts = Math.max(1, Math.round(activeAlerts / 2));
  const warningAlerts = Math.max(1, activeAlerts - criticalAlerts);
  const metricDate = new Date(currentDate.toISOString().slice(0, 10));

  const events = buildOperationalEvents(shiftName, metricDate, machineStatuses, dayIndex, rng);
  const alerts = buildAlerts(shiftName, metricDate, machineStatuses, dayIndex);

  return {
    snapshot: {
      shiftName,
      plantName: base.plantName,
      lastUpdated: new Date(now).toISOString(),
      overallOee,
      totalOutput,
      goodParts,
      downtimeLabel: `${Math.floor(downtimeMinutes / 60)}h ${downtimeMinutes % 60}m`,
      downtimeMinutes,
      activeAlerts,
      criticalAlerts,
      warningAlerts,
      qualityRate
    },
    dailyMetric: {
      shift_name: shiftName,
      metric_date: metricDate.toISOString().slice(0, 10),
      plant_name: base.plantName,
      overall_oee: overallOee,
      total_output: totalOutput,
      good_parts: goodParts,
      downtime_minutes: downtimeMinutes,
      quality_rate: qualityRate,
      active_alerts: activeAlerts,
      critical_alerts: criticalAlerts,
      warning_alerts: warningAlerts
    },
    machineStatuses,
    downtimeReasons: buildDowntimeReasons(shiftName, machineStatuses),
    trend: buildTrend(shiftName, dayIndex),
    alerts,
    events
  };
}
