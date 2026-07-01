import { pool } from './db.js';
import {
  capas as demoCapas,
  calibrations as demoCalibrations,
  employees as demoEmployees,
  getBaseDemoDashboard,
  getShiftOptions,
  suppliers as demoSuppliers
} from './demoData.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function db(target = pool) {
  if (!target) {
    throw new Error('DATABASE_URL is not configured');
  }
  return target;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toEpoch(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function deriveMaterialStatus(stockQty, dailyUsageRate) {
  const daysOfSupply = Number(stockQty) / Math.max(Number(dailyUsageRate), 0.1);
  if (daysOfSupply < 3) return 'Critical';
  if (daysOfSupply <= 7) return 'Low';
  return 'OK';
}

function deriveCalibrationStatus(nextDue) {
  const nextDueMs = toEpoch(nextDue);
  if (!nextDueMs) return 'Current';
  const daysUntilDue = (nextDueMs - Date.now()) / DAY_MS;
  if (daysUntilDue < 0) return 'Overdue';
  if (daysUntilDue <= 30) return 'Due Soon';
  return 'Current';
}

function mapOrder(row) {
  return {
    id: row.order_id,
    shiftName: row.shift_name,
    partNumber: row.part_number,
    partName: row.part_name,
    machineAssigned: row.machine_assigned,
    qtyOrdered: Number(row.qty_ordered),
    qtyProduced: Number(row.qty_produced),
    dueDate: toEpoch(row.due_date),
    status: row.status
  };
}

function mapMaterial(row) {
  return {
    code: row.material_code,
    shiftName: row.shift_name,
    name: row.material_name,
    unit: row.unit,
    stockQty: Number(row.stock_qty),
    reorderPoint: Number(row.reorder_point),
    reorderQty: Number(row.reorder_qty),
    dailyUsageRate: Number(row.daily_usage_rate),
    daysOfSupply: Number(row.days_of_supply),
    status: row.status
  };
}

function mapSupplier(row, audits = []) {
  return {
    id: row.supplier_id,
    name: row.supplier_name,
    materials: row.materials ?? [],
    contact: row.contact ?? {},
    leadTimeDays: Number(row.lead_time_days),
    lastDeliveryStatus: row.last_delivery_status,
    riskLevel: row.risk_level,
    auditScore: Number(row.audit_score),
    qualifiedDate: toEpoch(row.qualified_date),
    nextRequalDate: toEpoch(row.next_requal_date),
    status: row.status,
    auditHistory: audits.map((entry) => ({
      date: toEpoch(entry.audit_date),
      type: entry.audit_type,
      score: entry.score === null ? null : Number(entry.score),
      outcome: entry.outcome,
      note: entry.note
    }))
  };
}

function mapEmployee(row, certifications = []) {
  return {
    id: row.employee_id,
    name: row.employee_name,
    shiftName: row.shift_name,
    role: row.role,
    assignedMachine: row.assigned_machine,
    shiftStatus: row.shift_status,
    certifications: certifications.map((cert) => ({
      name: cert.certification_name,
      issuedDate: toEpoch(cert.issued_date),
      expiryDate: toEpoch(cert.expiry_date),
      issuedBy: cert.issued_by,
      status: cert.status
    }))
  };
}

function mapDefect(row) {
  return {
    type: row.defect_type,
    count: Number(row.defect_count),
    trend: row.trend,
    period: row.period
  };
}

function mapNcr(row) {
  return {
    id: row.ncr_id,
    shiftName: row.shift_name,
    date: toEpoch(row.opened_at),
    machine: row.machine_name,
    defectType: row.defect_type,
    qtyAffected: Number(row.qty_affected),
    status: row.status,
    assignedTo: row.assigned_to,
    capaId: row.capa_id,
    description: row.description,
    severity: row.severity
  };
}

function mapCapa(row, actions = [], stageHistory = []) {
  return {
    id: row.capa_id,
    shiftName: row.shift_name,
    ncrId: row.ncr_id,
    machine: row.machine_name,
    defectType: row.defect_type,
    source: row.source,
    issueDescription: row.issue_description,
    severity: row.severity,
    assignedTo: row.assigned_to,
    openedDate: toEpoch(row.opened_at),
    dueDate: toEpoch(row.due_at),
    closedAt: toEpoch(row.closed_at),
    status: row.status,
    percentComplete: Number(row.percent_complete),
    rootCause: row.root_cause,
    actions: actions.map((action) => ({
      id: Number(action.action_id),
      description: action.description,
      owner: action.owner,
      dueDate: toEpoch(action.due_at),
      completed: Boolean(action.completed)
    })),
    stageHistory: stageHistory.map((entry) => ({
      stage: entry.stage,
      timestamp: toEpoch(entry.stage_at)
    }))
  };
}

function mapCalibration(row) {
  return {
    assetTag: row.asset_tag,
    name: row.instrument_name,
    type: row.instrument_type,
    location: row.location,
    intervalDays: Number(row.interval_days),
    lastCalibrated: toEpoch(row.last_calibrated),
    nextDue: toEpoch(row.next_due),
    certNumber: row.cert_number,
    calibratedBy: row.calibrated_by,
    results: {
      measured: row.result_measured,
      tolerance: row.result_tolerance,
      outcome: row.result_outcome
    },
    status: row.status,
    lastScheduledAt: toEpoch(row.scheduled_at),
    scheduledProvider: row.scheduled_provider,
    scheduledType: row.scheduled_type
  };
}

export async function listOrders(shiftName = 'Shift A', clientOrPool = pool) {
  const result = await db(clientOrPool).query(
    `select order_id, shift_name, part_number, part_name, machine_assigned, qty_ordered,
            qty_produced, due_date, status
     from production_orders
     where shift_name = $1
     order by order_id asc`,
    [shiftName]
  );
  return result.rows.map(mapOrder);
}

export async function updateOrder(orderId, shiftName = 'Shift A', updates = {}, clientOrPool = pool) {
  const columnMap = {
    partNumber: 'part_number',
    partName: 'part_name',
    machineAssigned: 'machine_assigned',
    qtyOrdered: 'qty_ordered',
    qtyProduced: 'qty_produced',
    dueDate: 'due_date',
    status: 'status'
  };
  const entries = Object.entries(updates)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], key === 'dueDate' ? toIso(value) : value]);
  if (!entries.length) throw new Error('No supported order fields were provided.');

  const setSql = entries.map(([column], index) => `${column} = $${index + 3}`).join(', ');
  const values = [shiftName, orderId, ...entries.map(([, value]) => value)];
  const result = await db(clientOrPool).query(
    `update production_orders
     set ${setSql}, updated_at = now()
     where shift_name = $1 and order_id = $2
     returning order_id, shift_name, part_number, part_name, machine_assigned, qty_ordered,
               qty_produced, due_date, status`,
    values
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

export async function listMaterials(shiftName = 'Shift A', clientOrPool = pool) {
  const result = await db(clientOrPool).query(
    `select material_code, shift_name, material_name, unit, stock_qty, reorder_point,
            reorder_qty, daily_usage_rate, days_of_supply, status
     from material_inventory_current
     where shift_name = $1
     order by material_code asc`,
    [shiftName]
  );
  return result.rows.map(mapMaterial);
}

export async function updateMaterial(materialCode, shiftName = 'Shift A', updates = {}, clientOrPool = pool) {
  const current = await db(clientOrPool).query(
    `select stock_qty, daily_usage_rate from material_inventory_current where shift_name = $1 and material_code = $2`,
    [shiftName, materialCode]
  );
  if (!current.rowCount) return null;

  const row = current.rows[0];
  const stockQty = updates.stockQty !== undefined ? Number(updates.stockQty) : Number(row.stock_qty);
  const dailyUsageRate = updates.dailyUsageRate !== undefined ? Number(updates.dailyUsageRate) : Number(row.daily_usage_rate);
  const daysOfSupply = Number((stockQty / Math.max(dailyUsageRate, 0.1)).toFixed(1));
  const status = updates.status ?? deriveMaterialStatus(stockQty, dailyUsageRate);
  const result = await db(clientOrPool).query(
    `update material_inventory_current
     set material_name = coalesce($3, material_name),
         unit = coalesce($4, unit),
         stock_qty = coalesce($5, stock_qty),
         reorder_point = coalesce($6, reorder_point),
         reorder_qty = coalesce($7, reorder_qty),
         daily_usage_rate = coalesce($8, daily_usage_rate),
         days_of_supply = $9,
         status = $10,
         updated_at = now()
     where shift_name = $1 and material_code = $2
     returning material_code, shift_name, material_name, unit, stock_qty, reorder_point,
               reorder_qty, daily_usage_rate, days_of_supply, status`,
    [
      shiftName,
      materialCode,
      updates.name,
      updates.unit,
      updates.stockQty,
      updates.reorderPoint,
      updates.reorderQty,
      updates.dailyUsageRate,
      daysOfSupply,
      status
    ]
  );
  return result.rows[0] ? mapMaterial(result.rows[0]) : null;
}

export async function listSuppliers(clientOrPool = pool) {
  const target = db(clientOrPool);
  const supplierResult = await target.query(
    `select supplier_id, supplier_name, materials, contact, lead_time_days, last_delivery_status,
            risk_level, audit_score, qualified_date, next_requal_date, status
     from supplier_records
     order by supplier_id asc`
  );
  const auditResult = await target.query(
    `select supplier_id, audit_date, audit_type, score, outcome, note
     from supplier_audit_records
     order by audit_date desc`
  );
  const auditsBySupplier = new Map();
  for (const audit of auditResult.rows) {
    const current = auditsBySupplier.get(audit.supplier_id) ?? [];
    current.push(audit);
    auditsBySupplier.set(audit.supplier_id, current);
  }
  return supplierResult.rows.map((row) => mapSupplier(row, auditsBySupplier.get(row.supplier_id) ?? []));
}

export async function updateSupplier(supplierId, updates = {}, clientOrPool = pool) {
  const columnMap = {
    name: 'supplier_name',
    materials: 'materials',
    contact: 'contact',
    leadTimeDays: 'lead_time_days',
    lastDeliveryStatus: 'last_delivery_status',
    riskLevel: 'risk_level',
    auditScore: 'audit_score',
    qualifiedDate: 'qualified_date',
    nextRequalDate: 'next_requal_date',
    status: 'status'
  };
  const entries = Object.entries(updates)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => {
      if (key === 'materials' || key === 'contact') return [columnMap[key], JSON.stringify(value), 'jsonb'];
      if (key === 'qualifiedDate' || key === 'nextRequalDate') return [columnMap[key], toIso(value), 'date'];
      return [columnMap[key], value, 'value'];
    });
  if (!entries.length) throw new Error('No supported supplier fields were provided.');

  const setSql = entries.map(([column], index) => `${column} = $${index + 2}${entries[index][2] === 'jsonb' ? '::jsonb' : ''}`).join(', ');
  const result = await db(clientOrPool).query(
    `update supplier_records
     set ${setSql}, updated_at = now()
     where supplier_id = $1
     returning supplier_id, supplier_name, materials, contact, lead_time_days, last_delivery_status,
               risk_level, audit_score, qualified_date, next_requal_date, status`,
    [supplierId, ...entries.map(([, value]) => value)]
  );
  if (!result.rows[0]) return null;
  const audits = await db(clientOrPool).query(
    `select supplier_id, audit_date, audit_type, score, outcome, note
     from supplier_audit_records
     where supplier_id = $1
     order by audit_date desc`,
    [supplierId]
  );
  return mapSupplier(result.rows[0], audits.rows);
}

