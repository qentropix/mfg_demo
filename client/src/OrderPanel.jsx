import { useEffect } from 'react';

function toneForStatus(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes('delayed')) return 'danger';
  if (normalized.includes('risk') || normalized.includes('queued')) return 'warning';
  return 'success';
}

function formatDueDate(dueDate) {
  const now = Date.now();
  const minsRemaining = (dueDate - now) / 60000;
  if (minsRemaining > 0) {
    const hours = Math.floor(minsRemaining / 60);
    const minutes = Math.floor(minsRemaining % 60);
    return `Due in ${hours}h ${minutes}m`;
  }
  const overdueMins = Math.abs(Math.floor(minsRemaining));
  const hours = Math.floor(overdueMins / 60);
  const minutes = overdueMins % 60;
  return `Overdue by ${hours}h ${minutes}m`;
}

export default function OrderPanel({ order, press, ncrs, onClose }) {
  useEffect(() => {
    if (!order) return;
    const handle = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [order, onClose]);

  if (!order) return null;

  const now = Date.now();
  const minsRemaining = (order.dueDate - now) / 60000;
  const dueLabel = formatDueDate(order.dueDate);
  const liveStatus =
    press?.status !== 'Running'
      ? 'At Risk'
      : minsRemaining < 0
        ? 'Delayed'
        : order.status;
  const tone = toneForStatus(liveStatus);
  const qualityHoldNcrs = ncrs.filter(
    (ncr) => ncr.machine === order.machineAssigned && ncr.status !== 'Closed'
  );

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="order-panel" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">
          x
        </button>

        <div className="order-panel-header">
          <div>
            <h2 className="order-panel-name">{order.id}</h2>
            <p className="order-panel-sub">{order.partName}</p>
          </div>
          <span className={`status-pill tone-${tone}`}>{liveStatus}</span>
        </div>

        <div className="order-panel-grid">
          <div className="order-panel-metric">
            <span>Part Number</span>
            <strong>{order.partNumber}</strong>
          </div>
          <div className="order-panel-metric">
            <span>Machine</span>
            <strong>{order.machineAssigned}</strong>
          </div>
          <div className="order-panel-metric">
            <span>Due</span>
            <strong>{dueLabel}</strong>
          </div>
          <div className="order-panel-metric">
            <span>Ordered</span>
            <strong>{order.qtyOrdered.toLocaleString()}</strong>
          </div>
          <div className="order-panel-metric">
            <span>Produced</span>
            <strong>{order.qtyProduced.toLocaleString()}</strong>
          </div>
          <div className="order-panel-metric">
            <span>Progress</span>
            <strong>{Math.min(100, Math.round((order.qtyProduced / Math.max(order.qtyOrdered, 1)) * 100))}%</strong>
          </div>
        </div>

        <div className="order-panel-section">
          <h4>Live Status</h4>
          <p className="order-panel-note">
            {press?.status !== 'Running'
              ? `The assigned machine is currently ${press?.status.toLowerCase()}, so the order is being treated as at risk.`
              : minsRemaining < 0
                ? 'The due date has passed and the order is flagged as delayed.'
                : 'The order is tracking to plan and the assigned machine is running.'}
          </p>
        </div>

        <div className="order-panel-section">
          <h4>Quality Holds</h4>
          {qualityHoldNcrs.length ? (
            <div className="order-panel-list">
              {qualityHoldNcrs.map((ncr) => (
                <div key={ncr.id} className="order-panel-item">
                  <strong>{ncr.id}</strong>
                  <span>{ncr.defectType}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="order-panel-note">No open NCRs are tied to this machine.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
