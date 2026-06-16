const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const now = Date.now();
const hoursAgo = (hours) => now - hours * MS_PER_HOUR;
const hoursFromNow = (hours) => now + hours * MS_PER_HOUR;
const daysAgo = (days) => now - days * MS_PER_DAY;
const daysFromNow = (days) => now + days * MS_PER_DAY;

const baseTrend = [
  { label: 'Sun', value: 68.1 },
  { label: 'Mon', value: 71.2 },
  { label: 'Tue', value: 74.8 },
  { label: 'Wed', value: 72.3 },
  { label: 'Thu', value: 76.1 },
  { label: 'Fri', value: 77.9 },
  { label: 'Today', value: 78.6 }
];

function buildTrend(baseValue, waveOffset) {
  return Array.from({ length: 5 }, (_, k) => {
    const tick = k - 2;
    const wave = Math.sin((tick + waveOffset) * 1.3);
    return parseFloat(Math.max(0, Math.min(100, baseValue + wave * 2.5)).toFixed(1));
  });
}

function withTrend(presses, waveOffset) {
  return presses.map((press, i) => ({
    ...press,
    trend: buildTrend(press.oee, waveOffset + i * 0.17)
  }));
}

function deriveMaterialStatus(stockQty, dailyUsageRate) {
  const daysOfSupply = stockQty / dailyUsageRate;
  if (daysOfSupply < 3) return 'Critical';
  if (daysOfSupply <= 7) return 'Low';
  return 'OK';
}

function createMaterial(code, name, unit, stockQty, reorderPoint, reorderQty, dailyUsageRate) {
  const daysOfSupply = parseFloat((stockQty / dailyUsageRate).toFixed(1));
  return {
    code,
    name,
    unit,
    stockQty,
    reorderPoint,
    reorderQty,
    dailyUsageRate,
    daysOfSupply,
    status: deriveMaterialStatus(stockQty, dailyUsageRate)
  };
}

function createCalibration({
  assetTag,
  name,
  type,
  location,
  intervalDays,
  lastCalibratedOffsetDays,
  certNumber,
  calibratedBy,
  measured,
  tolerance,
  outcome
}) {
  const lastCalibrated = daysAgo(lastCalibratedOffsetDays);
  const nextDue = lastCalibrated + intervalDays * MS_PER_DAY;
  const daysUntilDue = (nextDue - now) / MS_PER_DAY;
  const status = daysUntilDue < 0 ? 'Overdue' : daysUntilDue <= 30 ? 'Due Soon' : 'Current';

  return {
    assetTag,
    name,
    type,
    location,
    intervalDays,
    lastCalibrated,
    nextDue,
    certNumber,
    calibratedBy,
    results: {
      measured,
      tolerance,
      outcome
    },
    status
  };
}

function createSupplier({
  id,
  name,
  materials,
  contactName,
  email,
  phone,
  leadTimeDays,
  lastDeliveryStatus,
  riskLevel,
  auditScore,
  qualifiedOffsetDays,
  nextRequalOffsetDays,
  status,
  auditHistory
}) {
  return {
    id,
    name,
    materials,
    contact: {
      name: contactName,
      email,
      phone
    },
    leadTimeDays,
    lastDeliveryStatus,
    riskLevel,
    auditScore,
    qualifiedDate: daysAgo(qualifiedOffsetDays),
    nextRequalDate: daysFromNow(nextRequalOffsetDays),
    status,
    auditHistory: auditHistory.map((entry) => ({
      ...entry,
      date: daysAgo(entry.offsetDays)
    }))
  };
}