export async function scheduleSupplierAudit(supplierId, { scheduledDate, notes = '', type = 'Scheduled' } = {}, clientOrPool = pool) {
  const auditDate = toIso(scheduledDate);
  if (!auditDate) throw new Error('scheduledDate is required.');
  const result = await db(clientOrPool).query(
    `insert into supplier_audit_records (supplier_id, audit_date, audit_type, score, outcome, note)
     values ($1, $2, $3, null, $4, $5)
     returning supplier_id, audit_date, audit_type, score, outcome, note`,
    [supplierId, auditDate, type, notes ? `Pending - ${notes}` : 'Pending', notes]
  );
  return result.rows[0];
}

export async function listEmployees(shiftName = 'Shift A', clientOrPool = pool) {
  const target = db(clientOrPool);
  const employeeResult = await target.query(
    `select shift_name, employee_id, employee_name, role, assigned_machine, shift_status
     from workforce_roster_current
     where shift_name = $1
     order by employee_id asc`,
    [shiftName]
  );
  const certResult = await target.query(
    `select shift_name, employee_id, certification_name, issued_date, expiry_date, issued_by, status
     from employee_certification_records
     where shift_name = $1
     order by employee_id asc, certification_name asc`,
    [shiftName]
  );
  const certsByEmployee = new Map();
  for (const cert of certResult.rows) {
    const current = certsByEmployee.get(cert.employee_id) ?? [];
    current.push(cert);
    certsByEmployee.set(cert.employee_id, current);
  }
  return employeeResult.rows.map((row) => mapEmployee(row, certsByEmployee.get(row.employee_id) ?? []));
}

