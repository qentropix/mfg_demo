import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  createAlert,
  createCapa,
  createNcr,
  getDashboardPayload,
  getShifts,
  deleteAlert,
  listAlerts,
  listCapas,
  listNcrs,
  listPresses,
  resetShift,
  replaceAlerts,
  replaceMergedCapas,
  replaceMergedNcrs,
  replaceShiftSeries,
  updateNcr,
  updateCapa,
  updateDashboardSnapshot,
  updatePress
} from './dashboardRepository.js';
import { getHistoryDay, listHistoryEvents, listHistoryEventsForDay, listHistoryInsights, listHistorySummary } from './historyRepository.js';
import { buildDailyReportText, streamCompletion } from './aiService.js';
import { analyzeAiFailures, approveRetrievalGap, finishAiInteraction, getRetrievalGapById, listRetrievalGaps, proposeRetrievalGap, recordAiFeedback, recordAiFailure, startAiInteraction } from './aiTelemetry.js';
import { calibrations, employees, suppliers } from './demoData.js';
import { broadcastDashboardUpdate, subscribeDashboardUpdates } from './realtime.js';
import { resolveRetrievalAnswer } from './retrievalEngine.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const clientDist = path.resolve(__dirname, '..', 'dist');
const { Client } = pg;
let notificationClient = null;

app.use(cors());
app.use(express.json());

function resolveShiftName(request) {
  return typeof request.query.shift === 'string' && request.query.shift.trim()
    ? request.query.shift.trim()
    : typeof request.body?.shiftName === 'string' && request.body.shiftName.trim()
      ? request.body.shiftName.trim()
      : 'Shift A';
}

function normalizeHistoricalDateQuery(query) {
  return String(query ?? '').toLowerCase().replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1');
}

function formatLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseHistoricalDate(query) {
  const text = normalizeHistoricalDateQuery(query);
  const months = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11
  };
  const currentYear = new Date().getFullYear();
  const matchers = [
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s+(\d{4}))?\b/i,
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
    /\b(\d{2})-(\d{2})-(\d{4})\b/
  ];

  for (const matcher of matchers) {
    const match = text.match(matcher);
    if (!match) {
      continue;
    }

    if (matcher.source.includes('\\d{4}-')) {
      const [, year, month, day] = match;
      const candidate = new Date(Number(year), Number(month) - 1, Number(day));
      if (Number.isNaN(candidate.getTime())) continue;
      return candidate;
    }

    if (matcher.source.includes('\\d{2}-\\d{2}-\\d{4}')) {
      const [, day, month, year] = match;
      const candidate = new Date(Number(year), Number(month) - 1, Number(day));
      if (Number.isNaN(candidate.getTime())) continue;
      return candidate;
    }

    const first = match[1];
    const second = match[2];
    const third = match[3];
    const dayFirst = Number(first);
    const monthFirst = months[first];
    const daySecond = Number(second);
    const monthSecond = months[second];
    const year = third ? Number(third) : currentYear;

    if (monthFirst !== undefined) {
      const candidate = new Date(year, monthFirst, daySecond);
      if (!Number.isNaN(candidate.getTime())) return candidate;
    }

    if (monthSecond !== undefined) {
      const candidate = new Date(year, monthSecond, dayFirst);
      if (!Number.isNaN(candidate.getTime())) return candidate;
    }
  }

  return null;
}

function resolveReportDateValue(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const candidate = new Date(`${text}T00:00:00`);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  return parseHistoricalDate(text);
}