function createEmployee({
  id,
  name,
  role,
  assignedMachine,
  shiftStatus,
  certifications
}) {
  return {
    id,
    name,
    role,
    assignedMachine,
    shiftStatus,
    certifications: certifications.map((cert) => ({
      ...cert,
      issuedDate: cert.issuedOffsetDays !== undefined ? daysAgo(cert.issuedOffsetDays) : cert.issuedDate,
      expiryDate: cert.expiryOffsetDays !== undefined ? daysFromNow(cert.expiryOffsetDays) : cert.expiryDate
    }))
  };
}

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
    targetOutput: 1000,
    orders: [
      {
        id: 'WO-2047',
        partNumber: 'PN-AL-3842',
        partName: 'Aluminium Side Bracket',
        machineAssigned: 'Press 01',
        qtyOrdered: 1000,
        qtyProduced: 847,
        dueDate: hoursFromNow(4),
        status: 'On Track'
      },
      {
        id: 'WO-2048',
        partNumber: 'PN-ST-1104',
        partName: 'Steel Hinge Mount',
        machineAssigned: 'Press 04',
        qtyOrdered: 600,
        qtyProduced: 201,
        dueDate: hoursFromNow(1),
        status: 'At Risk'
      },
      {
        id: 'WO-2049',
        partNumber: 'PN-AL-2201',
        partName: 'Reinforcement Channel',
        machineAssigned: 'Press 02',
        qtyOrdered: 450,
        qtyProduced: 447,
        dueDate: hoursAgo(2),
        status: 'Delayed'
      },
      {
        id: 'WO-2050',
        partNumber: 'PN-SS-3019',
        partName: 'Latch Support Plate',
        machineAssigned: 'Press 03',
        qtyOrdered: 720,
        qtyProduced: 0,
        dueDate: hoursFromNow(10),
        status: 'Queued'
      },
      {
        id: 'WO-2051',
        partNumber: 'PN-AL-4488',
        partName: 'Corner Gusset',
        machineAssigned: 'Press 06',
        qtyOrdered: 520,
        qtyProduced: 0,
        dueDate: hoursFromNow(12),
        status: 'Queued'
      }
    ],
    materials: [
      createMaterial('MAT-1042', 'Aluminium Billet 6061', 'kg', 180, 500, 1000, 85),
      createMaterial('MAT-2087', 'Steel Coil C1018', 'rolls', 12, 20, 50, 2.2),
      createMaterial('MAT-3114', 'Stainless Fastener Kit', 'kits', 90, 40, 120, 6.5),
      createMaterial('MAT-4021', 'Polymer Gasket Sheet', 'sheets', 32, 25, 100, 3.1),
      createMaterial('MAT-5144', 'Hydraulic Fluid ISO 46', 'liters', 420, 150, 600, 38),
      createMaterial('MAT-6280', 'Powder Coating Black', 'kg', 75, 30, 200, 8)
    ],
    presses: [
      { pressName: 'Press 01', status: 'Running', oee: 85, outputCount: 3246, downtimeMinutes: 18, currentJob: 'Auto Door Panels' },
      { pressName: 'Press 02', status: 'Running', oee: 82, outputCount: 3012, downtimeMinutes: 22, currentJob: 'Side Frame Batch' },
      { pressName: 'Press 03', status: 'Running', oee: 75, outputCount: 2789, downtimeMinutes: 35, currentJob: 'Hinge Mount Kits' },
      { pressName: 'Press 04', status: 'Minor Stop', oee: 60, outputCount: 2105, downtimeMinutes: 62, currentJob: 'Reinforcement Brackets' },
      { pressName: 'Press 05', status: 'Down', oee: 0, outputCount: 0, downtimeMinutes: 14, currentJob: 'Tool Change Queue' },
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
    defects: [
      { type: 'Dimensional Variance', count: 14, trend: 'up' },
      { type: 'Surface Finish', count: 8, trend: 'down' },
      { type: 'Assembly Tolerance', count: 5, trend: 'stable' },
      { type: 'Material Hardness', count: 3, trend: 'up' }
    ],
    prevShiftDefects: [
      { type: 'Dimensional Variance', count: 9 },
      { type: 'Surface Finish', count: 11 },
      { type: 'Assembly Tolerance', count: 5 },
      { type: 'Material Hardness', count: 1 }
    ],
    ncrs: [
      {
        id: 'NCR-2024-0042',
        date: hoursAgo(2),
        machine: 'Press 04',
        defectType: 'Dimensional Variance',
        qtyAffected: 14,
        status: 'Under Review',
        assignedTo: 'EMP-1055',
        capaId: 'CAPA-2024-0018',
        description: 'Dimensional variance outside tolerance on PN-AL-3842 run'
      },
      {
        id: 'NCR-2024-0041',
        date: hoursAgo(5),
        machine: 'Press 02',
        defectType: 'Surface Finish',
        qtyAffected: 6,
        status: 'Open',
        assignedTo: 'EMP-1055',
        capaId: 'CAPA-2024-0021',
        description: 'Surface finish variation detected on batch transition'
      },
      {
        id: 'NCR-2024-0039',
        date: daysAgo(3),
        machine: 'Press 01',
        defectType: 'Assembly Tolerance',
        qtyAffected: 3,
        status: 'Closed',
        assignedTo: 'EMP-1055',
        capaId: 'CAPA-2024-0016',
        description: 'Assembly tolerance drift after die change'
      }
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
    targetOutput: 850,
    orders: [
      {
        id: 'WO-3047',
        partNumber: 'PN-AL-3842',
        partName: 'Aluminium Side Bracket',
        machineAssigned: 'Press 01',
        qtyOrdered: 900,
        qtyProduced: 785,
        dueDate: hoursFromNow(3),
        status: 'On Track'
      },
      {
        id: 'WO-3048',
        partNumber: 'PN-ST-1104',
        partName: 'Steel Hinge Mount',
        machineAssigned: 'Press 04',
        qtyOrdered: 540,
        qtyProduced: 190,
        dueDate: hoursFromNow(2),
        status: 'At Risk'
      },
      {
        id: 'WO-3049',
        partNumber: 'PN-AL-2201',
        partName: 'Reinforcement Channel',
        machineAssigned: 'Press 02',
        qtyOrdered: 500,
        qtyProduced: 410,
        dueDate: hoursAgo(1),
        status: 'Delayed'
      },
      {
        id: 'WO-3050',
        partNumber: 'PN-SS-3019',
        partName: 'Latch Support Plate',
        machineAssigned: 'Press 03',
        qtyOrdered: 640,
        qtyProduced: 0,
        dueDate: hoursFromNow(9),
        status: 'Queued'
      },
      {
        id: 'WO-3051',
        partNumber: 'PN-AL-4488',
        partName: 'Corner Gusset',
        machineAssigned: 'Press 06',
        qtyOrdered: 500,
        qtyProduced: 0,
        dueDate: hoursFromNow(11),
        status: 'Queued'
      }
    ],
    materials: [
      createMaterial('MAT-1042', 'Aluminium Billet 6061', 'kg', 210, 500, 1000, 85),
      createMaterial('MAT-2087', 'Steel Coil C1018', 'rolls', 14, 20, 50, 2.3),
      createMaterial('MAT-3114', 'Stainless Fastener Kit', 'kits', 95, 40, 120, 6.8),
      createMaterial('MAT-4021', 'Polymer Gasket Sheet', 'sheets', 38, 25, 100, 3.2),
      createMaterial('MAT-5144', 'Hydraulic Fluid ISO 46', 'liters', 390, 150, 600, 36),
      createMaterial('MAT-6280', 'Powder Coating Black', 'kg', 82, 30, 200, 7.5)
    ],
    presses: [
      { pressName: 'Press 01', status: 'Running', oee: 81, outputCount: 2988, downtimeMinutes: 19, currentJob: 'Auto Door Panels' },
      { pressName: 'Press 02', status: 'Running', oee: 79, outputCount: 2840, downtimeMinutes: 23, currentJob: 'Side Frame Batch' },
      { pressName: 'Press 03', status: 'Minor Stop', oee: 68, outputCount: 2514, downtimeMinutes: 41, currentJob: 'Hinge Mount Kits' },
      { pressName: 'Press 04', status: 'Running', oee: 72, outputCount: 2652, downtimeMinutes: 29, currentJob: 'Reinforcement Brackets' },
      { pressName: 'Press 05', status: 'Down', oee: 0, outputCount: 0, downtimeMinutes: 88, currentJob: 'Maintenance Hold' },
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
    defects: [
      { type: 'Dimensional Variance', count: 10, trend: 'stable' },
      { type: 'Surface Finish', count: 12, trend: 'up' },
      { type: 'Assembly Tolerance', count: 4, trend: 'down' },
      { type: 'Material Hardness', count: 2, trend: 'stable' }
    ],
    prevShiftDefects: [
      { type: 'Dimensional Variance', count: 11 },
      { type: 'Surface Finish', count: 10 },
      { type: 'Assembly Tolerance', count: 6 },
      { type: 'Material Hardness', count: 2 }
    ],
    ncrs: [
      {
        id: 'NCR-2024-0052',
        date: hoursAgo(1),
        machine: 'Press 03',
        defectType: 'Surface Finish',
        qtyAffected: 12,
        status: 'Open',
        assignedTo: 'EMP-1055',
        capaId: 'CAPA-2024-0020',
        description: 'Surface finish interruption during changeover'
      },
      {
        id: 'NCR-2024-0051',
        date: hoursAgo(4),
        machine: 'Press 05',
        defectType: 'Material Hardness',
        qtyAffected: 7,
        status: 'Under Review',
        assignedTo: 'EMP-1042',
        capaId: null,
        description: 'Hardness drift while the press was in maintenance hold'
      },
      {
        id: 'NCR-2024-0049',
        date: daysAgo(2),
        machine: 'Press 01',
        defectType: 'Assembly Tolerance',
        qtyAffected: 5,
        status: 'Closed',
        assignedTo: 'EMP-1055',
        capaId: 'CAPA-2024-0019',
        description: 'Assembly tolerance variation resolved after inspection update'
      }
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

export const suppliers = [
  createSupplier({
    id: 'SUP-001',
    name: 'Acero Metals',
    materials: ['MAT-1042'],
    contactName: 'James Rivera',
    email: 'j.rivera@acerometals.com',
    phone: '416-555-0182',
    leadTimeDays: 14,
    lastDeliveryStatus: 'Delayed',
    riskLevel: 'High',
    auditScore: 71,
    qualifiedOffsetDays: 180,
    nextRequalOffsetDays: -60,
    status: 'Requalification Due',
    auditHistory: [
      { offsetDays: 180, type: 'On-site', score: 71, outcome: 'Pass' },
      { offsetDays: 365, type: 'On-site', score: 78, outcome: 'Pass' },
      { offsetDays: 550, type: 'Remote', score: 82, outcome: 'Pass' }
    ]
  }),
  createSupplier({
    id: 'SUP-002',
    name: 'Precision Tooling Co.',
    materials: ['MAT-2087'],
    contactName: 'Lauren Mills',
    email: 'l.mills@precisiontooling.co',
    phone: '416-555-0144',
    leadTimeDays: 21,
    lastDeliveryStatus: 'On Time',
    riskLevel: 'High',
    auditScore: 54,
    qualifiedOffsetDays: 220,
    nextRequalOffsetDays: -12,
    status: 'Suspended',
    auditHistory: [
      { offsetDays: 220, type: 'On-site', score: 54, outcome: 'Conditional Pass' },
      { offsetDays: 400, type: 'Remote', score: 61, outcome: 'Pass' },
      { offsetDays: 560, type: 'On-site', score: 67, outcome: 'Pass' }
    ]
  }),
  createSupplier({
    id: 'SUP-003',
    name: 'Northline Fasteners',
    materials: ['MAT-3114'],
    contactName: 'Priya Singh',
    email: 'p.singh@northlinefasteners.com',
    phone: '416-555-0127',
    leadTimeDays: 9,
    lastDeliveryStatus: 'On Time',
    riskLevel: 'Low',
    auditScore: 88,
    qualifiedOffsetDays: 120,
    nextRequalOffsetDays: 45,
    status: 'Approved',
    auditHistory: [
      { offsetDays: 120, type: 'On-site', score: 88, outcome: 'Pass' },
      { offsetDays: 300, type: 'Remote', score: 84, outcome: 'Pass' },
      { offsetDays: 480, type: 'On-site', score: 86, outcome: 'Pass' }
    ]
  }),
  createSupplier({
    id: 'SUP-004',
    name: 'FormCo Polymers',
    materials: ['MAT-4021'],
    contactName: 'Derek Huang',
    email: 'd.huang@formcopolymers.com',
    phone: '416-555-0191',
    leadTimeDays: 12,
    lastDeliveryStatus: 'Delayed',
    riskLevel: 'Medium',
    auditScore: 79,
    qualifiedOffsetDays: 150,
    nextRequalOffsetDays: 14,
    status: 'Approved',
    auditHistory: [
      { offsetDays: 150, type: 'Remote', score: 79, outcome: 'Pass' },
      { offsetDays: 320, type: 'On-site', score: 76, outcome: 'Pass' },
      { offsetDays: 510, type: 'Remote', score: 80, outcome: 'Pass' }
    ]
  }),
  createSupplier({
    id: 'SUP-005',
    name: 'HydroFlow Systems',
    materials: ['MAT-5144'],
    contactName: 'Amira Patel',
    email: 'a.patel@hydroflowsystems.com',
    phone: '416-555-0138',
    leadTimeDays: 18,
    lastDeliveryStatus: 'On Time',
    riskLevel: 'Medium',
    auditScore: 83,
    qualifiedOffsetDays: 90,
    nextRequalOffsetDays: 180,
    status: 'Approved',
    auditHistory: [
      { offsetDays: 90, type: 'On-site', score: 83, outcome: 'Pass' },
      { offsetDays: 270, type: 'Remote', score: 81, outcome: 'Pass' },
      { offsetDays: 450, type: 'On-site', score: 80, outcome: 'Pass' }
    ]
  }),
  createSupplier({
    id: 'SUP-006',
    name: 'PowderPro Finishes',
    materials: ['MAT-6280'],
    contactName: 'Elena Rossi',
    email: 'e.rossi@powderprofinishes.com',
    phone: '416-555-0176',
    leadTimeDays: 16,
    lastDeliveryStatus: 'Delayed',
    riskLevel: 'High',
    auditScore: 62,
    qualifiedOffsetDays: 260,
    nextRequalOffsetDays: -5,
    status: 'Requalification Due',
    auditHistory: [
      { offsetDays: 260, type: 'On-site', score: 62, outcome: 'Conditional Pass' },
      { offsetDays: 430, type: 'Remote', score: 68, outcome: 'Pass' },
      { offsetDays: 600, type: 'On-site', score: 70, outcome: 'Pass' }
    ]
  })
];

export const employees = [
  createEmployee({
    id: 'EMP-1042',
    name: 'Sarah Chen',
    role: 'Machine Operator',
    assignedMachine: 'Press 05',
    shiftStatus: 'Absent',
    certifications: [
      {
        name: 'Machine Operation - Press 05',
        issuedOffsetDays: 400,
        expiryOffsetDays: -14,
        status: 'Expired'
      },
      {
        name: 'Lockout/Tagout (LOTO)',
        issuedOffsetDays: 200,
        expiryOffsetDays: 165,
        status: 'Current'
      }
    ]
  }),
  createEmployee({
    id: 'EMP-1055',
    name: 'Marcus Webb',
    role: 'Quality Inspector',
    assignedMachine: 'Press 04',
    shiftStatus: 'Active',
    certifications: [
      {
        name: 'Quality Inspection Level 2',
        issuedOffsetDays: 180,
        expiryOffsetDays: 25,
        status: 'Expiring Soon'
      },
      {
        name: 'Root Cause Analysis',
        issuedOffsetDays: 210,
        expiryOffsetDays: 240,
        status: 'Current'
      }
    ]
  }),
  createEmployee({
    id: 'EMP-1058',
    name: 'Alicia Gomez',
    role: 'Machine Operator',
    assignedMachine: 'Press 01',
    shiftStatus: 'Active',
    certifications: [
      {
        name: 'Machine Operation - Press 01',
        issuedOffsetDays: 120,
        expiryOffsetDays: 250,
        status: 'Current'
      },
      {
        name: 'Forklift Safety',
        issuedOffsetDays: 150,
        expiryOffsetDays: 120,
        status: 'Current'
      }
    ]
  }),
  createEmployee({
    id: 'EMP-1061',
    name: 'Omar Hassan',
    role: 'Maintenance Technician',
    assignedMachine: 'Press 05',
    shiftStatus: 'Active',
    certifications: [
      {
        name: 'Preventive Maintenance - Press 05',
        issuedOffsetDays: 160,
        expiryOffsetDays: 20,
        status: 'Expiring Soon'
      },
      {
        name: 'Electrical Safety',
        issuedOffsetDays: 220,
        expiryOffsetDays: 300,
        status: 'Current'
      }
    ]
  }),
  createEmployee({
    id: 'EMP-1064',
    name: 'Nina Patel',
    role: 'Shift Supervisor',
    assignedMachine: 'Press 02',
    shiftStatus: 'Active',
    certifications: [
      {
        name: 'Supervisor Safety Leadership',
        issuedOffsetDays: 90,
        expiryOffsetDays: 365,
        status: 'Current'
      },
      {
        name: 'Machine Operation - Press 02',
        issuedOffsetDays: 160,
        expiryOffsetDays: 90,
        status: 'Current'
      }
    ]
  }),
  createEmployee({
    id: 'EMP-1067',
    name: 'Victor Alvarez',
    role: 'Machine Operator',
    assignedMachine: 'Press 03',
    shiftStatus: 'Off Duty',
    certifications: [
      {
        name: 'Machine Operation - Press 03',
        issuedOffsetDays: 240,
        expiryOffsetDays: 45,
        status: 'Current'
      },
      {
        name: 'Quality Inspection Basics',
        issuedOffsetDays: 260,
        expiryOffsetDays: 5,
        status: 'Expiring Soon'
      }
    ]
  }),
  createEmployee({
    id: 'EMP-1070',
    name: 'Jasmine Lee',
    role: 'Maintenance Technician',
    assignedMachine: 'Press 06',
    shiftStatus: 'Active',
    certifications: [
      {
        name: 'Machine Operation - Press 06',
        issuedOffsetDays: 100,
        expiryOffsetDays: 180,
        status: 'Current'
      },
      {
        name: 'Hydraulics Service',
        issuedOffsetDays: 140,
        expiryOffsetDays: 75,
        status: 'Current'
      }
    ]
  }),
  createEmployee({
    id: 'EMP-1074',
    name: 'Ravi Kumar',
    role: 'Quality Inspector',
    assignedMachine: 'Press 04',
    shiftStatus: 'Active',
    certifications: [
      {
        name: 'Quality Inspection Level 1',
        issuedOffsetDays: 80,
        expiryOffsetDays: 120,
        status: 'Current'
      },
      {
        name: 'Metrology Basics',
        issuedOffsetDays: 110,
        expiryOffsetDays: 30,
        status: 'Expiring Soon'
      }
    ]
  })
];

export const capas = [
  {
    id: 'CAPA-2024-0018',
    ncrId: 'NCR-2024-0042',
    machine: 'Press 04',
    defectType: 'Dimensional Variance',
    source: 'NCR-2024-0042',
    issueDescription: 'Recurring dimensional variance on Press 04 - 3rd occurrence this month',
    severity: 'Major',
    assignedTo: 'EMP-1055',
    openedDate: hoursAgo(2),
    dueDate: daysFromNow(3),
    status: 'Root Cause Analysis',
    percentComplete: 35,
    rootCause: null,
    actions: [
      { id: 1, description: 'Inspect tooling on Press 04 for wear', owner: 'EMP-1042', dueDate: daysFromNow(1), completed: true },
      { id: 2, description: 'Reduce inspection interval for PN-AL-3842', owner: 'EMP-1055', dueDate: daysFromNow(3), completed: false },
      { id: 3, description: 'Update tooling change schedule in maintenance system', owner: 'EMP-1055', dueDate: daysFromNow(5), completed: false }
    ],
    stageHistory: [
      { stage: 'Open', timestamp: hoursAgo(2) },
      { stage: 'Root Cause Analysis', timestamp: hoursAgo(1) }
    ]
  },
  {
    id: 'CAPA-2024-0016',
    ncrId: 'NCR-2024-0039',
    machine: 'Press 01',
    defectType: 'Assembly Tolerance',
    source: 'NCR-2024-0039',
    issueDescription: 'Historical assembly tolerance variation on Press 01',
    severity: 'Minor',
    assignedTo: 'EMP-1055',
    openedDate: daysAgo(4),
    dueDate: daysAgo(1),
    status: 'Overdue',
    percentComplete: 10,
    rootCause: 'Tool alignment drift during prior maintenance cycle',
    actions: [
      { id: 1, description: 'Review torque logs from the last three batches', owner: 'EMP-1055', dueDate: daysAgo(1), completed: false },
      { id: 2, description: 'Verify gauge repeatability on Press 01', owner: 'EMP-1074', dueDate: daysFromNow(1), completed: false }
    ],
    stageHistory: [
      { stage: 'Open', timestamp: daysAgo(4) }
    ]
  },
  {
    id: 'CAPA-2024-0021',
    ncrId: 'NCR-2024-0041',
    machine: 'Press 02',
    defectType: 'Surface Finish',
    source: 'NCR-2024-0041',
    issueDescription: 'Open CAPA awaiting triage for the latest surface finish NCR',
    severity: 'Minor',
    assignedTo: 'EMP-1055',
    openedDate: hoursAgo(5),
    dueDate: daysFromNow(2),
    status: 'Open',
    percentComplete: 5,
    rootCause: null,
    actions: [
      { id: 1, description: 'Collect surface finish samples from Press 02', owner: 'EMP-1055', dueDate: daysFromNow(1), completed: false },
      { id: 2, description: 'Review tooling settings from last changeover', owner: 'EMP-1061', dueDate: daysFromNow(2), completed: false }
    ],
    stageHistory: [
      { stage: 'Open', timestamp: hoursAgo(5) }
    ]
  },
  {
    id: 'CAPA-2024-0019',
    ncrId: 'NCR-2024-0049',
    machine: 'Press 01',
    defectType: 'Assembly Tolerance',
    source: 'NCR-2024-0049',
    issueDescription: 'Closed CAPA for resolved assembly tolerance issue',
    severity: 'Minor',
    assignedTo: 'EMP-1055',
    openedDate: daysAgo(10),
    dueDate: daysAgo(2),
    status: 'Closed',
    percentComplete: 100,
    rootCause: 'Die wear corrected after maintenance intervention',
    actions: [
      { id: 1, description: 'Replace worn die components', owner: 'EMP-1061', dueDate: daysAgo(6), completed: true },
      { id: 2, description: 'Confirm post-maintenance samples meet tolerance', owner: 'EMP-1055', dueDate: daysAgo(3), completed: true }
    ],
    stageHistory: [
      { stage: 'Open', timestamp: daysAgo(10) },
      { stage: 'Root Cause Analysis', timestamp: daysAgo(8) },
      { stage: 'Action Pending', timestamp: daysAgo(6) },
      { stage: 'Verification', timestamp: daysAgo(4) },
      { stage: 'Closed', timestamp: daysAgo(2) }
    ]
  },
  {
    id: 'CAPA-2024-0020',
    ncrId: 'NCR-2024-0052',
    machine: 'Press 03',
    defectType: 'Surface Finish',
    source: 'NCR-2024-0052',
    issueDescription: 'In-progress CAPA for surface finish defect on Press 03',
    severity: 'Major',
    assignedTo: 'EMP-1055',
    openedDate: hoursAgo(4),
    dueDate: hoursAgo(1),
    status: 'Verification',
    percentComplete: 78,
    rootCause: 'Tooling contamination after extended changeover',
    actions: [
      { id: 1, description: 'Inspect and clean feed tooling', owner: 'EMP-1061', dueDate: hoursAgo(3), completed: true },
      { id: 2, description: 'Validate finish on next three runs', owner: 'EMP-1055', dueDate: hoursFromNow(4), completed: true },
      { id: 3, description: 'Release hold after QA verification', owner: 'EMP-1055', dueDate: hoursFromNow(6), completed: false }
    ],
    stageHistory: [
      { stage: 'Open', timestamp: hoursAgo(4) },
      { stage: 'Root Cause Analysis', timestamp: hoursAgo(3) },
      { stage: 'Action Pending', timestamp: hoursAgo(2) },
      { stage: 'Verification', timestamp: hoursAgo(1) }
    ]
  }
];

export const calibrations = [
  createCalibration({
    assetTag: 'INST-G-041',
    name: 'Digital Vernier Gauge',
    type: 'Gauge',
    location: 'Press 04 QC Station',
    intervalDays: 90,
    lastCalibratedOffsetDays: 115,
    certNumber: 'CAL-2024-0312',
    calibratedBy: 'Internal QA',
    measured: '25.03mm',
    tolerance: '±0.02mm',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-T-118',
    name: 'Torque Wrench',
    type: 'Torque Tool',
    location: 'Maintenance Bay 2',
    intervalDays: 180,
    lastCalibratedOffsetDays: 150,
    certNumber: 'CAL-2024-0344',
    calibratedBy: 'Metro Calibration',
    measured: '48.9Nm',
    tolerance: '±0.5Nm',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-P-207',
    name: 'Pressure Sensor',
    type: 'Sensor',
    location: 'Press 05 Hydraulic Unit',
    intervalDays: 120,
    lastCalibratedOffsetDays: 95,
    certNumber: 'CAL-2024-0359',
    calibratedBy: 'Internal QA',
    measured: '3.12bar',
    tolerance: '±0.04bar',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-V-088',
    name: 'Vision Inspection Camera',
    type: 'Vision System',
    location: 'QC Cell B',
    intervalDays: 90,
    lastCalibratedOffsetDays: 40,
    certNumber: 'CAL-2024-0368',
    calibratedBy: 'OptiCal Services',
    measured: '1.02px',
    tolerance: '±0.03px',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-M-512',
    name: 'Micrometer Set',
    type: 'Micrometer',
    location: 'Metrology Lab',
    intervalDays: 365,
    lastCalibratedOffsetDays: 200,
    certNumber: 'CAL-2024-0372',
    calibratedBy: 'Internal QA',
    measured: '10.00mm',
    tolerance: '±0.01mm',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-T-221',
    name: 'Digital Thermometer',
    type: 'Thermometer',
    location: 'Warehouse QA',
    intervalDays: 180,
    lastCalibratedOffsetDays: 170,
    certNumber: 'CAL-2024-0375',
    calibratedBy: 'ThermoCheck',
    measured: '22.1C',
    tolerance: '±0.2C',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-C-014',
    name: 'Coating Thickness Gauge',
    type: 'Gauge',
    location: 'Finishing Line',
    intervalDays: 90,
    lastCalibratedOffsetDays: 25,
    certNumber: 'CAL-2024-0377',
    calibratedBy: 'OptiCal Services',
    measured: '82um',
    tolerance: '±3um',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-S-109',
    name: 'Stopwatch Timer',
    type: 'Timer',
    location: 'Line Audit Desk',
    intervalDays: 365,
    lastCalibratedOffsetDays: 330,
    certNumber: 'CAL-2024-0381',
    calibratedBy: 'Internal QA',
    measured: '00:00.01',
    tolerance: '±0.05s',
    outcome: 'Pass'
  }),
  createCalibration({
    assetTag: 'INST-L-301',
    name: 'Laser Alignment Tool',
    type: 'Alignment',
    location: 'Press 01 Setup Area',
    intervalDays: 180,
    lastCalibratedOffsetDays: 10,
    certNumber: 'CAL-2024-0387',
    calibratedBy: 'LaserCal',
    measured: '0.03mm',
    tolerance: '±0.05mm',
    outcome: 'Pass'
  })
];

export function getBaseDemoDashboard(shiftName = 'Shift A') {
  return JSON.parse(JSON.stringify(demoByShift[shiftName] ?? demoByShift['Shift A']));
}

export function getDemoDashboard(shiftName = 'Shift A') {
  const base = demoByShift[shiftName] ?? demoByShift['Shift A'];
  const copy = JSON.parse(JSON.stringify(base));

  const tick = Math.floor(Date.now() / 45000);

  copy.presses = withTrend(copy.presses, tick * 0.11).map((press, i) => {
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