export async function updateEmployee(employeeId, shiftName = 'Shift A', updates = {}, clientOrPool = pool) {
  const columnMap = {
    name: 'employee_name',
    role: 'role',
    assignedMachine: 'assigned_machine',
    shiftStatus: 'shift_status'
  };
  const entries = Object.entries(updates).filter(([key, value]) => columnMap[key] && value !== undefined);
  if (!entries.length) throw new Error('No supported employee fields were provided.');
  const setSql = entries.map(([key], index) => `${columnMap[key]} = $${index + 3}`).join(', ');
  const result = await db(clientOrPool).query(
    `update workforce_roster_current
     set ${setSql}, updated_at = now()
     where shift_name = $1 and employee_id = $2
     returning shift_name, employee_id, employee_name, role, assigned_machine, shift_status`,
    [shiftName, employeeId, ...entries.map(([, value]) => value)]
  );
  if (!result.rows[0]) return null;
  const employees = await listEmployees(shiftName, clientOrPool);
  return employees.find((employee) => employee.id === employeeId) ?? null;
}

export async function logEmployeeCertification(employeeId, shiftName = 'Shift A', cert = {}, clientOrPool = pool) {
  if (!cert.name) throw new Error('certification name is required.');
  await db(clientOrPool).query(
    `insert into employee_certification_records (
       shift_name, employee_id, certification_name, issued_date, expiry_date, issued_by, status, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (shift_name, employee_id, certification_name) do update set
       issued_date = excluded.issued_date,
       expiry_date = excluded.expiry_date,
       issued_by = excluded.issued_by,
       status = excluded.status,
       updated_at = now()`,
    [
      shiftName,
      employeeId,
      cert.name,
      toIso(cert.issuedDate),
      toIso(cert.expiryDate),
      cert.issuedBy ?? 'Internal QA',
      cert.status ?? 'Current'
    ]
  );
  const employees = await listEmployees(shiftName, clientOrPool);
  return employees.find((employee) => employee.id === employeeId) ?? null;
}

export async function listDefects(shiftName = 'Shift A', period = 'current', clientOrPool = pool) {
  const result = await db(clientOrPool).query(
    `select shift_name, defect_type, defect_count, trend, period
     from quality_defects_current
     where shift_name = $1 and period = $2
     order by defect_count desc`,
    [shiftName, period]
  );
  return result.rows.map(mapDefect);
}

export async function upsertDefect(shiftName = 'Shift A', defect = {}, clientOrPool = pool) {
  if (!defect.type) throw new Error('defect type is required.');
  const result = await db(clientOrPool).query(
    `insert into quality_defects_current (shift_name, defect_type, defect_count, trend, period, updated_at)
     values ($1, $2, $3, $4, coalesce($5, 'current'), now())
     on conflict (shift_name, defect_type, period) do update set
       defect_count = excluded.defect_count,
       trend = excluded.trend,
       updated_at = now()
     returning shift_name, defect_type, defect_count, trend, period`,
    [shiftName, defect.type, defect.count ?? 0, defect.trend ?? 'stable', defect.period ?? 'current']
  );
  return mapDefect(result.rows[0]);
}

