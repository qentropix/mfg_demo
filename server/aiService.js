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

function summarizeCapas(capas = [], emptyMessage = 'No open CAPAs') {
  const open = capas.filter((capa) => normalize(capa.status) !== 'closed');
  if (!open.length) return emptyMessage;
  return joinSample(open, 2, (capa) => `${capa.id} ${capa.machine} ${capa.defectType}`.trim());
}

function summarizeCoverage(employees = []) {
  const gaps = employees.filter((employee) => normalize(employee.shiftStatus) !== 'present');
  if (!gaps.length) return 'No current coverage gaps';
  return joinSample(gaps, 2, (employee) => `${employee.name} on ${employee.assignedMachine} (${employee.shiftStatus})`);
}

const LOCAL_CHAT_MODEL = process.env.AI_CHAT_MODEL ?? 'gemma3';
const LOCAL_REASONING_MODEL = process.env.AI_REASONING_MODEL ?? 'deepseek-r1';
const AI_PROVIDER = normalize(process.env.AI_PROVIDER ?? 'auto');
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
let ollamaAvailability = null;

function pickFields(item, fields) {
  return fields.reduce((accumulator, field) => {
    if (item?.[field] !== undefined) {
      accumulator[field] = item[field];
    }
    return accumulator;
  }, {});
}

function compactArray(items = [], fields, limit = 6) {
  return items.slice(0, limit).map((item) => pickFields(item, fields));
}