function extractHistoricalDates(query) {
  const text = normalizeHistoricalDateQuery(query);
  const months = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11
  };
  const currentYear = new Date().getFullYear();
  const seen = new Set();
  const results = [];
  const add = (candidate) => {
    if (!candidate || Number.isNaN(candidate.getTime())) {
      return;
    }
    const key = formatLocalDateKey(candidate);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push(candidate);
  };

  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const [, year, month, day] = match;
    add(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  for (const match of text.matchAll(/\b(\d{2})-(\d{2})-(\d{4})\b/g)) {
    const [, day, month, year] = match;
    add(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  for (const match of text.matchAll(/\b(\d{1,2})(st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/gi)) {
    const day = Number(match[1]);
    const month = months[match[3].toLowerCase()];
    const year = match[4] ? Number(match[4]) : currentYear;
    add(new Date(year, month, day));
  }

  for (const match of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s+(\d{4}))?\b/gi)) {
    const month = months[match[1].toLowerCase()];
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : currentYear;
    add(new Date(year, month, day));
  }

  return results;
}

function parseHistoricalComparison(query) {
  const dates = extractHistoricalDates(query);
  return dates.length >= 2 ? dates.slice(0, 2) : null;
}

function isExactHistoryQuestion(query) {
  const text = normalizeQuery(query);
  return (
    /\b(on\s+)?\d{1,2}(st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(text) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(text) ||
    /\b\d{2}-\d{2}-\d{4}\b/.test(text)
  );
}

function sendError(response, statusCode, message) {
  response.status(statusCode).json({ error: message });
}

function normalizeQueryText(query) {
  return String(query ?? '').trim();
}

function inferAssistantIntent(query) {
  const text = normalizeQueryText(query).toLowerCase();
  if (!text) return 'empty';
  if (text.includes('compare') || text.includes('vs') || text.includes('versus') || text.includes('between')) return 'comparison';
  if (text.includes('report')) return 'report';
  if (text.includes('history') || text.includes('trend') || text.includes('last ') || text.includes('month')) return 'history';
  if (text.includes('capa')) return text.includes('overdue') ? 'capa_overdue' : 'capa';
  if (text.includes('ncr')) return 'ncr';
  if (text.includes('workforce') || text.includes('coverage') || text.includes('operator')) return 'workforce';
  if (text.includes('calibration') || text.includes('instrument')) return 'calibration';
  if (text.includes('supplier')) return 'supplier';
  if (text.includes('quality') || text.includes('defect') || text.includes('scrap')) return 'quality';
  if (text.includes('press') || text.includes('machine')) return 'machine';
  return 'general';
}

function getTelemetryRequestId(request) {
  const headerValue = request.headers['x-request-id'];
  return typeof headerValue === 'string' && headerValue.trim() ? headerValue.trim() : randomUUID();
}

async function buildDashboardContext(shiftName) {
  const dashboard = await getDashboardPayload(shiftName);
  const ncrs = dashboard.ncrs ?? [];
  const allCapas = await listCapas();
  const openNcrs = ncrs.filter((ncr) => ncr.status !== 'Closed');
  const overdueCapas = allCapas.filter((capa) => capa.dueDate < Date.now() && capa.status !== 'Closed');

  return {
    dashboard,
    shift: shiftName,
    summary: dashboard.summary,
    machines: dashboard.presses,
    downtime: dashboard.downtime,
    orders: dashboard.orders ?? [],
    materials: dashboard.materials ?? [],
    defects: dashboard.defects ?? [],
    prevShiftDefects: dashboard.prevShiftDefects ?? [],
    ncrs,
    openNcrs,
    suppliers,
    employees,
    capas: allCapas,
    overdueCapas,
    calibrations,
    alerts: dashboard.alerts ?? []
  };
}

async function buildHistoryContext(shiftName, { summaryDays = 210, eventDays = 30, eventLimit = 120 } = {}) {
  const [historySummary, historyEvents, historyInsights] = await Promise.all([
    listHistorySummary(shiftName, summaryDays),
    listHistoryEvents(shiftName, eventDays, eventLimit),
    listHistoryInsights(shiftName, summaryDays)
  ]);

  return {
    historySummary,
    historyEvents,
    historyInsights
  };
}

async function buildAiContext(shiftName) {
  const [dashboardContext, historyContext] = await Promise.all([
    buildDashboardContext(shiftName),
    buildHistoryContext(shiftName)
  ]);

  return {
    ...dashboardContext,
    ...historyContext
  };
}

function latestUserMessage(messages) {
  if (Array.isArray(messages)) {
    const reversed = [...messages].reverse();
    const entry = reversed.find((message) => typeof message?.content === 'string' && message.content.trim() && String(message?.role ?? '').toLowerCase() === 'user');
    return String(entry?.content ?? '').trim();
  }

  return String(messages ?? '').trim();
}

function normalizeQuery(query) {
  const text = String(query ?? '').toLowerCase();
  return text;
}

function isOverdueCapaQuery(query) {
  const text = normalizeQuery(query);
  return text.includes('capa') && (
    text.includes('overdue') ||
    text.includes('past due') ||
    text.includes('past-due') ||
    text.includes('late') ||
    text.includes('behind schedule')
  );
}

function classifyAssistantTopic(query) {
  const text = normalizeQuery(query);
  if (!text) return 'general';

  const comparisonDates = parseHistoricalComparison(text);
  if (comparisonDates && (
    text.includes('compare') ||
    text.includes('comparison') ||
    text.includes('difference') ||
    text.includes('changed') ||
    text.includes('between') ||
    text.includes('versus') ||
    text.includes('vs')
  )) {
    return 'history-compare';
  }

  if (isExactHistoryQuestion(text)) {
    return 'history-day';
  }

  if (
    text.includes('history') ||
    text.includes('historical') ||
    text.includes('trend') ||
    text.includes('trends') ||
    text.includes('over time') ||
    text.includes('last month') ||
    text.includes('last week') ||
    text.includes('month to date') ||
    text.includes('quarter') ||
    text.includes('6 month') ||
    text.includes('six month') ||
    text.includes('7 month') ||
    text.includes('7 months') ||
    text.includes('8 month') ||
    text.includes('8 months') ||
    text.includes('report') ||
    text.includes('compare') ||
    text.includes('comparison') ||
    text.includes('recurring')
  ) {
    return 'history';
  }

  if (isOverdueCapaQuery(text)) {
    return 'capa-overdue';
  }

  if (text.includes('capa')) return 'capa';
  if (text.includes('ncr')) return 'ncr';
  if (text.includes('workforce') || text.includes('operator') || text.includes('coverage') || text.includes('available') || text.includes('roster') || text.includes('assignment')) return 'workforce';
  if (text.includes('calibration') || text.includes('instrument') || text.includes('calibrat') || text.includes('due soon')) return 'calibration';
  if (text.includes('supplier') || text.includes('material') || text.includes('inventory') || text.includes('vendor')) return 'supplier';
  if (text.includes('quality') || text.includes('defect') || text.includes('scrap') || text.includes('yield') || text.includes('inspection')) return 'quality';
  if (text.includes('alert')) return 'alerts';
  if (text.includes('downtime') || text.includes('oee') || text.includes('machine') || text.includes('press') || text.includes('running')) return 'machine';
  return 'general';
}

function pickAssistantContext(dashboardContext, topic) {
  const base = {
    shift: dashboardContext.shift,
    summary: dashboardContext.summary
  };

  switch (topic) {
    case 'capa':
    case 'capa-overdue':
      return {
        ...base,
        openNcrs: dashboardContext.openNcrs,
        ncrs: dashboardContext.ncrs,
        capas: dashboardContext.capas,
        overdueCapas: dashboardContext.overdueCapas,
        alerts: dashboardContext.alerts,
        machines: dashboardContext.machines
      };
    case 'ncr':
      return {
        ...base,
        ncrs: dashboardContext.ncrs,
        openNcrs: dashboardContext.openNcrs,
        machines: dashboardContext.machines,
        alerts: dashboardContext.alerts
      };
    case 'workforce':
      return {
        ...base,
        employees: dashboardContext.employees,
        machines: dashboardContext.machines
      };
    case 'calibration':
      return {
        ...base,
        calibrations: dashboardContext.calibrations
      };
    case 'supplier':
      return {
        ...base,
        suppliers: dashboardContext.suppliers,
        materials: dashboardContext.materials
      };
    case 'quality':
      return {
        ...base,
        defects: dashboardContext.defects,
        prevShiftDefects: dashboardContext.prevShiftDefects,
        ncrs: dashboardContext.ncrs,
        openNcrs: dashboardContext.openNcrs,
        machines: dashboardContext.machines
      };
    case 'alerts':
      return {
        ...base,
        alerts: dashboardContext.alerts,
        machines: dashboardContext.machines
      };
    case 'machine':
      return {
        ...base,
        machines: dashboardContext.machines,
        downtime: dashboardContext.downtime,
        alerts: dashboardContext.alerts
      };
    default:
      return dashboardContext;
  }
}

function classifyChatScope(query) {
  const topic = classifyAssistantTopic(query);
  return topic === 'history' || topic === 'history-day' || topic === 'history-compare' ? 'history' : 'live';
}

async function buildAssistantContext(shiftName, query) {
  const topic = classifyAssistantTopic(query);
  if (topic === 'history') {
    return {
      ...(await buildAiContext(shiftName)),
      assistantTopic: 'history'
    };
  }

  if (topic === 'history-day') {
    const requestedDate = parseHistoricalDate(query);
    const requestedDateKey = requestedDate ? formatLocalDateKey(requestedDate) : null;
    const historyDay = requestedDateKey ? await getHistoryDay(shiftName, requestedDateKey) : null;
    return {
      ...(await buildDashboardContext(shiftName)),
      assistantTopic: 'history-day',
      requestedDate: requestedDateKey,
      historyDay
    };
  }

  if (topic === 'history-compare') {
    const comparisonDates = parseHistoricalComparison(query);
    const [startDate, endDate] = comparisonDates ?? [];
    const startDateKey = startDate ? formatLocalDateKey(startDate) : null;
    const endDateKey = endDate ? formatLocalDateKey(endDate) : null;
    const [startDay, endDay] = startDate && endDate
      ? await Promise.all([
        getHistoryDay(shiftName, startDateKey),
        getHistoryDay(shiftName, endDateKey)
      ])
      : [null, null];
    return {
      ...(await buildDashboardContext(shiftName)),
      assistantTopic: 'history-compare',
      comparisonDates: comparisonDates ? comparisonDates.map((date) => formatLocalDateKey(date)) : [],
      historyComparison: {
        startDate: startDateKey,
        endDate: endDateKey,
        startDay,
        endDay
      }
    };
  }

  const dashboardContext = await buildDashboardContext(shiftName);
  return {
    ...pickAssistantContext(dashboardContext, topic),
    assistantTopic: topic
  };
}

async function startNotificationBridge() {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    notificationClient = new Client({ connectionString: process.env.DATABASE_URL });
    await notificationClient.connect();
    await notificationClient.query('listen dashboard_update');
    notificationClient.on('notification', (message) => {
      if (message.channel !== 'dashboard_update' || !message.payload) {
        return;
      }

      try {
        const payload = JSON.parse(message.payload);
        if (payload?.shiftName) {
          broadcastDashboardUpdate(payload.shiftName);
        }
      } catch (_error) {
        // Ignore malformed notifications.
      }
    });
    notificationClient.on('error', (error) => {
      console.warn(`Notification bridge error: ${error.message}`);
    });
  } catch (error) {
    console.warn(`Notification bridge unavailable: ${error.message}`);
  }
}

async function streamAiResponse(response, { systemPrompt, userMessage, contextData }) {
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Transfer-Encoding', 'chunked');
  response.setHeader('Cache-Control', 'no-cache');

  try {
    const stream = await streamCompletion({ systemPrompt, userMessage, contextData });
    stream.on('text', (text) => response.write(text));
    stream.on('end', () => response.end());
    stream.on('error', (error) => {
      if (!response.headersSent) {
        sendError(response, 500, error.message);
        return;
      }
      response.end();
    });
  } catch (error) {
    if (error.isFallback) {
      return response.status(503).json({ error: 'AI not configured', fallback: true });
    }
    return sendError(response, 500, error.message);
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/events', async (request, response) => {
  const shiftName = resolveShiftName(request);

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  response.write(`event: ready\ndata: ${JSON.stringify({ shiftName })}\n\n`);

  const unsubscribe = subscribeDashboardUpdates((event) => {
    if (event.shiftName === shiftName) {
      response.write(`event: dashboard:update\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });

  const heartbeat = setInterval(() => {
    response.write(`event: ping\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  }, 25000);

  request.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
  });
});

app.get('/api/shifts', async (_request, response) => {
  const shifts = await getShifts();
  response.json({ shifts });
});

app.get('/api/dashboard', async (request, response) => {
  const shift = resolveShiftName(request);
  const payload = await getDashboardPayload(shift);
  response.json(payload);
});

app.get('/api/presses', async (request, response) => {
  const shift = resolveShiftName(request);
  const presses = await listPresses(shift);
  response.json({ shiftName: shift, presses });
});

app.patch('/api/presses/:pressName', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const pressName = request.params.pressName;
  const { status, oee, outputCount, downtimeMinutes, currentJob } = request.body || {};

  if ([status, oee, outputCount, downtimeMinutes, currentJob].every((value) => value === undefined)) {
    return sendError(response, 400, 'Provide at least one field to update.');
  }

  try {
    const press = await updatePress(shiftName, pressName, {
      status,
      oee,
      outputCount,
      downtimeMinutes,
      currentJob
    });

    if (!press) {
      return sendError(response, 404, 'Press not found for the given shift.');
    }

    const dashboard = await getDashboardPayload(shiftName);
    broadcastDashboardUpdate(shiftName);
    response.json({ message: 'Press updated successfully.', press, dashboard });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

app.patch('/api/dashboard/snapshot', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const {
    plantName,
    overallOee,
    totalOutput,
    goodParts,
    downtimeLabel,
    downtimeMinutes,
    activeAlerts,
    criticalAlerts,
    warningAlerts,
    qualityRate
  } = request.body || {};

  if (
    [plantName, overallOee, totalOutput, goodParts, downtimeLabel, downtimeMinutes, activeAlerts, criticalAlerts, warningAlerts, qualityRate].every(
      (value) => value === undefined
    )
  ) {
    return sendError(response, 400, 'Provide at least one dashboard field to update.');
  }

  try {
    const snapshot = await updateDashboardSnapshot(shiftName, {
      plantName,
      overallOee,
      totalOutput,
      goodParts,
      downtimeLabel,
      downtimeMinutes,
      activeAlerts,
      criticalAlerts,
      warningAlerts,
      qualityRate
    });

    if (!snapshot) {
      return sendError(response, 404, 'Dashboard snapshot not found for the given shift.');
    }

    const dashboard = await getDashboardPayload(shiftName);
    broadcastDashboardUpdate(shiftName);
    response.json({ message: 'Snapshot updated successfully.', snapshot, dashboard });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

app.post('/api/reset', async (request, response) => {
  const explicitShift = request.query.shift?.trim() || request.body?.shiftName?.trim() || null;

  try {
    const result = await resetShift(explicitShift);
    for (const shift of result.reset) {
      broadcastDashboardUpdate(shift);
    }
    response.json({ message: 'Reset complete.', ...result });
  } catch (error) {
    sendError(response, 500, error.message);
  }
});

app.patch('/api/admin/shifts/:shiftName/state', async (request, response) => {
  const shiftName = request.params.shiftName?.trim();
  const {
    snapshot,
    presses,
    downtime,
    trend,
    alerts,
    ncrs,
    capas
  } = request.body || {};

  if (!shiftName) {
    return sendError(response, 400, 'shiftName is required.');
  }

  if (![snapshot, presses, downtime, trend, alerts, ncrs, capas].some((value) => value !== undefined)) {
    return sendError(response, 400, 'Provide at least one field to update.');
  }

  try {
    if (snapshot) {
      await updateDashboardSnapshot(shiftName, snapshot);
    }

    if (Array.isArray(presses)) {
      for (const press of presses) {
        if (!press?.pressName) continue;
        await updatePress(shiftName, press.pressName, press);
      }
    }

    if (downtime || trend) {
      await replaceShiftSeries(shiftName, {
        downtime: Array.isArray(downtime) ? downtime : undefined,
        trend: Array.isArray(trend) ? trend : undefined
      });
    }

    if (Array.isArray(alerts)) {
      await replaceAlerts(shiftName, alerts);
    }

    if (Array.isArray(ncrs)) {
      replaceMergedNcrs(shiftName, ncrs);
    }

    if (Array.isArray(capas)) {
      replaceMergedCapas(capas);
    }

    const dashboard = await getDashboardPayload(shiftName);
    broadcastDashboardUpdate(shiftName);
    response.json({
      message: 'Shift state updated successfully.',
      shiftName,
      dashboard
    });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

app.get('/api/alerts', async (request, response) => {
  const shift = resolveShiftName(request);
  const alerts = await listAlerts(shift);
  response.json({ shiftName: shift, alerts });
});

app.get('/api/ncr', async (request, response) => {
  const shift = resolveShiftName(request);
  const ncrs = await listNcrs(shift);
  response.json({ shiftName: shift, ncrs });
});

app.post('/api/ncr', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const body = request.body || {};
  const { machine, defectType, qtyAffected, description, severity } = body;

  if (!machine || !defectType || !qtyAffected || !description) {
    return sendError(response, 400, 'machine, defectType, qtyAffected, and description are required.');
  }

  const normalizedQty = Number(qtyAffected);
  if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) {
    return sendError(response, 400, 'qtyAffected must be a positive number.');
  }

  const record = {
    id: body.id || `NCR-2024-${String((await listNcrs(shiftName)).length + 44).padStart(4, '0')}`,
    date: body.date ?? Date.now(),
    machine,
    defectType,
    qtyAffected: normalizedQty,
    status: body.status || 'Open',
    assignedTo: body.assignedTo || 'EMP-1055',
    capaId: body.capaId ?? null,
    description,
    severity: severity || 'Medium'
  };

  try {
    const created = await createNcr(shiftName, record);
    broadcastDashboardUpdate(shiftName);
    response.status(201).json({ message: 'NCR created successfully.', ncr: created, mode: 'demo' });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

app.get('/api/capa', async (_request, response) => {
  const capas = await listCapas();
  response.json({ capas });
});

app.post('/api/capa', async (request, response) => {
  const body = request.body || {};

  if (!body.id || !body.ncrId || !body.machine || !body.defectType || !body.issueDescription) {
    return sendError(response, 400, 'id, ncrId, machine, defectType, and issueDescription are required.');
  }

  try {
    const capa = await createCapa({
      ...body,
      openedDate: body.openedDate ?? Date.now(),
      stageHistory: body.stageHistory ?? [{ stage: 'Open', timestamp: body.openedDate ?? Date.now() }]
    });
    response.status(201).json({ message: 'CAPA created successfully.', capa, mode: 'demo' });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

app.patch('/api/capa/:id', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const capaId = request.params.id;
  const body = request.body || {};
  const updates = { ...body };
  delete updates.shiftName;

  try {
    const capa = await updateCapa(capaId, updates);
    if (!capa) {
      return sendError(response, 404, 'CAPA not found.');
    }

    if (capa.status === 'Closed' && capa.ncrId) {
      await updateNcr(shiftName, capa.ncrId, { status: 'Closed' });
    }

    response.json({ message: 'CAPA updated successfully.', capa, mode: 'demo' });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

app.post('/api/ai/quality-analysis', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildDashboardContext(shiftName);
  const summary = request.body?.summary ?? contextData.summary;
  const presses = request.body?.presses ?? contextData.machines ?? [];
  const defects = request.body?.defects ?? contextData.defects ?? [];
  const openNcrs = (contextData.ncrs ?? []).filter((ncr) => ncr.status !== 'Closed');
  const systemPrompt = [
    'You are a manufacturing quality analyst reviewing a live shift.',
    'Write a concise narrative that identifies the highest-risk machine by name and OEE, the defect type trending worst, and one practical recommendation.',
    'Use the live summary, presses, defects, and open NCR context.',
    'Keep the response to 3-4 sentences and avoid generic filler.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: 'Analyze the current shift quality situation.',
    contextData: {
      ...contextData,
      summary,
      presses,
      defects,
      openNcrs,
      requestedFocus: request.body?.focusArea ?? null
    }
  });
});

app.post('/api/ai/supply-scenario', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const dashboard = await buildDashboardContext(shiftName);
  const { scenario, materials, suppliers: requestSuppliers } = request.body || {};
  const scenarioLabels = {
    supplier_delay_2w: 'Key supplier delays delivery by 2 weeks',
    material_drop_50pct: 'Primary material stock drops 50% unexpectedly',
    demand_spike_30pct: 'Production demand spikes 30% next shift'
  };
  const systemPrompt = `You are a manufacturing supply chain analyst. Analyze the operational impact of the given scenario on the plant floor. Identify which machines and orders are affected, how many days of production are at risk, and give one specific mitigation recommendation. Be concise - 3 to 4 sentences. Use material codes and machine names from the data.`;

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: `Scenario: ${scenarioLabels[scenario] ?? 'Unspecified scenario'}`,
    contextData: {
      shiftName,
      materials: materials ?? dashboard.materials,
      suppliers: requestSuppliers ?? dashboard.suppliers
    }
  });
});

app.get('/api/history/summary', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const days = Math.min(Math.max(Number.parseInt(request.query.days || '210', 10) || 210, 7), 365);
  const summary = await listHistorySummary(shiftName, days);
  response.json({ shiftName, days, summary });
});

app.get('/api/history/events', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const days = Math.min(Math.max(Number.parseInt(request.query.days || '30', 10) || 30, 1), 365);
  const limit = Math.min(Math.max(Number.parseInt(request.query.limit || '120', 10) || 120, 10), 500);
  const events = await listHistoryEvents(shiftName, days, limit);
  response.json({ shiftName, days, limit, events });
});

app.get('/api/history/insights', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const days = Math.min(Math.max(Number.parseInt(request.query.days || '210', 10) || 210, 7), 365);
  const insights = await listHistoryInsights(shiftName, days);
  response.json(insights);
});

app.get('/api/history/day', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const dateValue = typeof request.query.date === 'string' ? request.query.date.trim() : '';
  const resolvedDate = dateValue ? parseHistoricalDate(dateValue) : null;
  const resolvedDateKey = resolvedDate ? formatLocalDateKey(resolvedDate) : null;

  if (!resolvedDateKey) {
    return sendError(response, 400, 'Provide a valid date like 2026-06-15 or 15 June.');
  }

  const historyDay = await getHistoryDay(shiftName, resolvedDateKey);
  response.json({
    shiftName,
    date: resolvedDateKey,
    historyDay
  });
});

app.get('/api/history/compare', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const startValue = typeof request.query.start === 'string' ? request.query.start.trim() : '';
  const endValue = typeof request.query.end === 'string' ? request.query.end.trim() : '';
  const startDate = startValue ? parseHistoricalDate(startValue) : null;
  const endDate = endValue ? parseHistoricalDate(endValue) : null;
  const startDateKey = startDate ? formatLocalDateKey(startDate) : null;
  const endDateKey = endDate ? formatLocalDateKey(endDate) : null;

  if (!startDateKey || !endDateKey) {
    return sendError(response, 400, 'Provide two valid dates like 2026-06-15 and 2026-06-16.');
  }

  const [startDay, endDay] = await Promise.all([
    getHistoryDay(shiftName, startDateKey),
    getHistoryDay(shiftName, endDateKey)
  ]);

  response.json({
    shiftName,
    startDate: startDateKey,
    endDate: endDateKey,
    comparison: {
      startDay,
      endDay
    }
  });
});

app.post('/api/ai/shift-optimize', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildDashboardContext(shiftName);
  const employees = request.body?.employees ?? contextData.employees ?? [];
  const presses = request.body?.presses ?? contextData.machines ?? [];
  const orders = request.body?.orders ?? contextData.dashboard.orders ?? [];
  const openNcrs = (contextData.ncrs ?? []).filter((ncr) => ncr.status !== 'Closed');
  const activeAlerts = contextData.alerts ?? [];

  if (!presses.length || !employees.length) {
    return sendError(response, 400, 'presses and employees are required.');
  }

  const systemPrompt = [
    'You are an operations optimization expert for a manufacturing shift.',
    'Recommend how to improve throughput, reduce downtime, and balance machine load.',
    'Name specific operators and machines from the data.',
    'Explain why any recommended donor machine can sustain output without that operator.',
    'Keep the response to 3-4 concise, actionable sentences.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage:
    request.body?.prompt ||
      'Analyze the current shift roster and recommend specific reassignment changes to improve coverage and sustain output.',
    contextData: {
      shift: shiftName,
      summary: contextData.summary,
      historySummary: contextData.historySummary,
      historyInsights: contextData.historyInsights,
      historyEvents: contextData.historyEvents,
      employees,
      presses,
      orders,
      openNcrs,
      activeAlerts
    }
  });
});

app.post('/api/ai/anomaly-diagnosis', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildDashboardContext(shiftName);
  const { machine, metric, currentOee, trend } = request.body || {};

  if (!machine || !metric) {
    return sendError(response, 400, 'machine and metric are required.');
  }

  const systemPrompt = [
    'You are a maintenance engineer.',
    'Given a machine anomaly, explain what the pattern is likely caused by and what to physically inspect.',
    'Be specific. Answer in 2-3 sentences.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: `Machine: ${machine}. Anomaly: ${metric}. Current OEE: ${currentOee ?? 'n/a'}%. Trend: ${(trend ?? []).join(', ')}%.`,
    contextData: {
      ...contextData,
      anomaly: {
        machine,
        metric,
        currentOee,
        trend: trend ?? []
      }
    }
  });
});

