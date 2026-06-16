import { useEffect, useMemo, useRef, useState } from 'react';
import { useCountUp } from './hooks.js';
import { OeeTrendChart, DowntimeParetoChart } from './Charts.jsx';
import PressPanel from './PressPanel.jsx';
import OrderPanel from './OrderPanel.jsx';

const shiftTabs = ['Shift A', 'Shift B'];
const navSections = [
  {
    label: 'OPERATE',
    tabs: ['Dashboard', 'Machines', 'Production & Orders', 'Supply Chain', 'Workforce']
  },
  {
    label: 'COMPLY',
    tabs: ['Quality & NCR', 'Calibration', 'Certifications', 'Suppliers', 'CAPA']
  },
  {
    label: 'INTELLIGENCE',
    tabs: ['Anomaly Detector', 'Reports', 'Alerts']
  }
];

const tabMeta = {
  Dashboard: {
    title: 'Shop Floor Dashboard',
    description: 'Live summary across the current shift, all machines, and active alerts.'
  },
  Machines: {
    title: 'Machine Fleet',
    description: 'Machine-level health, output, and job allocation across the line.'
  },
  'Production & Orders': {
    title: 'Production & Orders',
    description: 'Throughput, pacing, order status, and shift-to-shift production movement.'
  },
  'Supply Chain': {
    title: 'Supply Chain',
    description: 'Materials, suppliers, and inbound risk across the current operation.'
  },
  Workforce: {
    title: 'Workforce',
    description: 'Shift coverage, assignments, and team readiness across the line.'
  },
  'Quality & NCR': {
    title: 'Quality & NCR',
    description: 'Inspection results, nonconformance records, and containment status.'
  },
  Calibration: {
    title: 'Calibration',
    description: 'Instrument due dates, certificate status, and calibration readiness.'
  },
  Certifications: {
    title: 'Certifications',
    description: 'Employee certification status and machine coverage gaps.'
  },
  Suppliers: {
    title: 'Suppliers',
    description: 'Supplier qualification, audit history, and requalification status.'
  },
  CAPA: {
    title: 'CAPA',
    description: 'Corrective and preventive actions linked to open quality issues.'
  },
  'Anomaly Detector': {
    title: 'Anomaly Detector',
    description: 'Pattern detection and exception monitoring across operational data.'
  },
  Reports: {
    title: 'Reports Center',
    description: 'Daily summaries and operational handoff reports ready for review.'
  },
  Alerts: {
    title: 'Alert Center',
    description: 'Active incidents, acknowledgements, and escalation priorities.'
  },
  Settings: {
    title: 'Control Settings',
    description: 'Demo preferences, dashboard thresholds, and operator configuration.'
  }
};

const PLACEHOLDER_TABS = new Set([
  'Supply Chain',
  'Workforce',
  'Quality & NCR',
  'Calibration',
  'Certifications',
  'Suppliers',
  'CAPA',
  'Anomaly Detector'
]);

function formatShortNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function statusTone(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes('down')) return 'danger';
  if (normalized.includes('minor')) return 'warning';
  return 'success';
}

function ringStyle(value, color) {
  return {
    background: `conic-gradient(${color} ${Math.max(value, 0) * 3.6}deg, rgba(255,255,255,0.08) 0deg)`
  };
}

