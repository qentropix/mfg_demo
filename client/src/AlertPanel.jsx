import { useEffect, useMemo, useState } from 'react';

function toneForSeverity(severity) {
  return severity === 'critical' ? 'danger' : 'warning';
}

export default function AlertPanel({ alert, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!alert) {
      setDeleting(false);
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [alert, onClose]);

  const severityLabel = useMemo(() => {
    if (!alert) return '';
    return alert.severity === 'critical' ? 'Critical Alert' : 'Warning Alert';
  }, [alert]);

  if (!alert) return null;

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(alert);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="press-panel alert-panel" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" type="button" onClick={onClose} aria-label="Close alert panel">
          x
        </button>

        <div className="press-panel-header">
          <h2 className="press-panel-name">{alert.title}</h2>
          <span className={`badge tone-${toneForSeverity(alert.severity)}`}>{alert.severity}</span>
        </div>

        <div className="alert-panel-meta">
          <article className="alert-panel-stat">
            <span>Priority</span>
            <strong>{severityLabel}</strong>
          </article>
          <article className="alert-panel-stat">
            <span>Created</span>
            <strong>{alert.createdAt}</strong>
          </article>
          <article className="alert-panel-stat">
            <span>Alert ID</span>
            <strong>{alert.id}</strong>
          </article>
        </div>

        <section className="alert-panel-message">
          <h3>Details</h3>
          <p>{alert.message}</p>
        </section>

        <section className="alert-panel-actions">
          <button
            type="button"
            className="btn-danger alert-delete-btn"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Alert'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </section>
      </aside>
    </div>
  );
}