app.post('/api/ai/root-cause', async (request, response) => {
  const { capaId, machine, defectType, issueDescription, previousCapas } = request.body || {};

  if (!capaId || !machine || !defectType || !issueDescription) {
    return sendError(response, 400, 'capaId, machine, defectType, and issueDescription are required.');
  }

  const systemPrompt = [
    'You are a quality engineer performing a 5-Why root cause analysis. Format your response exactly as follows, with each on its own line:',
    'Why 1: [observation]',
    'Why 2: [deeper cause]',
    'Why 3: [deeper cause]',
    'Why 4: [deeper cause]',
    'Why 5: [deepest cause]',
    'Root Cause: [concise statement]',
    'Use the machine name and defect type from the data. Be specific and technical.'
  ].join('\n');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: `Analyze CAPA ${capaId} for ${machine} and ${defectType}. Issue: ${issueDescription}.`,
    contextData: {
      capaId,
      machine,
      defectType,
      issueDescription,
      previousCapas: previousCapas ?? (await listCapas())
    }
  });
});

app.post('/api/ai/chat', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const userMessage = latestUserMessage(request.body?.messages ?? request.body?.message ?? request.body?.query);
  const requestId = getTelemetryRequestId(request);
  const startedAt = Date.now();
  const activeTab = typeof request.body?.activeTab === 'string' ? request.body.activeTab.trim() : null;
  response.setHeader('X-Request-Id', requestId);
  await startAiInteraction({
    requestId,
    endpoint: '/api/ai/chat',
    shiftName,
    activeTab,
    rawQuery: userMessage,
    normalizedQuery: normalizeQueryText(userMessage),
    intent: inferAssistantIntent(userMessage),
    responseStatus: 'started'
  });
  const retrieval = await resolveRetrievalAnswer({ query: userMessage, shiftName });

  if (retrieval?.answer) {
    await finishAiInteraction(requestId, {
      responseStatus: 'success',
      fallbackUsed: false,
      retrievalSource: retrieval.source ?? null,
      retrievalQueryType: retrieval.queryType ?? null,
      sqlText: retrieval.sql ?? null,
      responsePreview: retrieval.answer,
      responseLength: retrieval.answer.length,
      latencyMs: Date.now() - startedAt
    });
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache');
    response.send(retrieval.answer);
    return;
  }

  const contextData = await buildAssistantContext(shiftName, userMessage);
  response.once('finish', () => {
    void finishAiInteraction(requestId, {
      responseStatus: response.statusCode >= 400 ? 'error' : 'success',
      fallbackUsed: true,
      latencyMs: Date.now() - startedAt
    });
  });
  const systemPrompt = [
    'You are an operations intelligence assistant for a manufacturing facility.',
    'You have real-time access to the current shift operational and compliance data provided below.',
    "Refer to production units as 'machines' unless the data labels them otherwise.",
    'Be concise. Answer in 2-4 sentences unless asked for more detail.',
    'Do not mention that you are an AI, do not reference JSON or data structures.'
  ].join(' ');

  try {
    return await streamAiResponse(response, {
      systemPrompt,
      userMessage: request.body?.messages ?? [],
      contextData
    });
  } catch (error) {
    await finishAiInteraction(requestId, {
      responseStatus: 'error',
      fallbackUsed: true,
      latencyMs: Date.now() - startedAt,
      responsePreview: error instanceof Error ? error.message : 'Assistant stream failed'
    });
    throw error;
  }
});