function MiniTrend({ points, color = '#29d3ff' }) {
  const safePoints = points.length ? points : [{ value: 0 }];
  const width = 110;
  const height = 40;
  const max = Math.max(...safePoints.map((point) => point.value), 100);
  const min = Math.min(...safePoints.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);
  const coords = safePoints
    .map((point, index) => {
      const x = (index / Math.max(safePoints.length - 1, 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mini-trend" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sparkline({ points, color = '#29d3ff' }) {
  const safePoints = points.length ? points : [0];
  const width = 80;
  const height = 24;
  const max = Math.max(...safePoints, 100);
  const min = Math.min(...safePoints, 0);
  const range = Math.max(max - min, 1);
  const coords = safePoints
    .map((point, index) => {
      const x = (index / Math.max(safePoints.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="machine-sparkline" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OrderCard({ order, press, ncrs, onClick }) {
  const now = Date.now();
  const minsRemaining = (order.dueDate - now) / 60000;
  const dueLabel =
    minsRemaining > 0
      ? `Due in ${Math.floor(minsRemaining / 60)}h ${Math.floor(minsRemaining % 60)}m`
      : `Overdue by ${Math.floor(Math.abs(minsRemaining) / 60)}h ${Math.floor(Math.abs(minsRemaining) % 60)}m`;
  const liveStatus =
    press?.status !== 'Running'
      ? 'At Risk'
      : minsRemaining < 0
        ? 'Delayed'
        : order.status;
  const tone = liveStatus === 'On Track' ? 'success' : liveStatus === 'At Risk' ? 'warning' : 'danger';
  const hasQualityHold = ncrs.some((ncr) => ncr.machine === order.machineAssigned && ncr.status !== 'Closed');

  return (
    <article className="order-card" onClick={onClick}>
      <div className="order-card-header">
        <div>
          <h4>{order.id}</h4>
          <p>{order.partName}</p>
        </div>
        <span className={`status-pill tone-${tone}`}>{liveStatus}</span>
      </div>
      <div className="order-card-meta">
        <span>{order.partNumber}</span>
        <span>{order.machineAssigned}</span>
      </div>
      <div className="order-card-progress">
        <strong>
          {order.qtyProduced.toLocaleString()} / {order.qtyOrdered.toLocaleString()}
        </strong>
        <span>{Math.min(100, Math.round((order.qtyProduced / Math.max(order.qtyOrdered, 1)) * 100))}% complete</span>
      </div>
      <div className="order-card-footer">
        <span>{dueLabel}</span>
        {hasQualityHold ? <span className="order-hold">Quality hold</span> : null}
      </div>
    </article>
  );
}

function effectiveRiskLevel(supplier) {
  return supplier.status === 'Suspended' || supplier.status === 'Requalification Due'
    ? 'High'
    : supplier.riskLevel;
}

function SupplyScenarioModal({ open, value, loading, onChange, onClose, onRun }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scenario-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2>Run Scenario</h2>
          <button className="panel-close" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <form
          className="scenario-form"
          onSubmit={(event) => {
            event.preventDefault();
            onRun();
          }}
        >
          <label className="scenario-field">
            <span>Scenario</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
              <option value="">Select a scenario...</option>
              <option value="supplier_delay_2w">Supplier delays delivery by 2 weeks</option>
              <option value="material_drop_50pct">Material stock drops 50% unexpectedly</option>
              <option value="demand_spike_30pct">Production demand spikes 30% next shift</option>
            </select>
          </label>

          <button type="submit" className="btn-primary" disabled={!value || loading}>
            {loading ? 'Running...' : 'Run Scenario'}
          </button>
        </form>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, badge, children }) {
  return (
    <article className="section-card">
      <div className="section-card-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {badge ? <span className="live-chip">{badge}</span> : null}
      </div>
      {children}
    </article>
  );
}

function PlaceholderCard({ tab }) {
  return (
    <div className="placeholder-card">
      <h2>{tabMeta[tab].title}</h2>
      <p>{tabMeta[tab].description}</p>
      <span className="badge tone-muted">Coming Soon</span>
    </div>
  );
}

function App() {
  const [shift, setShift] = useState('Shift A');
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [payload, setPayload] = useState(null);
  const [shiftSummaries, setShiftSummaries] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAlertBannerVisible, setIsAlertBannerVisible] = useState(true);
  const [selectedPress, setSelectedPress] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [criticalDismissed, setCriticalDismissed] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioValue, setScenarioValue] = useState('');
  const [scenarioResult, setScenarioResult] = useState('');
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [freshnessSeconds, setFreshnessSeconds] = useState(0);
  const lastUpdatedRef = useRef(Date.now());

  const baseUrl = import.meta.env.BASE_URL;

  const oeeTarget    = payload?.summary.overallOee     ?? 0;
  const outputTarget = payload?.summary.totalOutput    ?? 0;
  const targetOutput = payload?.summary.targetOutput   ?? 0;
  const partsTarget  = payload?.summary.goodParts      ?? 0;
  const alertTarget  = payload?.summary.activeAlerts   ?? 0;
  const dtTarget     = payload?.summary.downtimeMinutes ?? 0;

  const oeeAnim    = useCountUp(oeeTarget, 1);
  const outputAnim = useCountUp(outputTarget, 0);
  const partsAnim  = useCountUp(partsTarget, 0);
  const alertAnim  = useCountUp(alertTarget, 0);
  const dtAnim     = useCountUp(dtTarget, 0);

  const loadDashboard = async (signal) => {
    const response = await fetch(
      `${baseUrl}api/dashboard?shift=${encodeURIComponent(shift)}`,
      { signal }
    );
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    setPayload(data);
    setLoading(false);
    lastUpdatedRef.current = Date.now();
    setFreshnessSeconds(0);
    return data;
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSelectedOrder(null);

    loadDashboard(controller.signal).catch((fetchError) => {
      if (fetchError.name === 'AbortError') return;
      setError(fetchError.message);
      setLoading(false);
    });

    return () => controller.abort();
  }, [shift]);

  useEffect(() => {
    const eventSource = new EventSource(
      `${baseUrl}api/events?shift=${encodeURIComponent(shift)}`
    );

    eventSource.addEventListener('dashboard:update', () => {
      loadDashboard().catch((fetchError) => setError(fetchError.message));
    });

    eventSource.addEventListener('error', () => eventSource.close());

    return () => eventSource.close();
  }, [shift]);

  useEffect(() => {
    let cancelled = false;

    Promise.all(
      shiftTabs.map(async (item) => {
        const response = await fetch(`${baseUrl}api/dashboard?shift=${encodeURIComponent(item)}`);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        return [item, data.summary?.overallOee ?? 0];
      })
    )
      .then((entries) => {
        if (!cancelled) {
          setShiftSummaries(Object.fromEntries(entries));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [baseUrl, shift]);

  useEffect(() => {
    const id = setInterval(() => {
      loadDashboard().catch(() => {});
    }, 45000);
    return () => clearInterval(id);
  }, [shift]);

  useEffect(() => {
    const id = setInterval(() => {
      setFreshnessSeconds(Math.floor((Date.now() - lastUpdatedRef.current) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    if (!payload) return [];

    const dtH = Math.floor(dtAnim / 60);
    const dtM = Math.round(dtAnim % 60);
    const shiftTargetRatio = targetOutput > 0 ? outputAnim / targetOutput : 0;

    return [
      {
        title: 'Overall OEE',
        value: `${oeeAnim.toFixed(1)}%`,
        delta: '+6.2% vs last shift',
        ring: oeeAnim,
        ringColor: '#29d3ff',
        tone: 'cyan'
      },
      {
        title: 'Total Output',
        value: formatShortNumber(outputAnim),
        delta: '+8.7% vs last shift',
        ring: 84,
        ringColor: '#ab6bff',
        tone: 'violet'
      },
      {
        title: 'Shift Target',
        value: `${formatShortNumber(outputAnim)} / ${formatShortNumber(targetOutput)}`,
        sub: `${(shiftTargetRatio * 100).toFixed(1)}% achieved`,
        delta: 'Target progress this shift',
        ring: Math.max(shiftTargetRatio * 100, 0),
        ringColor:
          shiftTargetRatio >= 0.85 ? '#37d67a' :
          shiftTargetRatio >= 0.7 ? '#ffd24f' :
          '#ff6b81',
        tone:
          shiftTargetRatio >= 0.85 ? 'success' :
          shiftTargetRatio >= 0.7 ? 'warning' :
          'danger'
      },
      {
        title: 'Good Parts',
        value: formatShortNumber(partsAnim),
        delta: `${payload.summary.qualityRate.toFixed(1)}% quality rate`,
        ring: payload.summary.qualityRate,
        ringColor: '#7a7dff',
        tone: 'indigo'
      },
      {
        title: 'Downtime',
        value: `${dtH}h ${dtM}m`,
        delta: '-12.1% vs last shift',
        ring: Math.max(100 - dtAnim / 2, 20),
        ringColor: '#ff4d7d',
        tone: 'rose'
      },
      {
        title: 'Active Alerts',
        value: String(alertAnim),
        delta: `${payload.summary.criticalAlerts} critical | ${payload.summary.warningAlerts} warning`,
        ring: 72,
        ringColor: '#ffb53f',
        tone: 'amber'
      }
    ];
  }, [payload, oeeAnim, outputAnim, targetOutput, partsAnim, dtAnim, alertAnim]);

  const topAlert = payload?.alerts?.[0] ?? null;

  const badgeCounts = useMemo(() => {
    const ncrs = payload?.ncrs ?? [];
    const capas = payload?.capas ?? [];
    const calibrations = payload?.calibrations ?? [];
    const employees = payload?.employees ?? [];
    const alerts = payload?.alerts ?? [];

    return {
      'Quality & NCR': ncrs.filter((ncr) => ncr.status !== 'Closed').length,
      CAPA: capas.filter((capa) => capa.dueDate < Date.now() && capa.status !== 'Closed').length,
      Calibration: calibrations.filter((calibration) => calibration.status === 'Overdue').length,
      Certifications: employees.filter((employee) =>
        employee.certifications?.some((cert) => cert.status === 'Expired')
      ).length,
      Alerts: alerts.length
    };
  }, [payload]);

  const runSupplyScenario = async () => {
    if (!scenarioValue || scenarioLoading) return;

    const materials = payload?.materials ?? [];
    const suppliers = payload?.suppliers ?? [];

    setScenarioOpen(false);
    setScenarioLoading(true);
    setScenarioResult('');

    try {
      const response = await fetch(`${baseUrl}api/ai/supply-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftName: shift,
          scenario: scenarioValue,
          materials,
          suppliers
        })
      });

      if (!response.ok) {
        if (response.status === 503) {
          setScenarioResult('AI not configured. Set ANTHROPIC_API_KEY on the server.');
          return;
        }
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setScenarioResult('No streaming response was available.');
        return;
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setScenarioResult((previous) => previous + decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      setScenarioResult(error.message);
    } finally {
      setScenarioLoading(false);
    }
  };

  useEffect(() => {
    if (!topAlert) {
      setIsAlertBannerVisible(false);
      return undefined;
    }

    setIsAlertBannerVisible(true);
    const timeoutId = window.setTimeout(() => {
      setIsAlertBannerVisible(false);
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [topAlert?.title, topAlert?.createdAt, shift, activeTab]);

  const tabContent = useMemo(() => {
    if (!payload) return null;

    const pressWarnings = payload.presses.filter((press) => press.status !== 'Running');
    const shiftComparisonEntries = shiftTabs.map((item) => ({
      shift: item,
      value: shiftSummaries[item] ?? 1
    }));
    const materials = payload.materials ?? [];
    const suppliers = payload.suppliers ?? [];
    const criticalMaterials = materials.filter((material) => material.status === 'Critical');
    const displayedSuppliers = suppliers.map((supplier) => ({
      ...supplier,
      effectiveRiskLevel: effectiveRiskLevel(supplier)
    }));

    return {
      Dashboard: (
        <>
          <div className="tab-live-row">
            <span className="live-chip">
              <span className="live-dot" />
              Live
              <span className="live-separator">|</span>
              <span className="freshness-label">Updated {freshnessSeconds}s ago</span>
            </span>
          </div>

          <div className="shift-comparison-bar" role="tablist" aria-label="Shift comparison">
            {shiftComparisonEntries.map(({ shift: item, value }) => (
              <button
                key={item}
                type="button"
                className={`shift-segment ${shift === item ? 'active' : ''}`}
                style={{ flex: value || 1 }}
                onClick={() => setShift(item)}
              >
                <span>{item}</span>
                <span>{value ? `${value.toFixed(1)}%` : '...'}</span>
              </button>
            ))}
          </div>

          <section className="stat-grid">
            {stats.map((stat) => (
              <article key={stat.title} className={`stat-card tone-${stat.tone}`}>
                <div className="stat-head">
                  <span>{stat.title}</span>
                </div>
                <div className="stat-value">{stat.value}</div>
                {stat.sub ? <div className="stat-sub">{stat.sub}</div> : null}
                <div className="stat-delta">{stat.delta}</div>
                <div className="stat-footer">
                  <div
                    className="stat-ring"
                    style={ringStyle(stat.ring, stat.ringColor)}
                  />
                  <MiniTrend points={payload?.oeeTrend ?? []} color={stat.ringColor} />
                </div>
              </article>
            ))}
          </section>

          <section className="press-section">
            <div className="section-title">
              <h3>Machine Overview</h3>
            </div>
            <div className="press-row">
              {payload?.presses.map((press, index) => {
                const tone = statusTone(press.status);
                const toneColor = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--success)';
                const sparklinePoints = press.trend ?? Array.from({ length: 5 }, (_, pointIndex) => {
                  const tick = freshnessSeconds + pointIndex - 2;
                  const wave = Math.sin(tick * 1.3 + index * 1.07);
                  return Math.max(0, Math.min(100, press.oee + wave * 2.5));
                });

                return (
                  <article
                    key={press.pressName}
                    className={`press-card tone-${tone}`}
                    onClick={() => setSelectedPress(press)}
                  >
                    <div className="press-head">
                      <div>
                        <h4>{press.pressName}</h4>
                        <span>{press.status}</span>
                      </div>
                      <div className={`press-badge tone-${tone}`}>{press.oee.toFixed(0)}% OEE</div>
                    </div>
                    <div
                      className="press-ring"
                      style={{ ...ringStyle(press.oee, toneColor), '--oee': press.oee }}
                      data-value={press.oee.toFixed(0)}
                    />
                    <div className="press-metrics">
                      <div>
                        <span>Output</span>
                        <strong>{formatShortNumber(press.outputCount)}</strong>
                      </div>
                      <div>
                        <span>Downtime</span>
                        <strong>{press.downtimeMinutes}m</strong>
                      </div>
                    </div>
                    <Sparkline points={sparklinePoints} color={toneColor} />
                    <p className="press-job">{press.currentJob}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="bottom-grid">
            <DowntimeParetoChart data={payload?.downtime ?? []} />
            <OeeTrendChart data={payload?.oeeTrend ?? []} />
          </section>

          <section className="alerts-panel">
            <div className="section-title">
              <h3>Active Alerts</h3>
            </div>
            <div className="alerts-list">
              {payload?.alerts.map((alert) => (
                <article key={`${alert.title}-${alert.createdAt}`} className={`alert-card tone-${alert.severity}`}>
                  <div className="alert-head">
                    <strong>{alert.title}</strong>
                    <span>{alert.createdAt}</span>
                  </div>
                  <p>{alert.message}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ),
      'Production & Orders': (
        <>
          <div className="tab-live-row">
            <span className="live-chip">
              <span className="live-dot" />
              Live
            </span>
          </div>

          <section className="order-board">
            {(payload.orders ?? []).map((order) => {
              const press = payload.presses.find((item) => item.pressName === order.machineAssigned);
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  press={press}
                  ncrs={payload.ncrs ?? []}
                  onClick={() => setSelectedOrder(order)}
                />
              );
            })}
          </section>
        </>
      ),
      Machines: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-3">
            {payload.presses.map((press) => {
              const tone = statusTone(press.status);
              return (
                <article
                  key={press.pressName}
                  className="section-card compact-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedPress(press)}
                >
                  <div className="compact-head">
                    <div>
                      <h4>{press.pressName}</h4>
                      <p>{press.currentJob}</p>
                    </div>
                    <span className={`status-pill tone-${tone}`}>{press.status}</span>
                  </div>
                  <div className="mini-metric">
                    <strong>{press.oee.toFixed(0)}%</strong>
                    <span>OEE</span>
                  </div>
                  <div className="compact-meta">
                    <span>{formatShortNumber(press.outputCount)} output</span>
                    <span>{press.downtimeMinutes}m downtime</span>
                  </div>
                </article>
              );
            })}
          </section>
          <SectionCard title="Maintenance Notes" subtitle="Simple demo log for the current shift">
            <div className="note-list">
              {pressWarnings.map((press) => (
                <div key={press.pressName} className="note-row">
                  <strong>{press.pressName}</strong>
                  <span>{press.status} on {press.currentJob}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      ),
      'Supply Chain': (
        <>
          <div className="tab-live-row">
            <span className="live-chip">
              <span className="live-dot" />
              Live
            </span>
          </div>

          {!criticalDismissed && criticalMaterials.length > 0 ? (
            <div className="alert-banner tone-warning supply-banner" role="status" aria-live="polite">
              <div className="alert-banner-body">
                <strong>Material shortage risk</strong>
                <span>{criticalMaterials.length} item(s) below reorder threshold</span>
              </div>
              <button
                className="alert-banner-close"
                type="button"
                aria-label="Dismiss critical material warning"
                onClick={() => setCriticalDismissed(true)}
              >
                x
              </button>
            </div>
          ) : null}

          <section className="tab-grid tab-grid-2">
            <section className="section-card">
              <div className="section-card-header">
                <div>
                  <h3>Inventory & Material Status</h3>
                  <p>Current stock, supply horizon, and reorder position.</p>
                </div>
              </div>
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Material</th>
                    <th>Stock</th>
                    <th>Unit</th>
                    <th>Days Supply</th>
                    <th>Reorder Point</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((material) => (
                    <tr key={material.code}>
                      <td className="mono">{material.code}</td>
                      <td>{material.name}</td>
                      <td>{material.stockQty.toLocaleString()}</td>
                      <td className="muted">{material.unit}</td>
                      <td>{material.daysOfSupply.toFixed(1)}</td>
                      <td>{material.reorderPoint.toLocaleString()}</td>
                      <td>
                        <span
                          className={`badge tone-${material.status === 'Critical' ? 'danger' : material.status === 'Low' ? 'warning' : 'success'}`}
                        >
                          {material.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="section-card">
              <div className="section-card-header">
                <div>
                  <h3>Supplier Risk</h3>
                  <p>Qualification status and exposure based on delivery history.</p>
                </div>
              </div>
              <div className="supplier-risk-list">
                {displayedSuppliers.map((supplier) => (
                  <div key={supplier.id} className="supplier-risk-row">
                    <div>
                      <strong>{supplier.name}</strong>
                      <span>{supplier.id} · {supplier.materials.join(', ')}</span>
                    </div>
                    <span className={`badge tone-${supplier.effectiveRiskLevel === 'High' ? 'danger' : supplier.effectiveRiskLevel === 'Medium' ? 'warning' : 'success'}`}>
                      {supplier.effectiveRiskLevel} Risk
                    </span>
                  </div>
                ))}
              </div>

              <div className="scenario-block">
                <div className="section-card-header">
                  <div>
                    <h3>Scenario Simulator</h3>
                    <p>Run a supply disruption scenario against the current shift.</p>
                  </div>
                </div>
                <button type="button" className="btn-primary" onClick={() => setScenarioOpen(true)}>
                  Run Scenario
                </button>
                <div className="scenario-result-card">
                  {scenarioLoading ? (
                    <span>Running scenario analysis...</span>
                  ) : scenarioResult ? (
                    <p>{scenarioResult}</p>
                  ) : (
                    <span>Select a scenario to generate an operational impact summary.</span>
                  )}
                </div>
              </div>
            </section>
          </section>
        </>
      ),
      Workforce: <PlaceholderCard tab="Workforce" />,
      'Quality & NCR': <PlaceholderCard tab="Quality & NCR" />,
      Calibration: <PlaceholderCard tab="Calibration" />,
      Certifications: <PlaceholderCard tab="Certifications" />,
      Suppliers: <PlaceholderCard tab="Suppliers" />,
      CAPA: <PlaceholderCard tab="CAPA" />,
      'Anomaly Detector': <PlaceholderCard tab="Anomaly Detector" />,
      Reports: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Daily Reports" subtitle="Ready-to-share operational packs" badge="Live">
              <div className="note-list">
                <div className="note-row">
                  <strong>Shift handoff summary</strong>
                  <span>Preview available for export</span>
                </div>
                <div className="note-row">
                  <strong>Downtime breakdown</strong>
                  <span>Download ready for review</span>
                </div>
                <div className="note-row">
                  <strong>Quality snapshot</strong>
                  <span>Summary prepared for leadership</span>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Audit Trail" subtitle="Example report history" badge="Live">
              <div className="note-list">
                <div className="note-row">
                  <strong>09:00 AM</strong>
                  <span>Shift report generated</span>
                </div>
                <div className="note-row">
                  <strong>09:15 AM</strong>
                  <span>Supervisor acknowledgement received</span>
                </div>
                <div className="note-row">
                  <strong>09:30 AM</strong>
                  <span>Maintenance note appended</span>
                </div>
              </div>
            </SectionCard>
          </section>
        </>
      ),
      Alerts: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Open Alerts" subtitle="Sorted by severity for the current shift" badge="Live">
              <div className="alerts-list single-column">
                {payload.alerts.map((alert) => (
                  <article key={`${alert.title}-${alert.createdAt}`} className={`alert-card tone-${alert.severity}`}>
                    <div className="alert-head">
                      <strong>{alert.title}</strong>
                      <span>{alert.createdAt}</span>
                    </div>
                    <p>{alert.message}</p>
                  </article>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Escalation Rules" subtitle="Demo workflow for the alert queue" badge="Live">
              <div className="note-list">
                <div className="note-row">
                  <strong>Critical</strong>
                  <span>Notify maintenance and supervisor immediately</span>
                </div>
                <div className="note-row">
                  <strong>Warning</strong>
                  <span>Track until next hour checkpoint</span>
                </div>
                <div className="note-row">
                  <strong>Info</strong>
                  <span>Log for review during handoff</span>
                </div>
              </div>
            </SectionCard>
          </section>
        </>
      ),
      Settings: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Dashboard Preferences" subtitle="Demo configuration controls" badge="Live">
              <div className="settings-list">
                <label className="settings-row">
                  <span>Auto-refresh dashboard</span>
                  <strong>On</strong>
                </label>
                <label className="settings-row">
                  <span>Show active alerts</span>
                  <strong>On</strong>
                </label>
                <label className="settings-row">
                  <span>Compact machine cards</span>
                  <strong>Off</strong>
                </label>
              </div>
            </SectionCard>
            <SectionCard title="Operator Profile" subtitle="Sample account information" badge="Live">
              <div className="note-list">
                <div className="note-row">
                  <strong>Role</strong>
                  <span>Line Supervisor</span>
                </div>
                <div className="note-row">
                  <strong>Plant</strong>
                  <span>Plant 1</span>
                </div>
                <div className="note-row">
                  <strong>Access</strong>
                  <span>Dashboard + Reports</span>
                </div>
              </div>
            </SectionCard>
          </section>
        </>
      )
    };
  }, [payload, stats, freshnessSeconds, shiftSummaries, criticalDismissed, scenarioLoading, scenarioResult]);

  return (
    <div className="app-shell">
      <section className="dashboard-panel">
        <div className="dashboard-frame">
          <aside className="sidebar">
            <div className="sidebar-logo">Q</div>
            <nav className="sidebar-nav">
              {navSections.map((section) => (
                <div key={section.label} className="sidebar-section">
                  <div className="nav-section-header">{section.label}</div>
                  {section.tabs.map((item) => (
                    <button
                      key={item}
                      className={`nav-item ${activeTab === item ? 'active' : ''}`}
                      type="button"
                      onClick={() => setActiveTab(item)}
                    >
                      <span className="nav-tab">
                        <span className="nav-dot" />
                        <span className="nav-tab-label">{item}</span>
                        {badgeCounts[item] > 0 ? <span className="nav-badge">{badgeCounts[item]}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="sidebar-section sidebar-settings">
                <div className="nav-section-header">SETTINGS</div>
                <button
                  className={`nav-item ${activeTab === 'Settings' ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveTab('Settings')}
                >
                  <span className="nav-tab">
                    <span className="nav-dot" />
                    <span className="nav-tab-label">Settings</span>
                  </span>
                </button>
              </div>
            </nav>
          </aside>

          <main className="dashboard-content">
            <header className="topbar">
              <div>
                <h2>{tabMeta[activeTab].title}</h2>
                <p>{tabMeta[activeTab].description}</p>
              </div>

              <div className="topbar-actions">
                <span className="last-updated">
                  <span className="live-dot" />
                  Live
                  <span className="live-separator">|</span>
                  Updated {freshnessSeconds}s ago
                </span>
                <button className="icon-button" type="button">R</button>
                <div className="shift-switcher">
                  {shiftTabs.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`shift-button ${shift === item ? 'selected' : ''}`}
                      onClick={() => setShift(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <button className="icon-button" type="button">M</button>
              </div>
            </header>

            {topAlert && isAlertBannerVisible ? (
              <div className={`alert-banner tone-${topAlert.severity}`} role="status" aria-live="polite">
                <div className="alert-banner-body">
                  <strong>{topAlert.title}</strong>
                  <span>{topAlert.message}</span>
                </div>
                <button
                  className="alert-banner-close"
                  type="button"
                  aria-label="Dismiss alert"
                  onClick={() => setIsAlertBannerVisible(false)}
                >
                  ×
                </button>
              </div>
            ) : null}

            {error ? <div className="error-banner">{error}</div> : null}

            {loading && !payload ? (
              <div className="loading-state">Loading dashboard metrics...</div>
            ) : (
              tabContent?.[activeTab] ?? (PLACEHOLDER_TABS.has(activeTab) ? <PlaceholderCard tab={activeTab} /> : null)
            )}
          </main>
        </div>
      </section>

      <PressPanel press={selectedPress} onClose={() => setSelectedPress(null)} />
      <OrderPanel
        order={selectedOrder}
        press={
          selectedOrder
            ? payload?.presses.find((item) => item.pressName === selectedOrder.machineAssigned)
            : null
        }
        ncrs={payload?.ncrs ?? []}
        onClose={() => setSelectedOrder(null)}
      />
      <SupplyScenarioModal
        open={scenarioOpen}
        value={scenarioValue}
        loading={scenarioLoading}
        onChange={setScenarioValue}
        onClose={() => setScenarioOpen(false)}
        onRun={runSupplyScenario}
      />
    </div>
  );
}

export default App;
