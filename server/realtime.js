import { EventEmitter } from 'node:events';

const dashboardEvents = new EventEmitter();

export function broadcastDashboardUpdate(shiftName) {
  dashboardEvents.emit('dashboard:update', { shiftName });
}

export function subscribeDashboardUpdates(handler) {
  dashboardEvents.on('dashboard:update', handler);
  return () => dashboardEvents.off('dashboard:update', handler);
}