app.post('/api/ai/query', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const queryText = latestUserMessage(request.body?.messages ?? request.body?.message ?? request.body?.query);
  const requestId = getTelemetryRequestId(request);
  const startedAt = Date.now();
  const activeTab = typeof request.body?.activeTab === 'string' ? request.body.activeTab.trim() : null;
  await startAiInteraction({
    requestId,
    endpoint: '/api/ai/query',
    shiftName,
    activeTab,
    rawQuery: queryText,
    normalizedQuery: normalizeQueryText(queryText),
    intent: inferAssistantIntent(queryText),
    responseStatus: 'started'
  });
  const retrieval = await resolveRetrievalAnswer({ query: queryText, shiftName });

  if (!retrieval) {
    await recordAiFailure({
      requestId,
      failureType: 'no_match',
      failureReason: 'No retrieval path matched the query.',
      rawQuery: queryText,
      normalizedQuery: normalizeQueryText(queryText),
      shiftName,
      activeTab,
      severity: 'medium',
      status: 'open'
    });
    await finishAiInteraction(requestId, {
      responseStatus: 'no_match',
      fallbackUsed: false,
      latencyMs: Date.now() - startedAt
    });
    return response.status(404).json({ handled: false, requestId, error: 'No retrieval path matched the query.' });
  }

  await finishAiInteraction(requestId, {
    responseStatus: 'success',
    fallbackUsed: false,
    retrievalSource: retrieval.source ?? null,
    retrievalQueryType: retrieval.queryType ?? null,
    sqlText: retrieval.sql ?? null,
    responsePreview: retrieval.answer,
    responseLength: retrieval.answer.length,
    latencyMs: Date.now() - startedAt
  });
  response.json({
    handled: true,
    requestId,
    shiftName,
    query: queryText,
    source: retrieval.source ?? 'retrieval',
    queryType: retrieval.queryType ?? null,
    label: retrieval.label ?? null,
    explanation: retrieval.explanation ?? null,
    sql: retrieval.sql ?? null,
    answer: retrieval.answer
  });
});