export async function listNcrs(shiftName = 'Shift A', clientOrPool = pool) {
  const result = await db(clientOrPool).query(
    `select ncr_id, shift_name, opened_at, machine_name, defect_type, qty_affected,
            status, assigned_to, capa_id, description, severity
     from ncr_records
     where shift_name = $1
     order by opened_at desc`,
    [shiftName]
  );
  return result.rows.map(mapNcr);
}

export async function createNcr(shiftName = 'Shift A', ncr = {}, clientOrPool = pool) {
  const result = await db(clientOrPool).query(
    `insert into ncr_records (
       ncr_id, shift_name, opened_at, machine_name, defect_type, qty_affected, status,
       assigned_to, capa_id, description, severity, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     on conflict (shift_name, ncr_id) do update set
       opened_at = excluded.opened_at,
       machine_name = excluded.machine_name,
       defect_type = excluded.defect_type,
       qty_affected = excluded.qty_affected,
       status = excluded.status,
       assigned_to = excluded.assigned_to,
       capa_id = excluded.capa_id,
       description = excluded.description,
       severity = excluded.severity,
       updated_at = now()
     returning ncr_id, shift_name, opened_at, machine_name, defect_type, qty_affected,
               status, assigned_to, capa_id, description, severity`,
    [
      ncr.id,
      shiftName,
      toIso(ncr.date ?? Date.now()),
      ncr.machine,
      ncr.defectType,
      Number(ncr.qtyAffected),
      ncr.status ?? 'Open',
      ncr.assignedTo ?? 'EMP-1055',
      ncr.capaId ?? null,
      ncr.description,
      ncr.severity ?? 'Medium'
    ]
  );
  return mapNcr(result.rows[0]);
}

export async function updateNcr(shiftName = 'Shift A', ncrId, updates = {}, clientOrPool = pool) {
  const columnMap = {
    date: 'opened_at',
    machine: 'machine_name',
    defectType: 'defect_type',
    qtyAffected: 'qty_affected',
    status: 'status',
    assignedTo: 'assigned_to',
    capaId: 'capa_id',
    description: 'description',
    severity: 'severity'
  };
  const entries = Object.entries(updates)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], key === 'date' ? toIso(value) : value]);
  if (!entries.length) throw new Error('No supported NCR fields were provided.');
  const setSql = entries.map(([column], index) => `${column} = $${index + 3}`).join(', ');
  const result = await db(clientOrPool).query(
    `update ncr_records
     set ${setSql}, updated_at = now()
     where shift_name = $1 and ncr_id = $2
     returning ncr_id, shift_name, opened_at, machine_name, defect_type, qty_affected,
               status, assigned_to, capa_id, description, severity`,
    [shiftName, ncrId, ...entries.map(([, value]) => value)]
  );
  return result.rows[0] ? mapNcr(result.rows[0]) : null;
}

export async function replaceNcrs(shiftName = 'Shift A', ncrs = [], clientOrPool = pool) {
  const target = db(clientOrPool);
  await target.query('delete from ncr_records where shift_name = $1', [shiftName]);
  for (const ncr of ncrs) {
    await createNcr(shiftName, ncr, target);
  }
  return listNcrs(shiftName, target);
}

export async function listCapas(clientOrPool = pool) {
  const target = db(clientOrPool);
  const capaResult = await target.query(
    `select capa_id, shift_name, ncr_id, machine_name, defect_type, source, issue_description,
            severity, assigned_to, opened_at, due_at, closed_at, status, percent_complete, root_cause
     from capa_records
     order by opened_at desc`
  );
  const actionResult = await target.query(
    `select capa_id, action_id, description, owner, due_at, completed
     from capa_actions
     order by capa_id asc, action_id asc`
  );
  const stageResult = await target.query(
    `select capa_id, stage, stage_at
     from capa_stage_history
     order by capa_id asc, stage_at asc`
  );
  const actionsByCapa = new Map();
  for (const action of actionResult.rows) {
    const current = actionsByCapa.get(action.capa_id) ?? [];
    current.push(action);
    actionsByCapa.set(action.capa_id, current);
  }
  const stagesByCapa = new Map();
  for (const stage of stageResult.rows) {
    const current = stagesByCapa.get(stage.capa_id) ?? [];
    current.push(stage);
    stagesByCapa.set(stage.capa_id, current);
  }
  return capaResult.rows.map((row) => mapCapa(row, actionsByCapa.get(row.capa_id) ?? [], stagesByCapa.get(row.capa_id) ?? []));
}

async function replaceCapaChildren(capaId, actions = [], stageHistory = [], clientOrPool = pool) {
  const target = db(clientOrPool);
  await target.query('delete from capa_actions where capa_id = $1', [capaId]);
  for (const action of actions) {
    await target.query(
      `insert into capa_actions (capa_id, action_id, description, owner, due_at, completed)
       values ($1, $2, $3, $4, $5, $6)`,
      [capaId, action.id, action.description, action.owner, toIso(action.dueDate), Boolean(action.completed)]
    );
  }
  await target.query('delete from capa_stage_history where capa_id = $1', [capaId]);
  for (const entry of stageHistory) {
    await target.query(
      `insert into capa_stage_history (capa_id, stage, stage_at)
       values ($1, $2, $3)`,
      [capaId, entry.stage, toIso(entry.timestamp)]
    );
  }
}

