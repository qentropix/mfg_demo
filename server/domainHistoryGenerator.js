import { createRng } from './historyGenerator.js';

const DAY_MS = 86400000;

const ORDER_TEMPLATES = [
  ['WO-AL', 'PN-AL-3842', 'Aluminium Side Bracket', 'Press 01', 1000],
  ['WO-ST', 'PN-ST-1104', 'Steel Hinge Mount', 'Press 04', 650],
  ['WO-CH', 'PN-AL-2201', 'Reinforcement Channel', 'Press 02', 520],
  ['WO-SS', 'PN-SS-3019', 'Latch Support Plate', 'Press 03', 760],
  ['WO-GS', 'PN-AL-4488', 'Corner Gusset', 'Press 06', 580]
];

const MATERIALS = [
  ['MAT-1042', 'Aluminium Billet 6061', 'SUP-001', 'Acero Metals', 500, 85],
  ['MAT-2087', 'Steel Coil C1018', 'SUP-002', 'Precision Tooling Co.', 20, 2.2],
  ['MAT-3114', 'Stainless Fastener Kit', 'SUP-003', 'Northline Fasteners', 40, 6.5],
  ['MAT-4021', 'Polymer Gasket Sheet', 'SUP-004', 'FormCo Polymers', 25, 3.1],
  ['MAT-5144', 'Hydraulic Fluid ISO 46', 'SUP-005', 'HydroFlow Systems', 150, 38],
  ['MAT-6280', 'Powder Coating Black', 'SUP-006', 'PowderPro Finishes', 30, 8]
];

const SUPPLIERS = [
  ['SUP-001', 'Acero Metals', ['MAT-1042'], 14],
  ['SUP-002', 'Precision Tooling Co.', ['MAT-2087'], 21],
  ['SUP-003', 'Northline Fasteners', ['MAT-3114'], 9],
  ['SUP-004', 'FormCo Polymers', ['MAT-4021'], 12],
  ['SUP-005', 'HydroFlow Systems', ['MAT-5144'], 8],
  ['SUP-006', 'PowderPro Finishes', ['MAT-6280'], 16]
];

const EMPLOYEES = [
  ['EMP-1042', 'Sarah Chen', 'Machine Operator', 'Press 05', ['Machine Operation - Press 05', 'Lockout/Tagout (LOTO)']],
  ['EMP-1055', 'Marcus Webb', 'Quality Inspector', 'Press 04', ['Quality Inspection Level 2', 'Root Cause Analysis']],
  ['EMP-1058', 'Alicia Gomez', 'Machine Operator', 'Press 01', ['Machine Operation - Press 01', 'Safety Basics']],
  ['EMP-1061', 'Omar Hassan', 'Machine Operator', 'Press 05', ['Machine Operation - Press 05', 'Preventive Maintenance - Press 05']],
  ['EMP-1064', 'Nina Patel', 'Machine Operator', 'Press 02', ['Machine Operation - Press 02', 'Material Handling']],
  ['EMP-1067', 'Victor Alvarez', 'Maintenance Technician', 'Press 03', ['Preventive Maintenance', 'Hydraulics Level 1']],
  ['EMP-1070', 'Jasmine Lee', 'Machine Operator', 'Press 06', ['Machine Operation - Press 06', 'Quality Inspection Basics']],
  ['EMP-1073', 'Ravi Kumar', 'Metrology Technician', 'Press 04', ['Metrology Basics', 'Gauge Calibration']]
];

const CALIBRATIONS = [
  ['INST-G-041', 'Digital Vernier Gauge', 'Gauge', 'Press 04 QC Station', 90, 'Internal QA'],
  ['INST-T-118', 'Torque Wrench', 'Torque Tool', 'Maintenance Bay 2', 180, 'Metro Calibration'],
  ['INST-P-207', 'Pressure Sensor', 'Sensor', 'Press 05 Hydraulic Unit', 120, 'Internal QA'],
  ['INST-V-088', 'Vision Inspection Camera', 'Vision System', 'QC Cell B', 180, 'VisionTech'],
  ['INST-M-155', 'Micrometer Set', 'Gauge', 'Press Bay', 120, 'Internal QA'],
  ['INST-C-062', 'Coating Thickness Gauge', 'Gauge', 'Paint Line', 180, 'Metro Calibration'],
  ['INST-D-019', 'Digital Thermometer', 'Sensor', 'Heat Treat Cell', 90, 'Internal QA'],
  ['INST-L-230', 'Laser Alignment Tool', 'Alignment Tool', 'Maintenance Bay 1', 365, 'LaserCal']
];