app.post('/api/ai/shift-report', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const reportDateValue = typeof request.body?.reportDate === 'string' ? request.body.reportDate.trim() : '';
  const reportDate = reportDateValue ? resolveReportDateValue(reportDateValue) : null;
  const reportDateKey = reportDate ? formatLocalDateKey(reportDate) : null;
  const [dashboardContext, historyContext] = await Promise.all([
    buildDashboardContext(shiftName),
    buildHistoryContext(shiftName)
  ]);
  const [historyDay, reportDayEvents] = reportDateKey
    ? await Promise.all([
      getHistoryDay(shiftName, reportDateKey),
      listHistoryEventsForDay(shiftName, reportDateKey)
    ])
    : [null, []];
  const systemPrompt = `You are a manufacturing shift supervisor writing a formal shift handover report.
Structure your response with exactly these four section headers on their own lines:
### PERFORMANCE SUMMARY
### ISSUES & ACTIONS
### HANDOVER NOTES
### RECOMMENDATIONS
Each section: 2-4 sentences. Use real machine names, order numbers, and quantities from the data.
Do not mention AI, data structures, or JSON.`;

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: reportDate
      ? `Write a daily shift report for ${shiftName} on ${reportDateKey}.`
      : `Write a shift handover report for ${shiftName}.`,
    contextData: {
      ...dashboardContext,
      ...historyContext,
      shiftName,
      reportDate: reportDateKey,
      historyDay,
      reportDayEvents,
      strictHistoryReport: Boolean(reportDateKey)
    }
  });
});