function compactContext(contextData = {}) {
  const topic = normalize(contextData.assistantTopic);
  const summary = pickFields(contextData.summary ?? {}, [
    'overallOee',
    'totalOutput',
    'goodParts',
    'downtimeLabel',
    'downtimeMinutes',
    'activeAlerts',
    'criticalAlerts',
    'warningAlerts',
    'qualityRate',
    'inspectionPassRate'
  ]);
  const context = {
    topic,
    shift: contextData.shift ?? 'Shift A',
    summary
  };

  if (contextData.machines?.length) {
    context.machines = compactArray(contextData.machines, ['pressName', 'status', 'oee', 'outputCount', 'downtimeMinutes', 'currentJob']);
  }
  if (contextData.downtime?.length) {
    context.downtime = compactArray(contextData.downtime, ['reason', 'minutes', 'percent']);
  }
  if (contextData.orders?.length) {
    context.orders = compactArray(contextData.orders, ['id', 'status', 'dueDate', 'machine', 'priority', 'progress', 'quantity']);
  }
  if (contextData.materials?.length) {
    context.materials = compactArray(contextData.materials, ['name', 'status', 'stockLevel', 'dailyUsage', 'supplier']);
  }
  if (contextData.defects?.length) {
    context.defects = compactArray(contextData.defects, ['type', 'count']);
  }
  if (contextData.prevShiftDefects?.length) {
    context.prevShiftDefects = compactArray(contextData.prevShiftDefects, ['type', 'count']);
  }
  if (contextData.ncrs?.length) {
    context.ncrs = compactArray(contextData.ncrs, ['id', 'machine', 'defectType', 'status', 'severity', 'assignedTo', 'date']);
  }
  if (contextData.openNcrs?.length) {
    context.openNcrs = compactArray(contextData.openNcrs, ['id', 'machine', 'defectType', 'status', 'severity', 'assignedTo', 'date']);
  }
  if (contextData.capas?.length) {
    context.capas = compactArray(contextData.capas, ['id', 'title', 'machine', 'defectType', 'status', 'dueDate', 'ncrId', 'stage']);
  }
  if (contextData.overdueCapas?.length) {
    context.overdueCapas = compactArray(contextData.overdueCapas, ['id', 'title', 'machine', 'defectType', 'status', 'dueDate', 'ncrId', 'stage']);
  }
  if (contextData.employees?.length) {
    context.employees = compactArray(contextData.employees, ['name', 'role', 'assignedMachine', 'shiftStatus', 'certificationStatus']);
  }
  if (contextData.suppliers?.length) {
    context.suppliers = compactArray(contextData.suppliers, ['id', 'name', 'status', 'riskLevel', 'lastAudit', 'nextAudit']);
  }
  if (contextData.calibrations?.length) {
    context.calibrations = compactArray(contextData.calibrations, ['assetTag', 'instrument', 'status', 'nextDue', 'lastCalibrated', 'location', 'type']);
  }
  if (contextData.alerts?.length) {
    context.alerts = compactArray(contextData.alerts, ['id', 'title', 'severity', 'message', 'createdAt']);
  }
  if (contextData.historySummary?.length) {
    context.historySummary = compactArray(contextData.historySummary, ['metricDate', 'overallOee', 'totalOutput', 'goodParts', 'downtimeMinutes', 'qualityRate', 'activeAlerts', 'criticalAlerts', 'warningAlerts'], 14);
  }
  if (contextData.historyInsights) {
    context.historyInsights = {
      summary: pickFields(contextData.historyInsights.summary ?? {}, ['avgOee', 'minOee', 'maxOee', 'totalOutput', 'goodParts', 'downtimeMinutes', 'avgQualityRate', 'activeAlerts']),
      eventBreakdown: compactArray(contextData.historyInsights.eventBreakdown ?? [], ['eventType', 'severity', 'count'], 8)
    };
  }
  if (contextData.historyEvents?.length) {
    context.historyEvents = compactArray(contextData.historyEvents, ['eventTime', 'eventType', 'severity', 'title', 'details', 'machineName', 'entityType', 'entityId', 'metricValue'], 10);
  }
  if (contextData.historyDay) {
    context.historyDay = pickFields(contextData.historyDay, [
      'shiftName',
      'metricDate',
      'plantName',
      'overallOee',
      'totalOutput',
      'goodParts',
      'downtimeMinutes',
      'qualityRate',
      'activeAlerts',
      'criticalAlerts',
      'warningAlerts'
    ]);
  }
  if (contextData.historyComparison) {
    context.historyComparison = {
      startDate: contextData.historyComparison.startDate ?? null,
      endDate: contextData.historyComparison.endDate ?? null,
      startDay: contextData.historyComparison.startDay ? pickFields(contextData.historyComparison.startDay, [
        'shiftName',
        'metricDate',
        'plantName',
        'overallOee',
        'totalOutput',
        'goodParts',
        'downtimeMinutes',
        'qualityRate',
        'activeAlerts',
        'criticalAlerts',
        'warningAlerts'
      ]) : null,
      endDay: contextData.historyComparison.endDay ? pickFields(contextData.historyComparison.endDay, [
        'shiftName',
        'metricDate',
        'plantName',
        'overallOee',
        'totalOutput',
        'goodParts',
        'downtimeMinutes',
        'qualityRate',
        'activeAlerts',
        'criticalAlerts',
        'warningAlerts'
      ]) : null
    };
  }

  return context;
}

function selectModel(systemPrompt = '', contextData = {}, query = '') {
  const prompt = normalize(systemPrompt);
  const topic = normalize(contextData.assistantTopic);
  const text = `${prompt} ${normalize(query)}`;
  const reasoningSignals = [
    'history',
    'historical',
    'trend',
    'trends',
    'history-day',
    'history-compare',
    'compare',
    'comparison',
    'recurring',
    'root cause',
    '5-why',
    'handover report',
    'shift report',
    'quality analyst',
    'maintenance engineer',
    'operations optimization expert'
  ];

  if (topic === 'history' || reasoningSignals.some((signal) => text.includes(signal))) {
    return LOCAL_REASONING_MODEL;
  }

  return LOCAL_CHAT_MODEL;
}

