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
