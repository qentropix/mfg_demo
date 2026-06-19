import { EventEmitter } from 'node:events';

function normalize(value) {
  return String(value ?? '').toLowerCase();
}

function latestUserMessage(userMessage) {
  if (Array.isArray(userMessage)) {
    const reversed = [...userMessage].reverse();
    const entry = reversed.find((message) => normalize(message?.role) === 'user' && String(message?.content ?? '').trim());
    return String(entry?.content ?? '').trim();
  }

  return String(userMessage ?? '').trim();
}

function words(value) {
  return normalize(value).match(/[a-z0-9]+/g) ?? [];
}

function formatPercent(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'n/a';
  return `${num.toFixed(digits)}%`;
}

function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : 'n/a';
}

function topPressByOee(presses = []) {
  return [...presses].sort((a, b) => Number(a.oee ?? 0) - Number(b.oee ?? 0))[0] ?? null;
}

function runningPresses(presses = []) {
  return presses.filter((press) => normalize(press.status) === 'running');
}

function nonRunningPresses(presses = []) {
  return presses.filter((press) => normalize(press.status) !== 'running');
}

function pickPressMention(query, presses = [], anomalyMachine = '') {
  const text = normalize(query);
  const explicit = presses.find((press) => text.includes(normalize(press.pressName)));
  if (explicit) return explicit;

  if (anomalyMachine) {
    const fromAnomaly = presses.find((press) => normalize(press.pressName) === normalize(anomalyMachine));
    if (fromAnomaly) return fromAnomaly;
  }

  return topPressByOee(presses) ?? null;
}

function joinSample(items, limit = 3, mapper = (item) => item) {
  const sample = items.slice(0, limit).map(mapper).filter(Boolean);
  return sample.join(', ');
}

function formatAlert(alert) {
  return `${alert.title} (${alert.severity})`;
}

function summarizeAlerts(alerts = []) {
  if (!alerts.length) return 'No active alerts';
  return joinSample(alerts, 2, formatAlert);
}

function summarizeNcrs(ncrs = []) {
  const open = ncrs.filter((ncr) => normalize(ncr.status) !== 'closed');
  if (!open.length) return 'No open NCRs';
  return joinSample(open, 2, (ncr) => `${ncr.id} ${ncr.machine} ${ncr.defectType}`.trim());
}

function summarizeCapas(capas = []) {
  const open = capas.filter((capa) => normalize(capa.status) !== 'closed');
  if (!open.length) return 'No open CAPAs';
  return joinSample(open, 2, (capa) => `${capa.id} ${capa.machine} ${capa.defectType}`.trim());
}

function summarizeCoverage(employees = []) {
  const gaps = employees.filter((employee) => normalize(employee.shiftStatus) !== 'present');
  if (!gaps.length) return 'No current coverage gaps';
  return joinSample(gaps, 2, (employee) => `${employee.name} on ${employee.assignedMachine} (${employee.shiftStatus})`);
}

function detectIntent(query) {
  const text = normalize(query);
  if (!text) return 'general';
  if (text.includes('downtime') || text.includes('production loss') || text.includes('loss')) return 'downtime';
  if (text.includes('quality') || text.includes('defect') || text.includes('scrap') || text.includes('yield')) return 'quality';
  if (text.includes('alert')) return 'alerts';
  if (text.includes('capa')) return 'capa';
  if (text.includes('ncr')) return 'ncr';
  if (text.includes('workforce') || text.includes('operator') || text.includes('coverage') || text.includes('available')) return 'workforce';
  if (text.includes('supplier') || text.includes('material') || text.includes('inventory')) return 'supply';
  if (text.includes('calibration') || text.includes('instrument') || text.includes('due')) return 'calibration';
  if (text.includes('machine') || text.includes('press')) return 'machine';
  return 'general';
}