function buildModelMessages(systemPrompt = '', userMessage, contextData = {}) {
  const context = compactContext(contextData);
  const contextualSystemPrompt = [
    systemPrompt.trim(),
    'Use only the supplied operational context and the conversation messages.',
    'Do not invent CAPA, NCR, machine, supplier, or history values.',
    'If a user asks about CAPA, distinguish open CAPAs from overdue CAPAs.',
    'If the answer is not present in the context, say what is missing.',
    `Context:\n${JSON.stringify(context, null, 2)}`
  ].filter(Boolean).join('\n\n');

  if (Array.isArray(userMessage)) {
    const history = userMessage
      .map((message) => ({
        role: normalize(message?.role) === 'assistant' ? 'assistant' : 'user',
        content: String(message?.content ?? '').trim()
      }))
      .filter((message) => message.content);

    return [{ role: 'system', content: contextualSystemPrompt }, ...history];
  }

  const query = latestUserMessage(userMessage);
  return [
    { role: 'system', content: contextualSystemPrompt },
    { role: 'user', content: query }
  ];
}

async function ollamaIsAvailable() {
  if (AI_PROVIDER === 'deterministic') {
    return false;
  }

  if (ollamaAvailability !== null) {
    return ollamaAvailability;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/version`, { signal: controller.signal });
    clearTimeout(timeoutId);
    ollamaAvailability = response.ok;
  } catch (_error) {
    ollamaAvailability = false;
  }

  return ollamaAvailability;
}

async function streamOllamaCompletion({ systemPrompt, userMessage, contextData }) {
  const model = selectModel(systemPrompt, contextData, latestUserMessage(userMessage));
  const messages = buildModelMessages(systemPrompt, userMessage, contextData);
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      options: {
        temperature: 0.2
      }
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }

  const emitter = new EventEmitter();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  queueMicrotask(async () => {
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');

        while (newlineIndex >= 0) {
          const rawLine = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');

          if (!rawLine) {
            continue;
          }

          try {
            const payload = JSON.parse(rawLine);
            const chunk = payload.message?.content ?? '';
            if (chunk) {
              emitter.emit('text', chunk);
            }
            if (payload.done) {
              emitter.emit('end');
              return;
            }
          } catch (_error) {
            // Ignore malformed partial lines and continue streaming.
          }
        }
      }

      const finalText = decoder.decode();
      if (finalText.trim()) {
        try {
          const payload = JSON.parse(finalText.trim());
          const chunk = payload.message?.content ?? '';
          if (chunk) {
            emitter.emit('text', chunk);
          }
        } catch (_error) {
          // Ignore trailing parse noise.
        }
      }
      emitter.emit('end');
    } catch (error) {
      emitter.emit('error', error);
    }
  });

  return emitter;
}

function isOverdueCapaQuery(query) {
  const text = normalize(query);
  return text.includes('capa') && (
    text.includes('overdue') ||
    text.includes('past due') ||
    text.includes('past-due') ||
    text.includes('late') ||
    text.includes('behind schedule')
  );
}

function detectIntent(query) {
  const text = normalize(query);
  if (!text) return 'general';
  if (text.includes('downtime') || text.includes('production loss') || text.includes('loss')) return 'downtime';
  if (text.includes('quality') || text.includes('defect') || text.includes('scrap') || text.includes('yield')) return 'quality';
  if (text.includes('alert')) return 'alerts';
  if (isOverdueCapaQuery(text)) return 'capa-overdue';
  if (text.includes('capa')) return 'capa';
  if (text.includes('ncr')) return 'ncr';
  if (text.includes('workforce') || text.includes('operator') || text.includes('coverage') || text.includes('available')) return 'workforce';
  if (text.includes('supplier') || text.includes('material') || text.includes('inventory')) return 'supply';
  if (text.includes('calibration') || text.includes('instrument') || text.includes('due')) return 'calibration';
  if (text.includes('machine') || text.includes('press')) return 'machine';
  return 'general';
}

function buildHistoryChatResponse(query, contextData = {}) {
  const historySummary = contextData.historySummary ?? [];
  const historyInsights = contextData.historyInsights ?? {};
  const insightSummary = historyInsights.summary ?? {};
  const eventBreakdown = historyInsights.eventBreakdown ?? [];
  const firstDay = historySummary[0] ?? null;
  const lastDay = historySummary[historySummary.length - 1] ?? null;
  const strongestEvent = [...eventBreakdown].sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))[0] ?? null;

  const parts = [
    query.replace(/\s+/g, ' ').trim() || 'Historical performance summary.',
    historySummary.length ? `I found ${historySummary.length} day(s) of history for this shift.` : 'No historical records are available yet.',
    insightSummary.avgOee === null || insightSummary.avgOee === undefined ? '' : `Average OEE is ${formatPercent(insightSummary.avgOee)}.`,
    insightSummary.avgQualityRate === null || insightSummary.avgQualityRate === undefined ? '' : `Average quality rate is ${formatPercent(insightSummary.avgQualityRate)}.`,
    insightSummary.totalOutput ? `Total output is ${formatNumber(insightSummary.totalOutput)} units.` : '',
    insightSummary.downtimeMinutes ? `Total downtime is ${formatNumber(insightSummary.downtimeMinutes)} minutes.` : '',
    strongestEvent ? `Most frequent event type is ${strongestEvent.eventType} (${strongestEvent.severity}).` : '',
    firstDay && lastDay && firstDay.metricDate !== lastDay.metricDate && Number.isFinite(Number(firstDay.overallOee)) && Number.isFinite(Number(lastDay.overallOee))
      ? `OEE moved from ${formatPercent(firstDay.overallOee)} to ${formatPercent(lastDay.overallOee)} over the selected period.`
      : ''
  ].filter(Boolean);

  return parts.slice(0, 5).join(' ');
}

function buildHistoryDayResponse(query, contextData = {}) {
  const historyDay = contextData.historyDay ?? null;
  if (!historyDay) {
    return `I could not find history for ${query.replace(/\s+/g, ' ').trim() || 'that date'}. Make sure the shift and date exist in the history table.`;
  }

  return [
    `On ${historyDay.metricDate}, ${historyDay.shiftName} recorded ${formatPercent(historyDay.overallOee)} OEE.`,
    `Output was ${formatNumber(historyDay.totalOutput)} units with ${formatNumber(historyDay.goodParts)} good parts.`,
    `Downtime was ${formatNumber(historyDay.downtimeMinutes)} minutes and quality rate was ${formatPercent(historyDay.qualityRate)}.`,
    `Alerts that day were ${formatNumber(historyDay.activeAlerts)} total, including ${formatNumber(historyDay.criticalAlerts)} critical and ${formatNumber(historyDay.warningAlerts)} warning.`
  ].join(' ');
}

function buildHistoryComparisonResponse(query, contextData = {}) {
  const comparison = contextData.historyComparison ?? null;
  const startDay = comparison?.startDay ?? null;
  const endDay = comparison?.endDay ?? null;

  if (!comparison || !startDay || !endDay) {
    return `I could not compare the dates in "${query}". Make sure both dates exist in the history table for the selected shift.`;
  }

  const oeeDelta = Number(endDay.overallOee ?? 0) - Number(startDay.overallOee ?? 0);
  const outputDelta = Number(endDay.totalOutput ?? 0) - Number(startDay.totalOutput ?? 0);
  const goodPartsDelta = Number(endDay.goodParts ?? 0) - Number(startDay.goodParts ?? 0);
  const downtimeDelta = Number(endDay.downtimeMinutes ?? 0) - Number(startDay.downtimeMinutes ?? 0);
  const qualityDelta = Number(endDay.qualityRate ?? 0) - Number(startDay.qualityRate ?? 0);
  const alertsDelta = Number(endDay.activeAlerts ?? 0) - Number(startDay.activeAlerts ?? 0);

  return [
    `On ${startDay.metricDate}, ${startDay.shiftName} recorded ${formatPercent(startDay.overallOee)} OEE, ${formatNumber(startDay.totalOutput)} output, ${formatNumber(startDay.goodParts)} good parts, ${formatNumber(startDay.downtimeMinutes)} minutes downtime, and ${formatPercent(startDay.qualityRate)} quality rate.`,
    `On ${endDay.metricDate}, the same shift recorded ${formatPercent(endDay.overallOee)} OEE, ${formatNumber(endDay.totalOutput)} output, ${formatNumber(endDay.goodParts)} good parts, ${formatNumber(endDay.downtimeMinutes)} minutes downtime, and ${formatPercent(endDay.qualityRate)} quality rate.`,
    `That is a ${formatSignedPercent(oeeDelta)} OEE change, ${formatSignedNumber(outputDelta)} output change, ${formatSignedNumber(goodPartsDelta)} good parts change, ${formatSignedNumber(downtimeDelta)} minute downtime change, and ${formatSignedPercent(qualityDelta)} quality change.`,
    `Alerts changed from ${formatNumber(startDay.activeAlerts)} to ${formatNumber(endDay.activeAlerts)} (${formatSignedNumber(alertsDelta)}).`
  ].join(' ');
}

function buildChatResponse(query, contextData = {}) {
  const summary = contextData.summary ?? {};
  const presses = contextData.machines ?? contextData.presses ?? [];
  const defects = contextData.defects ?? [];
  const alerts = contextData.alerts ?? [];
  const capas = contextData.capas ?? [];
  const openNcrs = contextData.openNcrs ?? contextData.ncrs ?? [];
  const overdueCapas = contextData.overdueCapas ?? contextData.capas ?? [];
  const employees = contextData.employees ?? [];
  const suppliers = contextData.suppliers ?? [];
  const calibrations = contextData.calibrations ?? [];
  const anomaly = contextData.anomaly ?? null;
  const assistantTopic = normalize(contextData.assistantTopic);

  const machine = pickPressMention(query, presses, anomaly?.machine);
  if (assistantTopic === 'history') {
    return buildHistoryChatResponse(query, contextData);
  }
  if (assistantTopic === 'history-day') {
    return buildHistoryDayResponse(query, contextData);
  }
  if (assistantTopic === 'history-compare') {
    return buildHistoryComparisonResponse(query, contextData);
  }

  const intent = assistantTopic && assistantTopic !== 'general' ? assistantTopic : detectIntent(query);

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

  if (intent === 'capa-overdue') {
    const overdue = overdueCapas.filter((capa) => normalize(capa.status) !== 'closed');
    return `There are ${formatNumber(overdue.length)} overdue CAPAs. ${summarizeCapas(overdue, 'No overdue CAPAs')}. Start with the oldest due item and verify the linked NCR is contained before closing it.`.trim();
  }

  if (intent === 'capa') {
    const openCapas = capas.filter((capa) => normalize(capa.status) !== 'closed');
    return `There are ${formatNumber(openCapas.length)} open CAPAs. ${summarizeCapas(openCapas)}. Finish the earliest due item first and close any linked NCRs once verified.`.trim();
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
  const strictHistoryReport = Boolean(contextData.strictHistoryReport);
  const reportDate = contextData.reportDate ?? null;
  const summary = contextData.summary ?? {};
  const machines = contextData.machines ?? [];
  const downtime = contextData.downtime ?? [];
  const orders = contextData.orders ?? [];
  const openNcrs = contextData.openNcrs ?? [];
  const overdueCapas = contextData.overdueCapas ?? [];
  const activeAlerts = contextData.activeAlerts ?? [];
  const reportDayEvents = contextData.reportDayEvents ?? [];
  const worstPress = topPressByOee(machines);
  const worstDowntime = [...downtime].sort((a, b) => Number(b.minutes ?? 0) - Number(a.minutes ?? 0))[0] ?? null;

  if (strictHistoryReport && !contextData.historyDay) {
    return [
      `### PERFORMANCE SUMMARY`,
      `No historical report was found for ${reportDate ?? 'the selected date'}.`,
      '',
      `### ISSUES & ACTIONS`,
      `The report cannot be generated until the selected date exists in the history table for ${contextData.shiftName ?? 'this shift'}.`,
      '',
      `### HANDOVER NOTES`,
      `Use the selected date to pick a day that has been seeded or captured in the historical database.`,
      '',
      `### RECOMMENDATIONS`,
      `If you expected data for this date, refresh the history backfill or verify the report date in the database.`
    ].join('\n');
  }

  if (contextData.historyDay) {
    const day = contextData.historyDay;
    const eventTypes = [...new Map(reportDayEvents.map((event) => [event.eventType, event])).values()]
      .slice(0, 3)
      .map((event) => `${event.eventType}${event.severity ? ` (${event.severity})` : ''}`);
    const eventSummary = eventTypes.length
      ? `Recorded events included ${eventTypes.join(', ')}.`
      : 'No operational events were recorded for the selected day.';
    const alertLine = Number(day.activeAlerts ?? 0)
      ? `Alerts for the day totaled ${formatNumber(day.activeAlerts)}, including ${formatNumber(day.criticalAlerts)} critical and ${formatNumber(day.warningAlerts)} warning.`
      : 'No alerts were recorded for the selected day.';
    const issueLine = Number(day.downtimeMinutes ?? 0) > 0
      ? `Downtime on ${day.metricDate} was ${formatNumber(day.downtimeMinutes)} minutes, so review the history events for that date to find the dominant cause.`
      : `No downtime was recorded on ${day.metricDate}.`;
    const qualityLine = Number(day.qualityRate ?? 0) < 90
      ? `Quality rate was below target at ${formatPercent(day.qualityRate)}.`
      : `Quality rate held at ${formatPercent(day.qualityRate)}.`;

    return [
      `### PERFORMANCE SUMMARY`,
      `On ${day.metricDate}, ${day.shiftName} recorded ${formatPercent(day.overallOee)} OEE with ${formatNumber(day.totalOutput)} units produced and ${formatNumber(day.goodParts)} good parts. ${qualityLine} ${alertLine} ${eventSummary}`.trim(),
      '',
      `### ISSUES & ACTIONS`,
      `${issueLine} If an NCR or CAPA was opened that day, match it against the related machine and defect in the quality register.`.trim(),
      '',
      `### HANDOVER NOTES`,
      `This is the daily report snapshot for ${day.metricDate}. Use the historical trends pane to compare it against adjacent days before final handoff.`,
      '',
      `### RECOMMENDATIONS`,
      `Review any alert spikes, confirm the heaviest downtime driver, and compare the day against the previous and next shift to check whether the change was isolated or recurring.`
    ].join('\n');
  }

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

export function buildDailyReportText(contextData = {}) {
  return buildShiftReportResponse(contextData);
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
  const assistantTopic = normalize(contextData?.assistantTopic);
  const isDateBoundShiftReport =
    systemPrompt?.toLowerCase?.().includes('shift supervisor writing a formal shift handover report') &&
    (contextData?.historyDay || contextData?.reportDate);

  if (assistantTopic === 'history-day' || assistantTopic === 'history-compare' || isDateBoundShiftReport) {
    const text = buildResponse(systemPrompt, userMessage, contextData);
    return createStream(text);
  }

  if (await ollamaIsAvailable()) {
    try {
      return await streamOllamaCompletion({ systemPrompt, userMessage, contextData });
    } catch (error) {
      console.warn(`Ollama fallback triggered: ${error.message}`);
    }
  }

  const text = buildResponse(systemPrompt, userMessage, contextData);
  return createStream(text);
}