const DEFECTS = [
  ['Dimensional Variance', 'Press 04'],
  ['Surface Finish', 'Press 02'],
  ['Assembly Tolerance', 'Press 01'],
  ['Material Hardness', 'Press 05']
];

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(value, days) {
  return dateKey(new Date(new Date(value).getTime() + days * DAY_MS));
}

function statusFromDaysOfSupply(daysOfSupply) {
  if (daysOfSupply < 3) return 'Critical';
  if (daysOfSupply <= 7) return 'Low';
  return 'OK';
}

function supplierRisk(score) {
  if (score < 65) return 'High';
  if (score < 82) return 'Medium';
  return 'Low';
}

function supplierStatus(score, daysUntilNextAudit) {
  if (score < 58) return 'Suspended';
  if (daysUntilNextAudit < 0 || score < 72) return 'Requalification Due';
  return 'Approved';
}

function calibrationStatus(nextDue, metricDate) {
  const delta = Math.ceil((new Date(nextDue).getTime() - new Date(metricDate).getTime()) / DAY_MS);
  if (delta < 0) return 'Overdue';
  if (delta <= 30) return 'Due Soon';
  return 'Current';
}

function certificationStatus(expiryDate, metricDate) {
  const delta = Math.ceil((new Date(expiryDate).getTime() - new Date(metricDate).getTime()) / DAY_MS);
  if (delta < 0) return 'Expired';
  if (delta <= 30) return 'Expiring Soon';
  return 'Current';
}

function buildOrderHistory(daily, dayIndex, rng) {
  return ORDER_TEMPLATES.map(([prefix, partNumber, partName, machineName, baseQty], index) => {
    const progress = Math.max(0, Math.min(100, 38 + ((dayIndex + index * 11) % 70) + (rng() - 0.5) * 18));
    const status =
      progress >= 96
        ? 'Complete'
        : progress < 48 && index % 2 === 0
          ? 'At Risk'
          : dayIndex % 19 === index
            ? 'Delayed'
            : dayIndex % 7 === index
              ? 'Quality Hold'
              : 'On Track';

    return {
      order_id: `${prefix}-${new Date(daily.metric_date).getFullYear()}${String(dayIndex + 1).padStart(3, '0')}-${daily.shift_name.endsWith('A') ? 'A' : 'B'}`,
      shift_name: daily.shift_name,
      metric_date: daily.metric_date,
      machine_name: machineName,
      part_number: partNumber,
      part_name: partName,
      status,
      qty_ordered: baseQty,
      qty_produced: Math.round(baseQty * progress / 100),
      progress_percent: round(progress, 1),
      due_date: new Date(new Date(daily.metric_date).getTime() + (index + 1) * 3 * 60 * 60000).toISOString(),
      risk_reason: status === 'At Risk' || status === 'Delayed' ? ['Downtime', 'Material shortage', 'Quality hold'][index % 3] : null
    };
  });
}

function buildMaterialHistory(daily, dayIndex, rng) {
  return MATERIALS.map(([code, name, supplierId, supplierName, reorderPoint, usage], index) => {
    const seasonal = Math.sin((dayIndex + index * 3) / 9) * reorderPoint * 2.2;
    const stockQty = Math.max(5, round(reorderPoint * 3.1 + seasonal + (rng() - 0.5) * reorderPoint * 1.4, 1));
    const dailyUsageRate = round(usage * (0.85 + rng() * 0.35), 2);
    const daysOfSupply = round(stockQty / Math.max(dailyUsageRate, 0.1), 1);
    return {
      material_code: code,
      material_name: name,
      shift_name: daily.shift_name,
      metric_date: daily.metric_date,
      supplier_id: supplierId,
      supplier_name: supplierName,
      stock_qty: stockQty,
      reorder_point: reorderPoint,
      daily_usage_rate: dailyUsageRate,
      days_of_supply: daysOfSupply,
      status: statusFromDaysOfSupply(daysOfSupply)
    };
  });
}