app.post('/api/reports/daily', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const requestId = getTelemetryRequestId(request);
  const startedAt = Date.now();
  const reportDateValue = typeof request.body?.reportDate === 'string' ? request.body.reportDate.trim() : '';
  const reportDate = reportDateValue ? resolveReportDateValue(reportDateValue) : null;
  const reportDateKey = reportDate ? formatLocalDateKey(reportDate) : null;
  await startAiInteraction({
    requestId,
    endpoint: '/api/reports/daily',
    shiftName,
    activeTab: 'Reports',
    rawQuery: `Generate report for ${reportDateValue || 'today'}`,
    normalizedQuery: `Generate report for ${reportDateValue || 'today'}`,
    intent: 'report',
    responseStatus: 'started'
  });

  if (!reportDateKey) {
    await recordAiFailure({
      requestId,
      failureType: 'invalid_date',
      failureReason: 'Provide a valid reportDate like 2026-06-15 or 15 June.',
      rawQuery: reportDateValue || '',
      normalizedQuery: reportDateValue || '',
      shiftName,
      activeTab: 'Reports',
      severity: 'medium',
      status: 'open'
    });
    await finishAiInteraction(requestId, {
      responseStatus: 'invalid_date',
      fallbackUsed: false,
      latencyMs: Date.now() - startedAt
    });
    return response.status(400).json({
      requestId,
      error: 'Provide a valid reportDate like 2026-06-15 or 15 June.'
    });
  }

  const [historyDay, reportDayEvents] = await Promise.all([
    getHistoryDay(shiftName, reportDateKey),
    listHistoryEventsForDay(shiftName, reportDateKey)
  ]);

  if (!historyDay) {
    await recordAiFailure({
      requestId,
      failureType: 'no_data',
      failureReason: `No historical data found for ${shiftName} on ${reportDateKey}.`,
      rawQuery: reportDateValue || '',
      normalizedQuery: reportDateValue || '',
      shiftName,
      activeTab: 'Reports',
      severity: 'medium',
      status: 'open',
      expectedAnswer: 'A report should be available for this selected date if the history table contains a matching row.'
    });
    await finishAiInteraction(requestId, {
      responseStatus: 'no_data',
      fallbackUsed: false,
      latencyMs: Date.now() - startedAt
    });
    return response.status(404).json({
      requestId,
      error: `No historical data found for ${shiftName} on ${reportDateKey}.`
    });
  }

  const reportText = buildDailyReportText({
    shiftName,
    reportDate: reportDateKey,
    historyDay,
    reportDayEvents,
    strictHistoryReport: true
  });
  await finishAiInteraction(requestId, {
    responseStatus: 'success',
    fallbackUsed: false,
    responsePreview: reportText,
    responseLength: reportText.length,
    latencyMs: Date.now() - startedAt
  });

  response.json({
    requestId,
    shiftName,
    reportDate: reportDateKey,
    historyDay,
    reportDayEvents,
    reportText
  });
});