export async function createCapa(capa = {}, clientOrPool = pool) {
  const result = await db(clientOrPool).query(
    `insert into capa_records (
       capa_id, shift_name, ncr_id, machine_name, defect_type, source, issue_description,
       severity, assigned_to, opened_at, due_at, closed_at, status, percent_complete, root_cause, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
     on conflict (capa_id) do update set
       shift_name = excluded.shift_name,
       ncr_id = excluded.ncr_id,
       machine_name = excluded.machine_name,
       defect_type = excluded.defect_type,
       source = excluded.source,
       issue_description = excluded.issue_description,
       severity = excluded.severity,
       assigned_to = excluded.assigned_to,
       opened_at = excluded.opened_at,
       due_at = excluded.due_at,
       closed_at = excluded.closed_at,
       status = excluded.status,
       percent_complete = excluded.percent_complete,
       root_cause = excluded.root_cause,
       updated_at = now()
     returning capa_id, shift_name, ncr_id, machine_name, defect_type, source, issue_description,
               severity, assigned_to, opened_at, due_at, closed_at, status, percent_complete, root_cause`,
    [
      capa.id,
      capa.shiftName ?? 'Shift A',
      capa.ncrId,
      capa.machine,
      capa.defectType,
      capa.source ?? capa.ncrId,
      capa.issueDescription,
      capa.severity ?? 'Minor',
      capa.assignedTo ?? 'EMP-1055',
      toIso(capa.openedDate ?? Date.now()),
      toIso(capa.dueDate ?? Date.now() + 7 * DAY_MS),
      toIso(capa.closedAt ?? null),
      capa.status ?? 'Open',
      Number(capa.percentComplete ?? 0),
      capa.rootCause ?? null
    ]
  );
  await replaceCapaChildren(capa.id, capa.actions ?? [], capa.stageHistory ?? [{ stage: 'Open', timestamp: capa.openedDate ?? Date.now() }], clientOrPool);
  const capas = await listCapas(clientOrPool);
  return capas.find((item) => item.id === capa.id) ?? mapCapa(result.rows[0]);
}

export async function updateCapa(capaId, updates = {}, clientOrPool = pool) {
  const existing = (await listCapas(clientOrPool)).find((capa) => capa.id === capaId);
  if (!existing) return null;
  const next = { ...existing, ...updates, id: capaId };
  return createCapa(next, clientOrPool);
}

export async function replaceCapas(capas = [], clientOrPool = pool) {
  const target = db(clientOrPool);
  await target.query('delete from capa_stage_history');
  await target.query('delete from capa_actions');
  await target.query('delete from capa_records');
  for (const capa of capas) {
    await createCapa(capa, target);
  }
  return listCapas(target);
}

export async function listCalibrations(clientOrPool = pool) {
  const result = await db(clientOrPool).query(
    `select asset_tag, instrument_name, instrument_type, location, interval_days, last_calibrated,
            next_due, cert_number, calibrated_by, result_measured, result_tolerance, result_outcome,
            status, scheduled_at, scheduled_provider, scheduled_type
     from calibration_records
     order by asset_tag asc`
  );
  return result.rows.map(mapCalibration);
}

export async function upsertCalibration(instrument = {}, clientOrPool = pool) {
  if (!instrument.assetTag) throw new Error('assetTag is required.');
  const nextDue = instrument.nextDue ?? (toEpoch(instrument.lastCalibrated) + Number(instrument.intervalDays ?? 90) * DAY_MS);
  const status = instrument.status ?? deriveCalibrationStatus(nextDue);
  const result = await db(clientOrPool).query(
    `insert into calibration_records (
       asset_tag, instrument_name, instrument_type, location, interval_days, last_calibrated,
       next_due, cert_number, calibrated_by, result_measured, result_tolerance, result_outcome,
       status, scheduled_at, scheduled_provider, scheduled_type, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
     on conflict (asset_tag) do update set
       instrument_name = excluded.instrument_name,
       instrument_type = excluded.instrument_type,
       location = excluded.location,
       interval_days = excluded.interval_days,
       last_calibrated = excluded.last_calibrated,
       next_due = excluded.next_due,
       cert_number = excluded.cert_number,
       calibrated_by = excluded.calibrated_by,
       result_measured = excluded.result_measured,
       result_tolerance = excluded.result_tolerance,
       result_outcome = excluded.result_outcome,
       status = excluded.status,
       scheduled_at = excluded.scheduled_at,
       scheduled_provider = excluded.scheduled_provider,
       scheduled_type = excluded.scheduled_type,
       updated_at = now()
     returning asset_tag, instrument_name, instrument_type, location, interval_days, last_calibrated,
               next_due, cert_number, calibrated_by, result_measured, result_tolerance, result_outcome,
               status, scheduled_at, scheduled_provider, scheduled_type`,
    [
      instrument.assetTag,
      instrument.name,
      instrument.type,
      instrument.location,
      Number(instrument.intervalDays),
      toIso(instrument.lastCalibrated),
      toIso(nextDue),
      instrument.certNumber ?? instrument.assetTag,
      instrument.calibratedBy ?? 'Internal QA',
      instrument.results?.measured ?? '',
      instrument.results?.tolerance ?? '',
      instrument.results?.outcome ?? 'Pass',
      status,
      toIso(instrument.lastScheduledAt ?? instrument.scheduledAt ?? null),
      instrument.scheduledProvider ?? null,
      instrument.scheduledType ?? null
    ]
  );
  return mapCalibration(result.rows[0]);
}

