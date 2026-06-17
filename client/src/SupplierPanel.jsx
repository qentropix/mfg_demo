import { useEffect, useMemo, useState } from 'react';

function statusTone(status) {
  if (status === 'Suspended') return 'danger';
  if (status === 'Requalification Due') return 'warning';
  return 'success';
}

function getAuditTrend(supplier) {
  const history = [...(supplier?.auditHistory ?? [])]
    .filter((entry) => typeof entry.score === 'number')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (history.length < 2) return 'stable';

  const latest = Number(history[history.length - 1].score);
  const previous = Number(history[history.length - 2].score);
  if (latest < previous) return 'declining';
  if (latest > previous) return 'improving';
  return 'stable';
}

function ScheduleAuditModal({ supplier, onClose, onScheduleAudit }) {
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!supplier) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [supplier, onClose]);

  if (!supplier) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!scheduledDate) return;
    onScheduleAudit(supplier.id, scheduledDate, notes.trim());
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-modal supplier-schedule-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2>Schedule Audit</h2>
          <button className="panel-close" type="button" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <form className="scenario-form" onSubmit={handleSubmit}>
          <label className="scenario-field">
            <span>Supplier</span>
            <input type="text" value={`${supplier.name} (${supplier.id})`} readOnly />
          </label>
          <label className="scenario-field">
            <span>Audit Date</span>
            <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
          </label>
          <label className="scenario-field">
            <span>Notes</span>
            <textarea
              rows="4"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Scope, auditor, or focus area"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={!scheduledDate}>
            Save Audit
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SupplierPanel({ supplier, onClose, onStatusChange, onScheduleAudit }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    if (!supplier) {
      setScheduleOpen(false);
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [supplier, onClose]);

  const auditTrend = useMemo(() => getAuditTrend(supplier), [supplier]);

  if (!supplier) return null;

  const nextAction = supplier.status === 'Suspended' ? 'Approve' : 'Put On Hold';
  const nextStatus = supplier.status === 'Suspended' ? 'Approved' : 'Suspended';

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="press-panel supplier-panel" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" type="button" onClick={onClose} aria-label="Close panel">
          x
        </button>

        <div className="press-panel-header">
          <h2 className="press-panel-name">{supplier.name}</h2>
          <span className={`badge tone-${statusTone(supplier.status)}`}>{supplier.status}</span>
        </div>

        <div className="press-panel-oee-row supplier-header-row">
          <div className="supplier-avatar">{supplier.name.slice(0, 1)}</div>
          <div className="press-panel-kpis">
            <div className="press-panel-kpi">
              <span>Supplier ID</span>
              <strong>{supplier.id}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Risk Level</span>
              <strong>{supplier.riskLevel}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Lead Time</span>
              <strong>{supplier.leadTimeDays} days</strong>
            </div>
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Supplier Details</h4>
          <div className="supplier-detail-list">
            <div>
              <span>Materials</span>
              <strong>{supplier.materials.join(', ')}</strong>
            </div>
            <div>
              <span>Audit Score</span>
              <strong>{supplier.auditScore}</strong>
            </div>
            <div>
              <span>Next Requalification</span>
              <strong>{new Date(supplier.nextRequalDate).toLocaleDateString()}</strong>
            </div>
            <div>
              <span>Contact</span>
              <strong>
                {supplier.contact?.name ?? supplier.contact?.email ?? 'Unassigned'}
              </strong>
            </div>
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Audit History</h4>
          {auditTrend === 'declining' ? <div className="supplier-warning">↓ Declining audit trend</div> : null}
          <div className="supplier-audit-list">
            {[...(supplier.auditHistory ?? [])]
              .slice()
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((entry, index) => (
                <article key={`${entry.date}-${index}`} className="supplier-audit-row">
                  <div>
                    <strong>{new Date(entry.date).toLocaleDateString()}</strong>
                    <span>{entry.note}</span>
                  </div>
                  <div className="supplier-audit-side">
                    {typeof entry.score === 'number' ? <strong>{entry.score}</strong> : <strong>Pending</strong>}
                    <small>{entry.type ?? 'Audit'}</small>
                  </div>
                </article>
              ))}
          </div>
        </div>

        <div className="supplier-actions">
          <button type="button" className="btn-secondary" onClick={() => onStatusChange(supplier.id, nextStatus)}>
            {nextAction}
          </button>
          <button type="button" className="btn-primary" onClick={() => setScheduleOpen(true)}>
            Schedule Audit
          </button>
        </div>

        {scheduleOpen ? (
          <ScheduleAuditModal
            supplier={supplier}
            onClose={() => setScheduleOpen(false)}
            onScheduleAudit={onScheduleAudit}
          />
        ) : null}
      </aside>
    </div>
  );
}