app.post('/api/ai/feedback', async (request, response) => {
  const requestId = typeof request.body?.requestId === 'string' && request.body.requestId.trim() ? request.body.requestId.trim() : randomUUID();
  const shiftName = typeof request.body?.shiftName === 'string' && request.body.shiftName.trim() ? request.body.shiftName.trim() : resolveShiftName(request);
  const activeTab = typeof request.body?.activeTab === 'string' ? request.body.activeTab.trim() : null;
  const rating = Number(request.body?.rating);
  const comment = typeof request.body?.comment === 'string' ? request.body.comment.trim() : '';
  const correctAnswer = typeof request.body?.correctAnswer === 'string' ? request.body.correctAnswer.trim() : '';
  const rawQuery = typeof request.body?.rawQuery === 'string' ? request.body.rawQuery.trim() : '';
  const source = typeof request.body?.source === 'string' ? request.body.source.trim() : null;
  const queryType = typeof request.body?.queryType === 'string' ? request.body.queryType.trim() : null;

  await recordAiFeedback({
    requestId,
    rating,
    comment,
    correctAnswer,
    shiftName,
    activeTab,
    rawQuery,
    source,
    queryType
  });

  response.json({
    ok: true,
    requestId,
    recorded: true
  });
});

app.get('/api/admin/ai-gaps', async (request, response) => {
  const limit = Math.max(1, Math.min(200, Number.parseInt(request.query.limit ?? '50', 10) || 50));
  const status = typeof request.query.status === 'string' && request.query.status.trim() ? request.query.status.trim() : null;
  const gaps = await listRetrievalGaps({ status, limit });
  response.json({ gaps });
});

