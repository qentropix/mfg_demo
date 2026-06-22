import { useEffect, useState } from 'react';

function toneForStatus(status) {
  if (status === 'Overdue') return 'danger';
  if (status === 'Due Soon') return 'warning';
  return 'success';
}

function CertificateModal({ instrument, onClose }) {
  if (!instrument) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="cert-card" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" type="button" onClick={onClose} aria-label="Close certificate">
          x
        </button>
        <h2>CALIBRATION CERTIFICATE</h2>
        <div className="cert-number">{instrument.certNumber}</div>
        <dl className="cert-details">
          <dt>Instrument</dt>
          <dd>{instrument.name} ({instrument.assetTag})</dd>
          <dt>Calibration Date</dt>
          <dd>{new Date(instrument.lastCalibrated).toLocaleDateString()}</dd>
          <dt>Next Due</dt>
          <dd>{new Date(instrument.nextDue).toLocaleDateString()}</dd>
          <dt>Issued By</dt>
          <dd>{instrument.calibratedBy}</dd>
          <dt>Outcome</dt>
          <dd>
            <span className={`badge tone-${instrument.results?.outcome === 'Pass' ? 'success' : 'danger'}`}>
              {instrument.results?.outcome ?? 'N/A'}
            </span>
          </dd>
        </dl>
        <button type="button" className="btn-secondary cert-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function ScheduleModal({ instrument, onClose, onSchedule }) {
  const [scheduledDate, setScheduledDate] = useState('');
  const [provider, setProvider] = useState('');
  const [type, setType] = useState('Internal');

  useEffect(() => {
    if (!instrument) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [instrument, onClose]);

  if (!instrument) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!scheduledDate || !provider.trim()) return;
    onSchedule({
      instrument,
      scheduledDate: new Date(scheduledDate).getTime(),
      provider: provider.trim(),
      type
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-modal calibration-schedule-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2>Schedule Recalibration</h2>
          <button className="panel-close" type="button" onClick={onClose} aria-label="Close schedule modal">
            x
          </button>
        </div>

        <form className="scenario-form" onSubmit={handleSubmit}>
          <label className="scenario-field">
            <span>Instrument</span>
            <input type="text" value={`${instrument.assetTag} - ${instrument.name}`} readOnly />
          </label>
          <label className="scenario-field">
            <span>Scheduled Date</span>
            <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
          </label>
          <label className="scenario-field">
            <span>Provider</span>
            <input type="text" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Internal QA or vendor name" />
          </label>
          <div className="ncr-severity-group">
            <span className="scenario-field-label">Type</span>
            <label>
              <input type="radio" name={`calibrationType-${instrument.assetTag}`} value="Internal" checked={type === 'Internal'} onChange={(event) => setType(event.target.value)} />
              Internal
            </label>
            <label>
              <input type="radio" name={`calibrationType-${instrument.assetTag}`} value="External" checked={type === 'External'} onChange={(event) => setType(event.target.value)} />
              External
            </label>
          </div>
          <button type="submit" className="btn-primary" disabled={!scheduledDate || !provider.trim()}>
            Schedule
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CalibrationPanel({ instrument, onClose, onSchedule }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);

  useEffect(() => {
    if (!instrument) {
      setScheduleOpen(false);
      setCertOpen(false);
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [instrument, onClose]);

  const tone = toneForStatus(instrument?.status ?? 'Current');

  if (!instrument) return null;

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="press-panel calibration-panel" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" type="button" onClick={onClose} aria-label="Close panel">
          x
        </button>

        <div className="press-panel-header">
          <h2 className="press-panel-name">
            {instrument.assetTag} - {instrument.name}
          </h2>
          <span className={`status-pill tone-${tone}`}>{instrument.status}</span>
        </div>

        <div className="press-panel-oee-row">
          <div className={`calibration-status-card tone-${tone}`}>
            <span>Status</span>
            <strong>{instrument.status}</strong>
            <small>{instrument.status === 'Overdue'
              ? 'Calibration needs immediate attention'
              : instrument.status === 'Due Soon'
                ? 'Calibration window is approaching'
                : 'Calibration is current and valid'}</small>
          </div>
          <div className="press-panel-kpis">
            <div className="press-panel-kpi">
              <span>Type</span>
              <strong>{instrument.type}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Location</span>
              <strong>{instrument.location}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Interval</span>
              <strong>{instrument.intervalDays} days</strong>
            </div>
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Last Calibration</h4>
          <dl className="calibration-detail-list">
            <dt>Date</dt>
            <dd>{new Date(instrument.lastCalibrated).toLocaleDateString()}</dd>
            <dt>Performed By</dt>
            <dd>{instrument.calibratedBy}</dd>
            <dt>Cert Number</dt>
            <dd className="mono">{instrument.certNumber}</dd>
            <dt>Result</dt>
            <dd>
              {instrument.results?.measured ?? 'N/A'} {instrument.results?.tolerance ? `(tolerance ${instrument.results.tolerance})` : ''}
            </dd>
            <dt>Outcome</dt>
            <dd>
              <span className={`badge tone-${instrument.results?.outcome === 'Pass' ? 'success' : 'danger'}`}>
                {instrument.results?.outcome ?? 'N/A'}
              </span>
            </dd>
          </dl>
        </div>

        <div className="calibration-actions">
          <button type="button" className="btn-primary" onClick={() => setCertOpen(true)}>
            View Certificate
          </button>
          <button type="button" className="btn-secondary" onClick={() => setScheduleOpen(true)}>
            Schedule Recalibration
          </button>
        </div>

        <div className="press-panel-section">
          <h4>Next Step</h4>
          <p className="press-panel-note">
            {instrument.status === 'Overdue'
              ? 'Calibration is overdue. Schedule immediately and hold the instrument from use until verified.'
              : instrument.status === 'Due Soon'
                ? 'Calibration is due soon. Lock in a slot before the interval expires.'
                : 'Instrument is current and ready for use.'}
          </p>
        </div>

        {certOpen ? <CertificateModal instrument={instrument} onClose={() => setCertOpen(false)} /> : null}
        {scheduleOpen ? (
          <ScheduleModal
            instrument={instrument}
            onClose={() => setScheduleOpen(false)}
            onSchedule={onSchedule}
          />
        ) : null}
      </aside>
    </div>
  );
}