function buildWorkforceAndCertificationHistory(daily, dayIndex, rng) {
  const workforce = [];
  const certifications = [];

  for (const [employeeId, employeeName, role, assignedMachine, certNames] of EMPLOYEES) {
    const absenceCycle = (dayIndex + employeeId.charCodeAt(employeeId.length - 1)) % 29;
    const shiftStatus = absenceCycle === 0 ? 'Absent' : absenceCycle === 7 ? 'On Break' : 'Active';
    const assignedPress = daily.machine_statuses?.find((machine) => machine.pressName === assignedMachine);
    workforce.push({
      employee_id: employeeId,
      employee_name: employeeName,
      shift_name: daily.shift_name,
      metric_date: daily.metric_date,
      role,
      assigned_machine: assignedMachine,
      shift_status: shiftStatus,
      coverage_gap: shiftStatus !== 'Active' && assignedPress?.status !== 'Running',
      output_impact: assignedPress ? round(Math.max(0, 88 - assignedPress.oee) * 11, 1) : 0,
      downtime_impact_minutes: assignedPress ? Math.round(assignedPress.downtimeMinutes * (shiftStatus === 'Active' ? 0.12 : 0.45)) : 0
    });

    certNames.forEach((certificationName, index) => {
      const issuedDate = addDays(daily.metric_date, -420 - index * 35);
      const expiryDate = addDays(daily.metric_date, 210 - ((dayIndex + index * 71 + employeeId.length) % 260));
      certifications.push({
        employee_id: employeeId,
        employee_name: employeeName,
        shift_name: daily.shift_name,
        metric_date: daily.metric_date,
        certification_name: certificationName,
        assigned_machine: assignedMachine,
        status: certificationStatus(expiryDate, daily.metric_date),
        issued_date: issuedDate,
        expiry_date: expiryDate,
        days_until_expiry: Math.ceil((new Date(expiryDate).getTime() - new Date(daily.metric_date).getTime()) / DAY_MS)
      });
    });
  }

  return { workforce, certifications };
}

function buildDefects(daily, dayIndex, rng) {
  return DEFECTS.map(([defectType, machineName], index) => {
    const machine = daily.machine_statuses?.find((item) => item.pressName === machineName);
    const oeeLoss = Math.max(0, 82 - Number(machine?.oee ?? 78));
    const defectCount = Math.max(0, Math.round(2 + oeeLoss / 3 + rng() * 6 + (dayIndex % (index + 3) === 0 ? 4 : 0)));
    return {
      shift_name: daily.shift_name,
      metric_date: daily.metric_date,
      machine_name: machineName,
      defect_type: defectType,
      defect_count: defectCount,
      scrap_count: Math.round(defectCount * (0.2 + rng() * 0.25)),
      rework_count: Math.round(defectCount * (0.35 + rng() * 0.3)),
      severity: defectCount >= 10 ? 'Major' : defectCount >= 5 ? 'Minor' : 'Low',
      trend: dayIndex % 11 < 5 ? 'up' : dayIndex % 11 < 8 ? 'stable' : 'down'
    };
  });
}

