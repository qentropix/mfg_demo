import { useEffect, useMemo, useState } from 'react';

function statusTone(status) {
  if (status === 'Expired') return 'danger';
  if (status === 'Expiring Soon') return 'warning';
  return 'success';
}

function getStatus(cert) {
  if (cert.status === 'Expired') return 'Expired';
  const daysToExpiry = (cert.expiryDate - Date.now()) / 86400000;
  if (daysToExpiry > 0 && daysToExpiry <= 30 && cert.status !== 'Expired') return 'Expiring Soon';
  return 'Current';
}

function LogTrainingModal({ employee, onClose, onLogTraining }) {
  const [certName, setCertName] = useState('');
  const [completionDate, setCompletionDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [issuedBy, setIssuedBy] = useState('');

  useEffect(() => {
    if (!employee) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [employee, onClose]);

  if (!employee) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    const completionMs = new Date(completionDate).getTime();
    const expiryMs = new Date(expiryDate).getTime();
    if (!certName.trim() || !Number.isFinite(completionMs) || !Number.isFinite(expiryMs) || !issuedBy.trim()) return;

    onLogTraining(employee.id, {
      name: certName.trim(),
      issuedDate: completionMs,
      expiryDate: expiryMs,
      issuedBy: issuedBy.trim(),
      status: expiryMs > Date.now() ? 'Current' : 'Expired'
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-modal certification-log-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2>Log Training</h2>
          <button className="panel-close" type="button" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <form className="scenario-form" onSubmit={handleSubmit}>
          <label className="scenario-field">
            <span>Employee</span>
            <input type="text" value={`${employee.name} (${employee.id})`} readOnly />
          </label>
          <label className="scenario-field">
            <span>Certification Name</span>
            <input type="text" value={certName} onChange={(event) => setCertName(event.target.value)} />
          </label>
          <label className="scenario-field">
            <span>Completion Date</span>
            <input type="date" value={completionDate} onChange={(event) => setCompletionDate(event.target.value)} />
          </label>
          <label className="scenario-field">
            <span>Expiry Date</span>
            <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
          </label>
          <label className="scenario-field">
            <span>Issued By</span>
            <input type="text" value={issuedBy} onChange={(event) => setIssuedBy(event.target.value)} placeholder="Internal QA" />
          </label>
          <button
            type="submit"
            className="btn-primary"
            disabled={!certName.trim() || !completionDate || !expiryDate || !issuedBy.trim()}
          >
            Save Training
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CertificationPanel({ employee, onClose, onLogTraining }) {
  const [logTrainingOpen, setLogTrainingOpen] = useState(false);

  useEffect(() => {
    if (!employee) {
      setLogTrainingOpen(false);
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [employee, onClose]);

  const sortedCerts = useMemo(
    () =>
      [...(employee?.certifications ?? [])].sort((a, b) => {
        const statusOrder = { Expired: 0, 'Expiring Soon': 1, Current: 2 };
        const statusA = getStatus(a);
        const statusB = getStatus(b);
        if (statusA !== statusB) return statusOrder[statusA] - statusOrder[statusB];
        return a.name.localeCompare(b.name);
      }),
    [employee]
  );

  if (!employee) return null;

  const rowStatus = getStatus(employee);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="press-panel certification-panel" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" type="button" onClick={onClose} aria-label="Close panel">
          x
        </button>

        <div className="press-panel-header">
          <h2 className="press-panel-name">{employee.name}</h2>
          <span className={`badge tone-${statusTone(rowStatus)}`}>{rowStatus}</span>
        </div>

        <div className="press-panel-oee-row certification-header-row">
          <div className="cert-avatar">{employee.name.slice(0, 1)}</div>
          <div className="press-panel-kpis">
            <div className="press-panel-kpi">
              <span>Employee ID</span>
              <strong>{employee.id}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Role</span>
              <strong>{employee.role}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Assigned Machine</span>
              <strong>{employee.assignedMachine}</strong>
            </div>
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Certifications</h4>
          <div className="cert-list">
            {sortedCerts.map((cert) => (
              <article key={cert.name} className="cert-row">
                <div>
                  <strong>{cert.name}</strong>
                  <span>
                    Issued {new Date(cert.issuedDate).toLocaleDateString()} by {cert.issuedBy ?? 'Internal QA'}
                  </span>
                </div>
                <div className="cert-row-side">
                  <span className={`badge tone-${statusTone(getStatus(cert))}`}>{getStatus(cert)}</span>
                  <small>Expires {new Date(cert.expiryDate).toLocaleDateString()}</small>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="calibration-actions">
          <button type="button" className="btn-primary" onClick={() => setLogTrainingOpen(true)}>
            Log Training
          </button>
        </div>

        {logTrainingOpen ? (
          <LogTrainingModal
            employee={employee}
            onClose={() => setLogTrainingOpen(false)}
            onLogTraining={onLogTraining}
          />
        ) : null}
      </aside>
    </div>
  );
}