function buildChatResponse(query, contextData = {}) {
  const summary = contextData.summary ?? {};
  const presses = contextData.machines ?? contextData.presses ?? [];
  const defects = contextData.defects ?? [];
  const alerts = contextData.alerts ?? [];
  const openNcrs = contextData.openNcrs ?? contextData.ncrs ?? [];
  const overdueCapas = contextData.overdueCapas ?? contextData.capas ?? [];
  const employees = contextData.employees ?? [];
  const suppliers = contextData.suppliers ?? [];
  const calibrations = contextData.calibrations ?? [];
  const anomaly = contextData.anomaly ?? null;

  const machine = pickPressMention(query, presses, anomaly?.machine);
  const intent = detectIntent(query);

  if (intent === 'machine') {
    if (!machine) {
      return `I can help with machine health, but I do not see a matching machine in the current shift. ${summary.activeAlerts ? `${summary.activeAlerts} active alerts are open.` : ''}`.trim();
    }

    const status = machine.status;
    const note =
      normalize(status) === 'running'
        ? `It is running at ${formatPercent(machine.oee)} OEE with ${formatNumber(machine.outputCount)} units produced.`
        : `It is currently ${status.toLowerCase()} and should be checked first.`;
    return `${machine.pressName} is the machine to watch. ${note} ${summary.downtimeMinutes ? `Current downtime is ${summary.downtimeMinutes} minutes.` : ''}`.trim();
  }

  if (intent === 'downtime') {
    const worstPress = nonRunningPresses(presses)[0] ?? topPressByOee(presses);
    const downtimeLabel = summary.downtimeLabel ?? 'Downtime';
    const downtimeMinutes = summary.downtimeMinutes ?? 0;
    const alertSummary = summarizeAlerts(alerts);
    return `${downtimeLabel} is the main loss driver at ${downtimeMinutes} minutes. ${worstPress ? `${worstPress.pressName} is the first machine to inspect.` : 'No specific machine is currently flagged.'} ${alertSummary !== 'No active alerts' ? `Related alerts: ${alertSummary}.` : ''}`.trim();
  }

  if (intent === 'quality') {
    const topDefect = [...defects].sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))[0] ?? null;
    const qRate = summary.inspectionPassRate ?? summary.qualityRate;
    const lowMachine = topPressByOee(presses);
    return `Quality is at ${formatPercent(qRate)}. ${topDefect ? `The biggest defect theme is ${topDefect.type} with ${formatNumber(topDefect.count)} cases.` : 'No defect trend stands out yet.'} ${lowMachine ? `${lowMachine.pressName} is the lowest OEE machine at ${formatPercent(lowMachine.oee)}.` : ''}`.trim();
  }

  if (intent === 'alerts') {
    return `There are ${formatNumber(summary.activeAlerts ?? alerts.length)} active alerts. ${summarizeAlerts(alerts)}. The quickest next step is to open the top critical alert and check whether it is linked to downtime or a quality hold.`.trim();
  }

  if (intent === 'capa') {
    return `There are ${formatNumber(overdueCapas.filter((capa) => normalize(capa.status) !== 'closed').length)} open CAPAs. ${summarizeCapas(overdueCapas)}. Finish the earliest due item first and close any linked NCRs once verified.`.trim();
  }

  if (intent === 'ncr') {
    return `Open NCRs are limited to ${formatNumber(openNcrs.filter((ncr) => normalize(ncr.status) !== 'closed').length)} items. ${summarizeNcrs(openNcrs)}. Focus on containment first, then assign the root cause owner.`.trim();
  }

  if (intent === 'workforce') {
    const gaps = employees.filter((employee) => normalize(employee.shiftStatus) !== 'present');
    const gapText = summarizeCoverage(employees);
    const lowMachine = topPressByOee(presses);
    return `${gaps.length ? `${gaps.length} operators need attention.` : 'Coverage is stable.'} ${gapText}. ${lowMachine ? `If needed, ${lowMachine.pressName} can probably sustain output while you rebalance coverage.` : ''}`.trim();
  }

  if (intent === 'supply') {
    const criticalSuppliers = suppliers.filter((supplier) => normalize(supplier.status) === 'suspended' || normalize(supplier.status) === 'on hold');
    const criticalMaterial = (contextData.materials ?? []).find((material) => normalize(material.status) === 'critical');
    return `${criticalSuppliers.length ? `${criticalSuppliers.length} supplier issue(s) are active.` : 'Supplier risk is currently manageable.'} ${criticalMaterial ? `Critical material: ${criticalMaterial.name} (${criticalMaterial.stockLevel}).` : ''} Keep the highest-risk inbound item under review before the next changeover.`.trim();
  }

  if (intent === 'calibration') {
    const dueSoon = calibrations.filter((item) => normalize(item.status) === 'due soon');
    const overdue = calibrations.filter((item) => normalize(item.status) === 'overdue');
    return `${calibrations.length} instruments are tracked. ${overdue.length ? `${overdue.length} overdue,` : ''} ${dueSoon.length ? `${dueSoon.length} due soon.` : 'No immediate calibration risk.'} Check the next due instrument before it affects release or quality hold decisions.`.trim();
  }

  const running = runningPresses(presses);
  const blocked = nonRunningPresses(presses);
  const worstPress = topPressByOee(presses);
  const topDefect = [...defects].sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))[0] ?? null;
  const answerParts = [
    `This shift is at ${formatPercent(summary.overallOee)} OEE with ${formatNumber(summary.totalOutput)} units produced.`,
    blocked.length ? `${blocked[0].pressName} is not running, so that is the first machine I would inspect.` : worstPress ? `${worstPress.pressName} is the lowest OEE machine at ${formatPercent(worstPress.oee)}.` : '',
    topDefect ? `The largest defect theme is ${topDefect.type}.` : '',
    alerts.length ? `Active alerts: ${summarizeAlerts(alerts)}.` : '',
    openNcrs.length ? `Open NCRs: ${summarizeNcrs(openNcrs)}.` : '',
    running.length ? `${running.length} machine(s) are running normally.` : ''
  ].filter(Boolean);

  return answerParts.slice(0, 3).join(' ');
}