app.post('/api/admin/ai-gaps/analyze', async (request, response) => {
  const days = Math.max(1, Math.min(365, Number.parseInt(request.body?.days ?? request.query.days ?? '30', 10) || 30));
  const minCount = Math.max(1, Number.parseInt(request.body?.minCount ?? request.query.minCount ?? '2', 10) || 2);
  const gaps = await analyzeAiFailures({ days, minCount });
  response.json({
    ok: true,
    days,
    minCount,
    gaps
  });
});

app.post('/api/admin/ai-gaps/:id/propose', async (request, response) => {
  const gapId = Number.parseInt(request.params.id, 10);
  if (!Number.isFinite(gapId)) {
    return sendError(response, 400, 'Invalid gap id.');
  }

  const patchJson = request.body?.patchJson ?? request.body?.proposal ?? null;
  const testJson = request.body?.testJson ?? request.body?.tests ?? null;
  const gap = await proposeRetrievalGap(gapId, patchJson, testJson);
  if (!gap) {
    return sendError(response, 404, 'Gap not found.');
  }

  response.json({ ok: true, gap });
});

app.post('/api/admin/ai-gaps/:id/approve', async (request, response) => {
  const gapId = Number.parseInt(request.params.id, 10);
  if (!Number.isFinite(gapId)) {
    return sendError(response, 400, 'Invalid gap id.');
  }

  const gap = await approveRetrievalGap(gapId);
  if (!gap) {
    return sendError(response, 404, 'Gap not found.');
  }

  response.json({ ok: true, gap });
});

app.post('/api/alerts', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const { severity, title, message, isActive } = request.body || {};

  if (!title || !message) {
    return sendError(response, 400, 'title and message are required.');
  }

  try {
    const alert = await createAlert(shiftName, { severity, title, message, isActive });
    const dashboard = await getDashboardPayload(shiftName);
    broadcastDashboardUpdate(shiftName);
    response.status(201).json({ message: 'Alert created successfully.', alert, dashboard });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

app.delete('/api/alerts/:id', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const alertId = Number(request.params.id);

  if (!Number.isFinite(alertId)) {
    return sendError(response, 400, 'Invalid alert id.');
  }

  try {
    const deleted = await deleteAlert(shiftName, alertId);
    if (!deleted) {
      return sendError(response, 404, 'Alert not found for the given shift.');
    }

    const dashboard = await getDashboardPayload(shiftName);
    broadcastDashboardUpdate(shiftName);
    response.json({ message: 'Alert deleted successfully.', alert: deleted, dashboard });
  } catch (error) {
    sendError(response, 400, error.message);
  }
});

await startNotificationBridge();

const canServeClient = await access(clientDist).then(() => true).catch(() => false);

if (canServeClient) {
  app.use(express.static(clientDist));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