export async function updateCalibration(assetTag, updates = {}, clientOrPool = pool) {
  const current = (await listCalibrations(clientOrPool)).find((instrument) => instrument.assetTag === assetTag);
  if (!current) return null;
  return upsertCalibration({ ...current, ...updates, assetTag }, clientOrPool);
}

export async function loadCurrentDomainPayload(shiftName = 'Shift A', clientOrPool = pool) {
  const orders = await listOrders(shiftName, clientOrPool);
  const materials = await listMaterials(shiftName, clientOrPool);
  const suppliers = await listSuppliers(clientOrPool);
  const employees = await listEmployees(shiftName, clientOrPool);
  const defects = await listDefects(shiftName, 'current', clientOrPool);
  const prevShiftDefects = await listDefects(shiftName, 'previous', clientOrPool);
  const ncrs = await listNcrs(shiftName, clientOrPool);
  const capas = await listCapas(clientOrPool);
  const calibrations = await listCalibrations(clientOrPool);

  return {
    orders,
    materials,
    suppliers,
    employees,
    defects,
    prevShiftDefects,
    ncrs,
    capas,
    calibrations
  };
}

async function seedOrders(target, shiftName, orders) {
  for (const order of orders) {
    await target.query(
      `insert into production_orders (
         order_id, shift_name, part_number, part_name, machine_assigned, qty_ordered,
         qty_produced, due_date, status, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       on conflict (shift_name, order_id) do update set
         part_number = excluded.part_number,
         part_name = excluded.part_name,
         machine_assigned = excluded.machine_assigned,
         qty_ordered = excluded.qty_ordered,
         qty_produced = excluded.qty_produced,
         due_date = excluded.due_date,
         status = excluded.status,
         updated_at = now()`,
      [order.id, shiftName, order.partNumber, order.partName, order.machineAssigned, order.qtyOrdered, order.qtyProduced, toIso(order.dueDate), order.status]
    );
  }
}

async function seedMaterials(target, shiftName, materials) {
  for (const material of materials) {
    await target.query(
      `insert into material_inventory_current (
         material_code, shift_name, material_name, unit, stock_qty, reorder_point,
         reorder_qty, daily_usage_rate, days_of_supply, status, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       on conflict (shift_name, material_code) do update set
         material_name = excluded.material_name,
         unit = excluded.unit,
         stock_qty = excluded.stock_qty,
         reorder_point = excluded.reorder_point,
         reorder_qty = excluded.reorder_qty,
         daily_usage_rate = excluded.daily_usage_rate,
         days_of_supply = excluded.days_of_supply,
         status = excluded.status,
         updated_at = now()`,
      [
        material.code,
        shiftName,
        material.name,
        material.unit,
        material.stockQty,
        material.reorderPoint,
        material.reorderQty,
        material.dailyUsageRate,
        material.daysOfSupply,
        material.status
      ]
    );
  }
}

async function seedDefects(target, shiftName, defects, period) {
  for (const defect of defects) {
    await target.query(
      `insert into quality_defects_current (shift_name, defect_type, defect_count, trend, period, updated_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (shift_name, defect_type, period) do update set
         defect_count = excluded.defect_count,
         trend = excluded.trend,
         updated_at = now()`,
      [shiftName, defect.type, defect.count, defect.trend ?? 'stable', period]
    );
  }
}

async function seedNcrs(target, shiftName, ncrs) {
  for (const ncr of ncrs) {
    await createNcr(shiftName, ncr, target);
  }
}

async function seedEmployees(target, shiftName, employees) {
  for (const employee of employees) {
    await target.query(
      `insert into workforce_roster_current (
         shift_name, employee_id, employee_name, role, assigned_machine, shift_status, updated_at
       ) values ($1,$2,$3,$4,$5,$6,now())
       on conflict (shift_name, employee_id) do update set
         employee_name = excluded.employee_name,
         role = excluded.role,
         assigned_machine = excluded.assigned_machine,
         shift_status = excluded.shift_status,
         updated_at = now()`,
      [shiftName, employee.id, employee.name, employee.role, employee.assignedMachine, employee.shiftStatus]
    );
    for (const cert of employee.certifications ?? []) {
      await logEmployeeCertification(employee.id, shiftName, cert, target);
    }
  }
}

async function seedSuppliers(target) {
  await target.query('delete from supplier_audit_records');
  await target.query('delete from supplier_records');
  for (const supplier of demoSuppliers) {
    await target.query(
      `insert into supplier_records (
         supplier_id, supplier_name, materials, contact, lead_time_days, last_delivery_status,
         risk_level, audit_score, qualified_date, next_requal_date, status, updated_at
       ) values ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,now())`,
      [
        supplier.id,
        supplier.name,
        JSON.stringify(supplier.materials ?? []),
        JSON.stringify(supplier.contact ?? {}),
        supplier.leadTimeDays,
        supplier.lastDeliveryStatus,
        supplier.riskLevel,
        supplier.auditScore,
        toIso(supplier.qualifiedDate),
        toIso(supplier.nextRequalDate),
        supplier.status
      ]
    );
    for (const audit of supplier.auditHistory ?? []) {
      await target.query(
        `insert into supplier_audit_records (supplier_id, audit_date, audit_type, score, outcome, note)
         values ($1,$2,$3,$4,$5,$6)`,
        [supplier.id, toIso(audit.date), audit.type ?? 'Audit', audit.score ?? null, audit.outcome ?? '', audit.note ?? null]
      );
    }
  }
}

