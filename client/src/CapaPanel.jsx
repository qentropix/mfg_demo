import { useEffect, useMemo, useState } from 'react';

const CAPA_STAGES = ['Open', 'Root Cause Analysis', 'Action Pending', 'Verification', 'Closed'];

function toneForStatus(status) {
  if (status === 'Closed') return 'success';
  if (status === 'Overdue') return 'danger';
  return 'warning';
}

function formatDate(value) {
  return new Date(value).toLocaleDateString();
}

export default function CapaPanel({ capa, onClose, onAdvanceStage, onToggleAction, onOpenSourceNcr, apiBase }) {
  const [diagnosisText, setDiagnosisText] = useState('');
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState('');

  useEffect(() => {
    if (!capa) {
      setDiagnosisText('');
      setDiagnosisLoading(false);
      setDiagnosisError('');
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [capa, onClose]);

  const currentStageIndex = useMemo(() => CAPA_STAGES.indexOf(capa?.status ?? 'Open'), [capa]);
  const nextStage = currentStageIndex >= 0 && currentStageIndex < CAPA_STAGES.length - 1 ? CAPA_STAGES[currentStageIndex + 1] : null;
  const completedActions = capa?.actions?.filter((action) => action.completed).length ?? 0;
  const actionPercent = capa?.actions?.length ? Math.round((completedActions / capa.actions.length) * 100) : 0;

  if (!capa) return null;

  const handleSuggestRootCause = async () => {
    setDiagnosisLoading(true);
    setDiagnosisError('');
    setDiagnosisText('');

    try {
      const response = await fetch(`${apiBase}api/ai/root-cause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capaId: capa.id,
          machine: capa.machine,
          defectType: capa.defectType,
          issueDescription: capa.issueDescription,
          previousCapas: []
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setDiagnosisText(text);
      }
    } catch (error) {
      setDiagnosisError(error.message);
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const diagnosisLines = diagnosisText.trim()
    ? diagnosisText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="press-panel capa-panel" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" type="button" onClick={onClose} aria-label="Close panel">
          x
        </button>

        <div className="press-panel-header">
          <h2 className="press-panel-name">{capa.id}</h2>
          <span className={`badge tone-${toneForStatus(capa.status)}`}>{capa.status}</span>
        </div>

        <div className="press-panel-oee-row capa-header-row">
          <div className="capa-avatar">{capa.defectType.slice(0, 1)}</div>
          <div className="press-panel-kpis">
            <div className="press-panel-kpi">
              <span>Machine</span>
              <strong>{capa.machine}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Severity</span>
              <strong>{capa.severity}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Due</span>
              <strong>{formatDate(capa.dueDate)}</strong>
            </div>
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Workflow</h4>
          <div className="capa-stepper">
            {CAPA_STAGES.map((stage, index) => (
              <div key={stage} className={`capa-step ${index === currentStageIndex ? 'current' : index < currentStageIndex ? 'complete' : ''}`}>
                <span>{stage}</span>
              </div>
            ))}
          </div>
          <div className="capa-workflow-actions">
            {nextStage ? (
              <button type="button" className="btn-primary" onClick={() => onAdvanceStage(capa.id)}>
                Advance to {nextStage}
              </button>
            ) : (
              <span className="capa-closed-copy">CAPA closed</span>
            )}
            {capa.ncrId ? (
              <button type="button" className="btn-secondary" onClick={() => onOpenSourceNcr(capa.ncrId)}>
                View Source NCR {capa.ncrId}
              </button>
            ) : null}
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Root Cause Assist</h4>
          <button type="button" className="btn-secondary" onClick={handleSuggestRootCause} disabled={diagnosisLoading}>
            {diagnosisLoading ? 'Streaming...' : 'Suggest Root Cause'}
          </button>
          {diagnosisError ? <div className="capa-diagnosis-error">{diagnosisError}</div> : null}
          {diagnosisLines.length > 0 ? (
            <div className="why-list">
              {diagnosisLines.map((line, index) => {
                const isRootCause = line.startsWith('Root Cause:');
                return (
                  <div key={`${line}-${index}`} className={`why-row${isRootCause ? ' root-cause-row' : ''}`}>
                    {line}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">Stream the 5-Why analysis for this corrective action.</p>
          )}
        </div>

        <div className="press-panel-section">
          <h4>Actions</h4>
          <div className="capa-action-list">
            {(capa.actions ?? []).map((action) => (
              <label key={action.id} className="capa-action-row">
                <input
                  type="checkbox"
                  checked={Boolean(action.completed)}
                  onChange={() => onToggleAction(capa.id, action.id)}
                />
                <span>
                  <strong>{action.description}</strong>
                  <small>
                    Owner {action.owner} · Due {formatDate(action.dueDate)}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <div className="capa-progress-summary">
            <span>{completedActions}/{capa.actions?.length ?? 0} complete</span>
            <strong>{actionPercent}%</strong>
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Stage History</h4>
          <div className="capa-history-list">
            {(capa.stageHistory ?? []).slice().reverse().map((entry, index) => (
              <div key={`${entry.stage}-${entry.timestamp}-${index}`} className="capa-history-row">
                <strong>{entry.stage}</strong>
                <span>{formatDate(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
