import { useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

function ringStyle(value, color) {
  return {
    background: `conic-gradient(${color} ${Math.max(value, 0) * 3.6}deg, rgba(255,255,255,0.08) 0deg)`
  };
}

function statusTone(status) {
  const n = status.toLowerCase();
  if (n.includes('down')) return 'danger';
  if (n.includes('minor')) return 'warning';
  return 'success';
}

function genTrend(press) {
  const today = press.oee;
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
  const seed = press.pressName.length;
  return labels.map((label, i) => {
    const daysAgo = labels.length - 1 - i;
    const noise = Math.sin(i * 1.9 + seed) * 2.2;
    return {
      label,
      value: parseFloat(Math.max(40, Math.min(99, today - daysAgo * 0.9 + noise)).toFixed(1))
    };
  });
}

const PRESS_DETAILS = {
  'Press 01': {
    jobs: [
      { id: 'JB-2041', part: 'Hood Outer Panel', qty: 2800 },
      { id: 'JB-2040', part: 'Trunk Panel Batch', qty: 3150 }
    ],
    note: 'PM completed last Friday. No open maintenance items. Next scheduled PM in 3 weeks.'
  },
  'Press 02': {
    jobs: [
      { id: 'JB-2039', part: 'Fender Reinforcement', qty: 2650 },
      { id: 'JB-2038', part: 'Quarter Panel A', qty: 3010 }
    ],
    note: 'Tooling replaced last Tuesday. Minor wear on die face — inspect at next 10k cycles.'
  },
  'Press 03': {
    jobs: [
      { id: 'JB-2037', part: 'B-Pillar Inner', qty: 2420 },
      { id: 'JB-2036', part: 'Sill Panel Set', qty: 2780 }
    ],
    note: 'Hydraulic fluid changed last cycle. Slight vibration at high-speed run — monitored.'
  },
  'Press 04': {
    jobs: [
      { id: 'JB-2035', part: 'Roof Rail Brace', qty: 1890 },
      { id: 'JB-2034', part: 'Inner Door Frame', qty: 2340 }
    ],
    note: 'Minor stop pattern under investigation. Quality hold cleared after recalibration at 08:58.'
  },
  'Press 05': {
    jobs: [
      { id: 'JB-2033', part: 'Firewall Panel', qty: 0 },
      { id: 'JB-2032', part: 'Crossmember Batch', qty: 2100 }
    ],
    note: 'SAFETY LOCKOUT ACTIVE — Hydraulic pressure below threshold. Maintenance team on site.'
  },
  'Press 06': {
    jobs: [
      { id: 'JB-2043', part: 'Door Hinge Mount', qty: 3780 },
      { id: 'JB-2042', part: 'Striker Plate Kit', qty: 3650 }
    ],
    note: 'Running at rated speed. Last inspection clear. No open maintenance items.'
  }
};

const TOOLTIP_STYLE = {
  background: '#0d1117',
  border: '1px solid rgba(163,189,255,0.15)',
  borderRadius: '8px',
  color: '#cdd9f5',
  fontSize: '12px'
};

export default function PressPanel({ press, onClose }) {
  useEffect(() => {
    if (!press) return;
    const handle = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [press, onClose]);

  if (!press) return null;

  const tone = statusTone(press.status);
  const toneColor =
    tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--success)';
  const details = PRESS_DETAILS[press.pressName] ?? {
    jobs: [{ id: 'JB-0000', part: 'Unknown Job', qty: 0 }],
    note: 'No maintenance notes on record.'
  };
  const trend = genTrend(press);

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="press-panel" onClick={(e) => e.stopPropagation()}>
        <button className="panel-close" onClick={onClose} aria-label="Close panel">
          ×
        </button>

        <div className="press-panel-header">
          <h2 className="press-panel-name">{press.pressName}</h2>
          <span className={`status-pill tone-${tone}`}>{press.status}</span>
        </div>

        <div className="press-panel-oee-row">
          <div
            className="press-panel-ring"
            style={ringStyle(press.oee, toneColor)}
            data-value={press.oee.toFixed(0)}
          />
          <div className="press-panel-kpis">
            <div className="press-panel-kpi">
              <span>Output</span>
              <strong>{press.outputCount.toLocaleString()}</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Downtime</span>
              <strong>{press.downtimeMinutes}m</strong>
            </div>
            <div className="press-panel-kpi">
              <span>Current Job</span>
              <strong>{press.currentJob}</strong>
            </div>
          </div>
        </div>

        <div className="press-panel-section">
          <h4>7-Day OEE Trend</h4>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={trend} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="panelOeeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={toneColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={toneColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fill: '#6875a8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#6875a8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [`${v}%`, 'OEE']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={toneColor}
                strokeWidth={2}
                fill="url(#panelOeeGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="press-panel-section">
          <h4>Job History</h4>
          <div className="press-panel-jobs">
            <div className="press-panel-job">
              <span className="job-dot active" />
              <div>
                <strong>{press.currentJob}</strong>
                <span>In progress</span>
              </div>
            </div>
            {details.jobs.map((job) => (
              <div key={job.id} className="press-panel-job">
                <span className="job-dot done" />
                <div>
                  <strong>{job.part}</strong>
                  <span>
                    {job.id} · {job.qty.toLocaleString()} parts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="press-panel-section">
          <h4>Maintenance Notes</h4>
          <p className="press-panel-note">{details.note}</p>
        </div>
      </aside>
    </div>
  );
}