async function seedCalibrations(target) {
  await target.query('delete from calibration_records');
  for (const instrument of demoCalibrations) {
    await upsertCalibration(instrument, target);
  }
}

async function seedCapas(target) {
  await target.query('delete from capa_stage_history');
  await target.query('delete from capa_actions');
  await target.query('delete from capa_records');
  for (const capa of demoCapas) {
    await createCapa({ ...capa, shiftName: capa.shiftName ?? 'Shift A' }, target);
  }
}

export async function resetCurrentDomainData(clientOrPool = pool, shiftName = null) {
  const target = db(clientOrPool);
  const shifts = shiftName ? [shiftName] : getShiftOptions();
  for (const shift of shifts) {
    await target.query('delete from production_orders where shift_name = $1', [shift]);
    await target.query('delete from material_inventory_current where shift_name = $1', [shift]);
    await target.query('delete from employee_certification_records where shift_name = $1', [shift]);
    await target.query('delete from workforce_roster_current where shift_name = $1', [shift]);
    await target.query('delete from quality_defects_current where shift_name = $1', [shift]);
    await target.query('delete from ncr_records where shift_name = $1', [shift]);

    const demo = getBaseDemoDashboard(shift);
    await seedOrders(target, shift, demo.orders ?? []);
    await seedMaterials(target, shift, demo.materials ?? []);
    await seedEmployees(target, shift, clone(demoEmployees));
    await seedDefects(target, shift, demo.defects ?? [], 'current');
    await seedDefects(target, shift, demo.prevShiftDefects ?? [], 'previous');
    await seedNcrs(target, shift, demo.ncrs ?? []);
  }

  if (!shiftName) {
    await seedSuppliers(target);
    await seedCalibrations(target);
    await seedCapas(target);
  }
}