function buildNcrAndCapaHistory(daily, dayIndex, defects) {
  const ncrs = [];
  const capas = [];

  defects
    .filter((defect) => defect.defect_count >= 8 || (dayIndex + defect.defect_type.length) % 23 === 0)
    .forEach((defect, index) => {
      const idSuffix = `${daily.metric_date.replace(/-/g, '')}-${index + 1}-${daily.shift_name.endsWith('A') ? 'A' : 'B'}`;
      const status = dayIndex % 17 === 0 ? 'Closed' : dayIndex % 5 === 0 ? 'Under Review' : 'Open';
      const ncrId = `NCR-H-${idSuffix}`;
      const capaId = status === 'Closed' && dayIndex % 2 === 0 ? null : `CAPA-H-${idSuffix}`;
      ncrs.push({
        ncr_id: ncrId,
        shift_name: daily.shift_name,
        opened_date: daily.metric_date,
        closed_date: status === 'Closed' ? addDays(daily.metric_date, 4) : null,
        machine_name: defect.machine_name,
        defect_type: defect.defect_type,
        qty_affected: defect.defect_count,
        severity: defect.severity,
        status,
        assigned_to: 'EMP-1055',
        capa_id: capaId,
        description: `${defect.defect_type} detected on ${defect.machine_name} with ${defect.defect_count} affected parts.`
      });

      if (capaId) {
        const dueOffset = dayIndex % 13 === 0 ? -2 : 10 + (dayIndex % 12);
        const capaStatus = dueOffset < 0 ? 'Overdue' : dayIndex % 7 === 0 ? 'Verification' : 'Root Cause Analysis';
        const actionCount = 3 + (dayIndex % 3);
        const completedActionCount = Math.min(actionCount, Math.max(0, Math.round(actionCount * ((dayIndex % 10) / 10))));
        capas.push({
          capa_id: capaId,
          ncr_id: ncrId,
          shift_name: daily.shift_name,
          opened_date: daily.metric_date,
          due_date: addDays(daily.metric_date, dueOffset),
          closed_date: capaStatus === 'Closed' ? addDays(daily.metric_date, 18) : null,
          machine_name: defect.machine_name,
          defect_type: defect.defect_type,
          severity: defect.severity,
          status: capaStatus,
          percent_complete: Math.round((completedActionCount / actionCount) * 100),
          action_count: actionCount,
          completed_action_count: completedActionCount,
          root_cause: dayIndex % 4 === 0 ? 'Tool wear and inspection interval drift' : null
        });
      }
    });

  return { ncrs, capas };
}

function buildCalibrationHistory(dayIndex) {
  const metricDate = null;
  return CALIBRATIONS.map(([assetTag, instrumentName, instrumentType, location, intervalDays, calibratedBy], index) => ({
    assetTag,
    instrumentName,
    instrumentType,
    location,
    intervalDays,
    calibratedBy,
    offset: 20 + ((dayIndex + index * 17) % (intervalDays + 50))
  })).map((item) => item);
}

function buildCalibrationRows(daily, dayIndex) {
  return buildCalibrationHistory(dayIndex).map((item) => {
    const lastCalibrated = addDays(daily.metric_date, -item.offset);
    const nextDue = addDays(lastCalibrated, item.intervalDays);
    return {
      asset_tag: item.assetTag,
      metric_date: daily.metric_date,
      instrument_name: item.instrumentName,
      instrument_type: item.instrumentType,
      location: item.location,
      status: calibrationStatus(nextDue, daily.metric_date),
      last_calibrated: lastCalibrated,
      next_due: nextDue,
      interval_days: item.intervalDays,
      outcome: 'Pass',
      calibrated_by: item.calibratedBy
    };
  });
}

function buildSupplierAudits(metricDate, dayIndex, rng) {
  if (dayIndex % 30 !== 0) return [];
  return SUPPLIERS.map(([supplierId, supplierName, materials, leadTimeDays], index) => {
    const score = round(58 + rng() * 34 - (index === 1 ? 10 : 0) + Math.sin(dayIndex / 40 + index) * 5, 1);
    const daysUntilNextAudit = 180 - ((dayIndex + index * 20) % 240);
    return {
      supplier_id: supplierId,
      supplier_name: supplierName,
      audit_date: metricDate,
      status: supplierStatus(score, daysUntilNextAudit),
      risk_level: supplierRisk(score),
      audit_score: score,
      outcome: score < 58 ? 'Fail' : score < 72 ? 'Conditional Pass' : 'Pass',
      lead_time_days: leadTimeDays,
      materials
    };
  });
}