function buildShiftOptimizeResponse(contextData = {}, query = '') {
  const employees = contextData.employees ?? [];
  const presses = contextData.presses ?? [];
  const orders = contextData.orders ?? [];
  const openNcrs = contextData.openNcrs ?? [];
  const activeAlerts = contextData.activeAlerts ?? [];
  const gapEmployees = employees.filter((employee) => normalize(employee.shiftStatus) !== 'present');
  const worstPress = topPressByOee(presses);
  const donorPress = [...presses].find((press) => normalize(press.status) === 'running' && normalize(press.pressName) !== normalize(worstPress?.pressName));
  const shiftName = contextData.shift ?? 'current shift';

  const opening = query.trim() || 'Optimize the current shift.';
  const coverage = gapEmployees.length
    ? `Reassign ${gapEmployees[0].name} back to ${gapEmployees[0].assignedMachine} or cover that machine with the nearest qualified operator.`
    : 'Coverage is already balanced, so keep the current roster stable.';
  const machineLine = worstPress
    ? `${worstPress.pressName} is the lowest OEE machine; pair it with ${donorPress?.pressName ?? 'a stable donor machine'} to protect output.`
    : 'No machine imbalance is obvious from the current data.';
  const riskLine = openNcrs.length || activeAlerts.length
    ? `Pay attention to ${openNcrs.length} open NCR(s) and ${activeAlerts.length} active alert(s) before the next handoff.`
    : 'There are no open NCR or alert blockers right now.';
  const orderLine = orders.length ? `Prioritize ${orders[0].id} and keep the highest-priority order moving.` : 'No active order constraint is visible.';

  return `${opening} For ${shiftName}, ${coverage} ${machineLine} ${riskLine} ${orderLine}`.trim();
}

function buildQualityAnalysisResponse(contextData = {}) {
  const summary = contextData.summary ?? {};
  const presses = contextData.presses ?? [];
  const defects = contextData.defects ?? [];
  const openNcrs = contextData.openNcrs ?? [];
  const worstPress = topPressByOee(presses);
  const worstDefect = [...defects].sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))[0] ?? null;

  return [
    `Quality is running at ${formatPercent(summary.qualityRate ?? summary.inspectionPassRate)} with ${formatNumber(summary.goodParts)} good parts.`,
    worstPress ? `${worstPress.pressName} is the highest-risk machine at ${formatPercent(worstPress.oee)} OEE.` : '',
    worstDefect ? `The worst defect theme is ${worstDefect.type} with ${formatNumber(worstDefect.count)} cases.` : '',
    openNcrs.length ? `${openNcrs.length} NCR(s) remain open, so contain the issue before release.` : 'No open NCRs are blocking release right now.'
  ].filter(Boolean).join(' ');
}

function buildSupplyScenarioResponse(contextData = {}, query = '') {
  const materials = contextData.materials ?? [];
  const suppliers = contextData.suppliers ?? [];
  const criticalSupplier = [...suppliers].find((supplier) => normalize(supplier.status) !== 'approved') ?? null;
  const criticalMaterial = [...materials].find((material) => normalize(material.status) === 'critical') ?? null;

  return [
    query.replace(/^scenario:\s*/i, '').trim() || 'Supply chain scenario analysis.',
    criticalSupplier ? `${criticalSupplier.name} is the first supplier risk to manage.` : 'Supplier risk is currently low.',
    criticalMaterial ? `${criticalMaterial.name} is the highest-risk material position.` : 'No material is currently flagged critical.',
    'Mitigate by protecting the highest-risk inbound item and keeping the next changeover ready.'
  ].join(' ');
}

function buildAnomalyResponse(contextData = {}, query = '') {
  const anomaly = contextData.anomaly ?? {};
  const machine = anomaly.machine ?? 'the machine';
  const metric = anomaly.metric ?? 'anomaly';
  const trend = anomaly.trend ?? [];
  const trendText = trend.length ? `Recent values are ${trend.slice(0, 4).join(', ')}.` : '';
  return `The ${metric} pattern on ${machine} usually points to a mechanical or feed issue. Check the wear parts, alignment, and sensor stability first. ${trendText} Restore the machine, then verify the OEE recovers on the next cycle.`;
}

