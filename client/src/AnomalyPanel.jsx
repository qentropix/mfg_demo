import { useEffect, useMemo, useState } from 'react';
import { OeeTrendChart } from './Charts.jsx';

function toneForSeverity(severity) {
  return severity === 'Critical' ? 'danger' : 'warning';
}

export default function AnomalyPanel({ anomaly, press, apiBase = '', onClose, onCreateAlert, onDismiss }) {
  const [diagnosisText, setDiagnosisText] = useState('');
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);

  useEffect(() => {
    if (!anomaly) {
      setDiagnosisText('');
      setDiagnosisLoading(false);
    }
  }, [anomaly]);

  useEffect(() => {
    if (!anomaly) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [anomaly, onClose]);

  const trendData = useMemo(() => {
    const trend = press?.trend ?? [];
    return trend.map((value, index) => ({
      label: `T-${trend.length - index}`,
      value
    }));
  }, [press]);

  if (!anomaly || !press) return null;

  const handleDiagnosis = async () => {
    setDiagnosisLoading(true);
    setDiagnosisText('');

    try {
      const response = await fetch(`${apiBase}api/ai/anomaly-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine: anomaly.machine,
          metric: anomaly.metric,
          currentOee: anomaly.currentOee,
          trend: press.trend ?? []
        })
      });

      if (!response.ok) {
        if (response.status === 503) {
          setDiagnosisText('AI not configured. Set ANTHROPIC_API_KEY on the server.');
          return;
        }
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setDiagnosisText('No streaming response was available.');
        return;
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setDiagnosisText((previous) => previous + decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      setDiagnosisText(error.message);
    } finally {
      setDiagnosisLoading(false);
    }
  };

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="anomaly-panel" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">
          x
        </button>

        <div className="press-panel-header">
          <h2 className="press-panel-name">{anomaly.machine}</h2>
          <span className={`status-pill tone-${toneForSeverity(anomaly.severity)}`}>{anomaly.metric}</span>
        </div>

        <div className="anomaly-metrics">
          <div className="anomaly-metric">
            <span>Current OEE</span>
            <strong>{anomaly.currentOee?.toFixed(1)}%</strong>
          </div>
          <div className="anomaly-metric">
            <span>Machine Status</span>
            <strong>{anomaly.status}</strong>
          </div>
          <div className="anomaly-metric">
            <span>Downtime</span>
            <strong>{anomaly.downtimeMinutes}m</strong>
          </div>
          <div className="anomaly-metric">
            <span>Detected</span>
            <strong>{new Date(anomaly.detectedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>
          </div>
        </div>

        <div className="anomaly-panel-section">
          <h4>Trend</h4>
          <OeeTrendChart data={trendData} />
        </div>

        <div className="anomaly-panel-section">
          <h4>AI Diagnosis</h4>
          <div className="anomaly-diagnosis-card">
            {diagnosisText ? <pre>{diagnosisText}</pre> : <p>Request a diagnosis to get a concise maintenance recommendation.</p>}
          </div>
          <button className="btn-primary" type="button" onClick={handleDiagnosis} disabled={diagnosisLoading}>
            {diagnosisLoading ? 'Diagnosing...' : 'Get AI Diagnosis'}
          </button>
        </div>

        <div className="anomaly-actions">
          <button className="btn-primary" type="button" onClick={() => onCreateAlert(anomaly)}>
            Create Alert
          </button>
          <button className="btn-secondary" type="button" onClick={() => onDismiss(anomaly.id)}>
            Dismiss
          </button>
        </div>
      </aside>
    </div>
  );
}