export function buildDomainHistoryFromCurrentPayload({ shiftName, metricDate, payload }) {
  const date = metricDate ?? new Date().toISOString().slice(0, 10);
  const orders = (payload.orders ?? []).map((order) => ({
    order_id: order.id,
    shift_name: shiftName,
    metric_date: date,
    machine_name: order.machineAssigned,
    part_number: order.partNumber,
    part_name: order.partName,
    status: order.status,
    qty_ordered: Number(order.qtyOrdered),
    qty_produced: Number(order.qtyProduced),
    progress_percent: Number(((Number(order.qtyProduced) / Math.max(Number(order.qtyOrdered), 1)) * 100).toFixed(1)),
    due_date: toIso(order.dueDate),
    risk_reason: order.status === 'At Risk' || order.status === 'Delayed' ? 'Live state snapshot' : null
  }));

  const materials = (payload.materials ?? []).map((material) => ({
    material_code: material.code,
    material_name: material.name,
    shift_name: shiftName,
    metric_date: date,
    supplier_id: (payload.suppliers ?? []).find((supplier) => supplier.materials?.includes(material.code))?.id ?? 'SUP-UNK',
    supplier_name: (payload.suppliers ?? []).find((supplier) => supplier.materials?.includes(material.code))?.name ?? 'Unknown',
    stock_qty: Number(material.stockQty),
    reorder_point: Number(material.reorderPoint),
    daily_usage_rate: Number(material.dailyUsageRate),
    days_of_supply: Number(material.daysOfSupply),
    status: material.status
  }));

  const supplierAudits = (payload.suppliers ?? []).map((supplier) => ({
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    audit_date: date,
    status: supplier.status,
    risk_level: supplier.riskLevel,
    audit_score: Number(supplier.auditScore),
    outcome: supplier.status,
    lead_time_days: Number(supplier.leadTimeDays),
    materials: supplier.materials ?? []
  }));

  const workforce = (payload.employees ?? []).map((employee) => ({
    employee_id: employee.id,
    employee_name: employee.name,
    shift_name: shiftName,
    metric_date: date,
    role: employee.role,
    assigned_machine: employee.assignedMachine,
    shift_status: employee.shiftStatus,
    coverage_gap: employee.shiftStatus !== 'Active',
    output_impact: employee.shiftStatus !== 'Active' ? 120 : 0,
    downtime_impact_minutes: employee.shiftStatus !== 'Active' ? 18 : 0
  }));

  const certifications = (payload.employees ?? []).flatMap((employee) =>
    (employee.certifications ?? []).map((cert) => ({
      employee_id: employee.id,
      employee_name: employee.name,
      shift_name: shiftName,
      metric_date: date,
      certification_name: cert.name,
      assigned_machine: employee.assignedMachine,
      status: cert.status,
      issued_date: toDateKey(cert.issuedDate),
      expiry_date: toDateKey(cert.expiryDate),
      days_until_expiry: Math.ceil(((toEpoch(cert.expiryDate) ?? Date.now()) - new Date(`${date}T00:00:00Z`).getTime()) / DAY_MS)
    }))
  );

  const defects = (payload.defects ?? []).map((defect) => ({
    shift_name: shiftName,
    metric_date: date,
    machine_name: (payload.ncrs ?? []).find((ncr) => ncr.defectType === defect.type)?.machine ?? 'Line',
    defect_type: defect.type,
    defect_count: Number(defect.count),
    scrap_count: Math.round(Number(defect.count) * 0.25),
    rework_count: Math.round(Number(defect.count) * 0.45),
    severity: Number(defect.count) >= 10 ? 'Major' : 'Minor',
    trend: defect.trend ?? 'stable'
  }));

  const ncrs = (payload.ncrs ?? []).map((ncr) => ({
    ncr_id: ncr.id,
    shift_name: shiftName,
    opened_date: toDateKey(ncr.date) ?? date,
    closed_date: ncr.status === 'Closed' ? date : null,
    machine_name: ncr.machine,
    defect_type: ncr.defectType,
    qty_affected: Number(ncr.qtyAffected),
    severity: ncr.severity ?? 'Medium',
    status: ncr.status,
    assigned_to: ncr.assignedTo,
    capa_id: ncr.capaId,
    description: ncr.description
  }));

  const capas = (payload.capas ?? []).map((capa) => ({
    capa_id: capa.id,
    ncr_id: capa.ncrId,
    shift_name: capa.shiftName ?? shiftName,
    opened_date: toDateKey(capa.openedDate) ?? date,
    due_date: toDateKey(capa.dueDate) ?? date,
    closed_date: capa.status === 'Closed' ? toDateKey(capa.closedAt ?? date) : null,
    machine_name: capa.machine,
    defect_type: capa.defectType,
    severity: capa.severity,
    status: capa.status,
    percent_complete: Number(capa.percentComplete ?? 0),
    action_count: (capa.actions ?? []).length,
    completed_action_count: (capa.actions ?? []).filter((action) => action.completed).length,
    root_cause: capa.rootCause
  }));

  const calibrations = (payload.calibrations ?? []).map((instrument) => ({
    asset_tag: instrument.assetTag,
    metric_date: date,
    instrument_name: instrument.name,
    instrument_type: instrument.type,
    location: instrument.location,
    status: instrument.status,
    last_calibrated: toDateKey(instrument.lastCalibrated) ?? date,
    next_due: toDateKey(instrument.nextDue) ?? date,
    interval_days: Number(instrument.intervalDays),
    outcome: instrument.results?.outcome ?? 'Pass',
    calibrated_by: instrument.calibratedBy
  }));

  const anomalies = (payload.presses ?? [])
    .filter((press) => press.status !== 'Running' || Number(press.oee) < 70)
    .map((press, index) => ({
      anomaly_id: `ANOM-LIVE-${date}-${shiftName.replace(/\s+/g, '-')}-${index + 1}`,
      shift_name: shiftName,
      metric_date: date,
      machine_name: press.pressName,
      anomaly_type: press.status !== 'Running' ? 'Machine status' : 'OEE drop',
      severity: press.status === 'Down' ? 'critical' : 'warning',
      status: 'Open',
      metric_name: 'oee',
      metric_value: Number(press.oee),
      title: `${press.pressName} ${press.status}`,
      recommendation: press.status !== 'Running' ? 'Review maintenance and restart readiness.' : 'Check downtime and quality drivers.'
    }));

  const reports = [{
    shift_name: shiftName,
    report_date: date,
    report_type: 'daily_shift',
    summary_text: `${shiftName} snapshot: ${payload.summary?.overallOee ?? 'n/a'}% OEE, ${payload.summary?.totalOutput ?? 'n/a'} output, ${payload.summary?.activeAlerts ?? 0} active alerts.`,
    source_metrics: payload.summary ?? {}
  }];

  return {
    orders,
    materials,
    supplierAudits,
    workforce,
    certifications,
    defects,
    ncrs,
    capas,
    calibrations,
    anomalies,
    reports
  };
}

export async function getDataHealth(clientOrPool = pool) {
  const target = db(clientOrPool);
  const tables = [
    ['dashboard_snapshots', null],
    ['presses', null],
    ['production_orders', null],
    ['material_inventory_current', null],
    ['supplier_records', null],
    ['workforce_roster_current', null],
    ['employee_certification_records', null],
    ['quality_defects_current', null],
    ['ncr_records', null],
    ['capa_records', null],
    ['calibration_records', null],
    ['shift_daily_metrics', 'metric_date'],
    ['operational_events', 'metric_date'],
    ['order_history', 'metric_date'],
    ['material_inventory_history', 'metric_date'],
    ['supplier_audit_history', 'audit_date'],
    ['workforce_roster_history', 'metric_date'],
    ['certification_history', 'metric_date'],
    ['defect_history', 'metric_date'],
    ['ncr_history', 'opened_date'],
    ['capa_history', 'opened_date'],
    ['calibration_history', 'metric_date'],
    ['anomaly_history', 'metric_date'],
    ['generated_reports', 'report_date']
  ];
  const results = [];
  for (const [table, dateColumn] of tables) {
    if (dateColumn) {
      const result = await target.query(`select count(*)::int as rows, min(${dateColumn})::text as min_date, max(${dateColumn})::text as max_date from ${table}`);
      results.push({ table, ...result.rows[0] });
    } else {
      const result = await target.query(`select count(*)::int as rows from ${table}`);
      results.push({ table, rows: result.rows[0].rows });
    }
  }
  const checkpoints = await target.query(
    `select source_name, last_event_time, row_count, updated_at
     from ingestion_checkpoints
     order by updated_at desc`
  );
  return {
    generatedAt: new Date().toISOString(),
    tables: results,
    checkpoints: checkpoints.rows
  };
}
