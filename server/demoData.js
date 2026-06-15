const baseTrend = [
  { label: 'Sun', value: 68.1 },
  { label: 'Mon', value: 71.2 },
  { label: 'Tue', value: 74.8 },
  { label: 'Wed', value: 72.3 },
  { label: 'Thu', value: 76.1 },
  { label: 'Fri', value: 77.9 },
  { label: 'Today', value: 78.6 }
];

const demoByShift = {
  'Shift A': {
    shiftName: 'Shift A',
    plantName: 'Plant 1',
    lastUpdated: '09:41:30 AM',
    overallOee: 81.5,
    totalOutput: 21476,
    goodParts: 19938,
    downtimeLabel: '1h 41m',
    downtimeMinutes: 101,
    activeAlerts: 2,
    criticalAlerts: 0,
    warningAlerts: 2,
    qualityRate: 93,
    presses: [
      { pressName: 'Press 01', status: 'Running', oee: 85, outputCount: 3246, downtimeMinutes: 18, currentJob: 'Auto Door Panels' },
      { pressName: 'Press 02', status: 'Running', oee: 82, outputCount: 3012, downtimeMinutes: 22, currentJob: 'Side Frame Batch' },
      { pressName: 'Press 03', status: 'Running', oee: 75, outputCount: 2789, downtimeMinutes: 35, currentJob: 'Hinge Mount Kits' },
      { pressName: 'Press 04', status: 'Minor Stop', oee: 60, outputCount: 2105, downtimeMinutes: 62, currentJob: 'Reinforcement Brackets' },
      { pressName: 'Press 05', status: 'Running', oee: 79, outputCount: 2934, downtimeMinutes: 14, currentJob: 'Tool Change Queue' },
      { pressName: 'Press 06', status: 'Running', oee: 88, outputCount: 3890, downtimeMinutes: 12, currentJob: 'Latch Assembly' }
    ],
    downtime: [
      { reason: 'Tool Change', minutes: 135, percent: 37.7 },
      { reason: 'Material Shortage', minutes: 70, percent: 19.6 },
      { reason: 'Setup', minutes: 45, percent: 12.6 },
      { reason: 'Breakdown', minutes: 30, percent: 8.4 },
      { reason: 'Quality Hold', minutes: 22, percent: 6.1 },
      { reason: 'Operator Delay', minutes: 18, percent: 5.0 },
      { reason: 'Other', minutes: 16, percent: 4.5 }
    ],
    oeeTrend: baseTrend,
    alerts: [
      { severity: 'warning', title: 'Material shortage risk', message: 'Inbound coil stock will cover the next 2.5 hours at current rate.', createdAt: '08:32 AM' },
      { severity: 'warning', title: 'Operator delay elevated', message: 'Handover delay was 9 minutes above target during shift transition.', createdAt: '08:06 AM' }
    ]
  },
  'Shift B': {
    shiftName: 'Shift B',
    plantName: 'Plant 1',
    lastUpdated: '09:41:30 PM',
    overallOee: 77.0,
    totalOutput: 20415,
    goodParts: 18985,
    downtimeLabel: '2h 04m',
    downtimeMinutes: 124,
    activeAlerts: 2,
    criticalAlerts: 0,
    warningAlerts: 2,
    qualityRate: 92.9,
    presses: [
      { pressName: 'Press 01', status: 'Running', oee: 81, outputCount: 2988, downtimeMinutes: 19, currentJob: 'Auto Door Panels' },
      { pressName: 'Press 02', status: 'Running', oee: 79, outputCount: 2840, downtimeMinutes: 23, currentJob: 'Side Frame Batch' },
      { pressName: 'Press 03', status: 'Minor Stop', oee: 68, outputCount: 2514, downtimeMinutes: 41, currentJob: 'Hinge Mount Kits' },
      { pressName: 'Press 04', status: 'Running', oee: 72, outputCount: 2652, downtimeMinutes: 29, currentJob: 'Reinforcement Brackets' },
      { pressName: 'Press 05', status: 'Running', oee: 76, outputCount: 2712, downtimeMinutes: 16, currentJob: 'Maintenance Hold' },
      { pressName: 'Press 06', status: 'Running', oee: 86, outputCount: 3421, downtimeMinutes: 15, currentJob: 'Latch Assembly' }
    ],
    downtime: [
      { reason: 'Tool Change', minutes: 148, percent: 35.5 },
      { reason: 'Material Shortage', minutes: 76, percent: 18.2 },
      { reason: 'Setup', minutes: 52, percent: 12.5 },
      { reason: 'Breakdown', minutes: 34, percent: 8.2 },
      { reason: 'Quality Hold', minutes: 24, percent: 5.8 },
      { reason: 'Operator Delay', minutes: 20, percent: 4.8 },
      { reason: 'Other', minutes: 18, percent: 4.3 }
    ],
    oeeTrend: [
      { label: 'Sun', value: 66.9 },
      { label: 'Mon', value: 69.4 },
      { label: 'Tue', value: 70.8 },
      { label: 'Wed', value: 71.1 },
      { label: 'Thu', value: 73.2 },
      { label: 'Fri', value: 73.9 },
      { label: 'Today', value: 74.2 }
    ],
    alerts: [
      { severity: 'warning', title: 'Setup variance detected', message: 'Press 03 setup time exceeded standard by 11 minutes.', createdAt: '08:44 PM' },
      { severity: 'warning', title: 'Material staging late', message: 'Feed material arrived after planned window.', createdAt: '07:58 PM' }
    ]
  }
};

export function getBaseDemoDashboard(shiftName = 'Shift A') {
  return JSON.parse(JSON.stringify(demoByShift[shiftName] ?? demoByShift['Shift A']));
}

export function getDemoDashboard(shiftName = 'Shift A') {
  const base = demoByShift[shiftName] ?? demoByShift['Shift A'];
  const copy = JSON.parse(JSON.stringify(base));

  const tick = Math.floor(Date.now() / 45000);

  copy.presses = copy.presses.map((press, i) => {
    if (press.status !== 'Running') return press;
    const wave = Math.sin(tick * 1.3 + i * 1.07);
    return {
      ...press,
      oee: parseFloat(Math.min(99, Math.max(52, press.oee + wave * 2.5)).toFixed(1)),
      outputCount: Math.round(press.outputCount + wave * 80)
    };
  });

  const runningOees = copy.presses
    .filter((p) => p.status === 'Running')
    .map((p) => p.oee);

  if (runningOees.length) {
    copy.overallOee = parseFloat(
      (runningOees.reduce((a, b) => a + b, 0) / runningOees.length).toFixed(1)
    );
  }

  copy.lastUpdated = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });

  return copy;
}

export function getShiftOptions() {
  return Object.keys(demoByShift);
}