function buildAnomalies(daily) {
  const anomalies = [];
  const down = daily.machine_statuses?.filter((machine) => machine.status !== 'Running') ?? [];
  const lowest = [...(daily.machine_statuses ?? [])].sort((a, b) => a.oee - b.oee)[0];
  for (const machine of down) {
    anomalies.push({
      anomaly_id: `ANOM-${daily.metric_date}-${daily.shift_name.replace(/\s/g, '')}-${machine.pressName.replace(/\s/g, '')}`,
      shift_name: daily.shift_name,
      metric_date: daily.metric_date,
      machine_name: machine.pressName,
      anomaly_type: 'machine_status',
      severity: machine.status === 'Down' ? 'critical' : 'warning',
      status: 'Active',
      metric_name: 'oee',
      metric_value: machine.oee,
      title: `${machine.pressName} ${machine.status}`,
      recommendation: 'Review downtime reason, operator coverage, and linked quality events.'
    });
  }
  if (lowest && lowest.oee < 72) {
    anomalies.push({
      anomaly_id: `ANOM-${daily.metric_date}-${daily.shift_name.replace(/\s/g, '')}-LOWOEE`,
      shift_name: daily.shift_name,
      metric_date: daily.metric_date,
      machine_name: lowest.pressName,
      anomaly_type: 'low_oee',
      severity: lowest.oee < 65 ? 'critical' : 'warning',
      status: 'Active',
      metric_name: 'oee',
      metric_value: lowest.oee,
      title: `${lowest.pressName} low OEE`,
      recommendation: 'Check recurring downtime and defect patterns before handover.'
    });
  }
  return anomalies;
}

function buildReport(daily) {
  return {
    shift_name: daily.shift_name,
    report_date: daily.metric_date,
    report_type: 'daily_shift',
    summary_text: [
      `${daily.shift_name} on ${daily.metric_date}: ${daily.overall_oee}% OEE, ${daily.total_output} output, ${daily.good_parts} good parts.`,
      `Downtime was ${daily.downtime_minutes} minutes and quality rate was ${daily.quality_rate}%.`,
      `${daily.active_alerts} alert(s), including ${daily.critical_alerts} critical and ${daily.warning_alerts} warning.`
    ].join(' '),
    source_metrics: {
      overallOee: daily.overall_oee,
      totalOutput: daily.total_output,
      goodParts: daily.good_parts,
      downtimeMinutes: daily.downtime_minutes,
      qualityRate: daily.quality_rate,
      activeAlerts: daily.active_alerts
    }
  };
}

export function generateDomainHistory({ dailyMetrics = [] } = {}) {
  const result = {
    orders: [],
    materials: [],
    supplierAudits: [],
    workforce: [],
    certifications: [],
    defects: [],
    ncrs: [],
    capas: [],
    calibrations: [],
    anomalies: [],
    reports: []
  };

  for (const [dayIndex, daily] of dailyMetrics.entries()) {
    const rng = createRng(`domain:${daily.shift_name}:${daily.metric_date}`);
    result.orders.push(...buildOrderHistory(daily, dayIndex, rng));
    result.materials.push(...buildMaterialHistory(daily, dayIndex, rng));
    result.supplierAudits.push(...buildSupplierAudits(daily.metric_date, dayIndex, rng));
    const people = buildWorkforceAndCertificationHistory(daily, dayIndex, rng);
    result.workforce.push(...people.workforce);
    result.certifications.push(...people.certifications);
    const defects = buildDefects(daily, dayIndex, rng);
    result.defects.push(...defects);
    const qualityActions = buildNcrAndCapaHistory(daily, dayIndex, defects);
    result.ncrs.push(...qualityActions.ncrs);
    result.capas.push(...qualityActions.capas);
    result.calibrations.push(...buildCalibrationRows(daily, dayIndex));
    result.anomalies.push(...buildAnomalies(daily));
    result.reports.push(buildReport(daily));
  }

  return result;
}
