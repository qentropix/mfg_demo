import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  createAlert,
  getDashboardPayload,
  getShifts,
  listAlerts,
  listPresses,
  resetShift,
  updateDashboardSnapshot,
  updatePress
} from './dashboardRepository.js';
import { streamCompletion } from './aiService.js';
import { capas as demoCapas, calibrations, employees, suppliers } from './demoData.js';
import { broadcastDashboardUpdate, subscribeDashboardUpdates } from './realtime.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const clientDist = path.resolve(__dirname, '..', 'dist');

app.use(cors());
app.use(express.json());

function resolveShiftName(request) {
  return typeof request.query.shift === 'string' && request.query.shift.trim()
    ? request.query.shift.trim()
    : typeof request.body?.shiftName === 'string' && request.body.shiftName.trim()
      ? request.body.shiftName.trim()
      : 'Shift A';
}

function sendError(response, statusCode, message) {
  response.status(statusCode).json({ error: message });
}

async function buildAiContext(shiftName) {
  const dashboard = await getDashboardPayload(shiftName);
  const openNcrs = (dashboard.ncrs ?? []).filter((ncr) => ncr.status !== 'Closed');
  const overdueCapas = demoCapas.filter((capa) => capa.dueDate < Date.now() && capa.status !== 'Closed');

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
    ncrs: dashboard.ncrs ?? [],
    openNcrs,
    suppliers,
    employees,
    capas: demoCapas,
    overdueCapas,
    calibrations,
    alerts: dashboard.alerts ?? []
  };
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

app.get('/api/alerts', async (request, response) => {
  const shift = resolveShiftName(request);
  const alerts = await listAlerts(shift);
  response.json({ shiftName: shift, alerts });
});

app.post('/api/ai/quality-analysis', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildAiContext(shiftName);
  const systemPrompt = [
    'You are a quality engineer analyzing manufacturing performance for the current shift.',
    'Summarize the main quality issue, likely causes, and next actions.',
    'Use machine names and defect types from the data.',
    'Keep the response concise and practical.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: request.body?.prompt || 'Analyze the current shift quality situation.',
    contextData: {
      ...contextData,
      requestedFocus: request.body?.focusArea ?? null
    }
  });
});

app.post('/api/ai/supply-scenario', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const dashboard = await buildAiContext(shiftName);
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

app.post('/api/ai/shift-optimize', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildAiContext(shiftName);
  const systemPrompt = [
    'You are an operations optimization expert for a manufacturing shift.',
    'Recommend how to improve throughput, reduce downtime, and balance machine load.',
    'Mention the most important machine and job priorities.',
    'Keep the response concise and actionable.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: request.body?.prompt || 'Optimize the current shift.',
    contextData
  });
});

app.post('/api/ai/anomaly-diagnosis', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildAiContext(shiftName);
  const systemPrompt = [
    'You are a manufacturing anomaly analyst.',
    'Diagnose the anomaly using machine, downtime, NCR, and trend data.',
    'Identify the most probable causes and what should be checked next.',
    'Keep the response concise and technical.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: request.body?.anomaly || 'Diagnose the current anomaly.',
    contextData
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
      previousCapas: previousCapas ?? demoCapas
    }
  });
});

app.post('/api/ai/chat', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildAiContext(shiftName);
  const systemPrompt = [
    'You are an operations intelligence assistant for a manufacturing facility.',
    'You have real-time access to the current shift operational and compliance data provided below.',
    "Refer to production units as 'machines' unless the data labels them otherwise.",
    'Be concise. Answer in 2-4 sentences unless asked for more detail.',
    'Do not mention that you are an AI, do not reference JSON or data structures.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: request.body?.messages ?? [],
    contextData
  });
});

app.post('/api/ai/shift-report', async (request, response) => {
  const shiftName = resolveShiftName(request);
  const contextData = await buildAiContext(shiftName);
  const systemPrompt = [
    'You are a shift handover analyst generating an operations report.',
    'Summarize production, quality, downtime, risks, and next-shift priorities.',
    'Use clear headings and keep it concise but useful for supervisors.'
  ].join(' ');

  return streamAiResponse(response, {
    systemPrompt,
    userMessage: request.body?.prompt || 'Write the current shift handover report.',
    contextData
  });
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