function buildRootCauseResponse(contextData = {}) {
  const { capaId, machine, defectType, issueDescription, previousCapas = [] } = contextData;
  const related = Array.isArray(previousCapas) ? previousCapas.filter((capa) => normalize(capa.machine) === normalize(machine)).slice(0, 2) : [];
  const lines = [
    `Why 1: ${issueDescription} was detected on ${machine}.`,
    `Why 2: The ${defectType} condition likely followed a change in setup, wear, or material control.`,
    `Why 3: The current process window was probably too loose for the ${machine} operating state.`,
    `Why 4: A control step or verification check did not catch the drift early enough.`,
    `Why 5: The underlying cause is likely a missing standard or repeatable handoff around ${machine}.`,
    `Root Cause: ${machine} is producing ${defectType} because the process was not held tightly enough to the current operating window.`
  ];

  if (related.length) {
    lines.push(`Related CAPAs: ${related.map((item) => item.id).join(', ')}.`);
  }

  return lines.join('\n');
}

function buildShiftReportResponse(contextData = {}) {
  const summary = contextData.summary ?? {};
  const machines = contextData.machines ?? [];
  const downtime = contextData.downtime ?? [];
  const orders = contextData.orders ?? [];
  const openNcrs = contextData.openNcrs ?? [];
  const overdueCapas = contextData.overdueCapas ?? [];
  const activeAlerts = contextData.activeAlerts ?? [];
  const worstPress = topPressByOee(machines);
  const worstDowntime = [...downtime].sort((a, b) => Number(b.minutes ?? 0) - Number(a.minutes ?? 0))[0] ?? null;

  return [
    `### PERFORMANCE SUMMARY`,
    `The shift is at ${formatPercent(summary.overallOee)} OEE with ${formatNumber(summary.totalOutput)} units produced. ${worstPress ? `${worstPress.pressName} is the lowest OEE machine.` : ''} ${orders.length ? `Order ${orders[0].id} remains the top production focus.` : ''}`.trim(),
    '',
    `### ISSUES & ACTIONS`,
    `${worstDowntime ? `${worstDowntime.reason} accounts for ${formatNumber(worstDowntime.minutes)} minutes.` : 'No major downtime spike stood out.'} ${openNcrs.length ? `${openNcrs.length} NCR(s) remain open.` : 'No open NCRs remain.'} ${overdueCapas.length ? `${overdueCapas.length} CAPA(s) are overdue.` : 'No CAPAs are overdue.'}`.trim(),
    '',
    `### HANDOVER NOTES`,
    `${activeAlerts.length ? `Alerts to watch: ${summarizeAlerts(activeAlerts)}.` : 'No active alerts need escalation at handover.'} Keep the next shift focused on the lowest OEE machine and any open quality holds.`,
    '',
    `### RECOMMENDATIONS`,
    `Stabilize ${worstPress?.pressName ?? 'the weakest machine'} first, close the oldest NCR, and protect the current top order. Use the next handoff to confirm any overdue CAPA owners before release.`
  ].join('\n');
}

function buildResponse(systemPrompt = '', userMessage, contextData = {}) {
  const prompt = normalize(systemPrompt);
  const query = latestUserMessage(userMessage);

  if (prompt.includes('5-why root cause analysis')) {
    return buildRootCauseResponse(contextData);
  }

  if (prompt.includes('maintenance engineer')) {
    return buildAnomalyResponse(contextData, query);
  }

  if (prompt.includes('quality analyst')) {
    return buildQualityAnalysisResponse(contextData);
  }

  if (prompt.includes('supply chain analyst')) {
    return buildSupplyScenarioResponse(contextData, query);
  }

  if (prompt.includes('operations optimization expert')) {
    return buildShiftOptimizeResponse(contextData, query);
  }

  if (prompt.includes('shift supervisor writing a formal shift handover report')) {
    return buildShiftReportResponse(contextData);
  }

  if (prompt.includes('operations intelligence assistant')) {
    return buildChatResponse(query, contextData);
  }

  return buildChatResponse(query, contextData);
}

function chunkText(text, chunkSize = 120) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks.length ? chunks : [''];
}

function createStream(text) {
  const emitter = new EventEmitter();
  const chunks = chunkText(text);

  queueMicrotask(() => {
    let index = 0;
    const timer = setInterval(() => {
      const chunk = chunks[index++];
      if (chunk) emitter.emit('text', chunk);
      if (index >= chunks.length) {
        clearInterval(timer);
        emitter.emit('end');
      }
    }, 10);
  });

  return emitter;
}

export async function streamCompletion({ systemPrompt, userMessage, contextData }) {
  const text = buildResponse(systemPrompt, userMessage, contextData);
  return createStream(text);
}
