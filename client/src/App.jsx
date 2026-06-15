import { useEffect, useMemo, useState } from 'react';
import { useCountUp, useLiveClock } from './hooks.js';
import { OeeTrendChart, DowntimeParetoChart } from './Charts.jsx';
import PressPanel from './PressPanel.jsx';

const shiftTabs = ['Shift A', 'Shift B'];
const sidebarTabs = [
  'Dashboard',
  'Presses',
  'Downtime',
  'Production',
  'Quality',
  'Reports',
  'Alerts',
  'Settings'
];

const tabMeta = {
  Dashboard: {
    title: 'Shop Floor Dashboard',
    description: 'Live summary across the current shift, all presses, and active alerts.'
  },
  Presses: {
    title: 'Press Fleet',
    description: 'Press-level health, output, and job allocation across the line.'
  },
  Downtime: {
    title: 'Downtime Intelligence',
    description: 'Breakdown of the main loss drivers and the actions being tracked.'
  },
  Production: {
    title: 'Production Flow',
    description: 'Throughput, pacing, and shift-to-shift production movement.'
  },
  Quality: {
    title: 'Quality Control',
    description: 'Inspection results, defect trends, and containment status.'
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

function App() {
  const [shift, setShift] = useState('Shift A');
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAlertBannerVisible, setIsAlertBannerVisible] = useState(true);
  const [selectedPress, setSelectedPress] = useState(null);

  const clock = useLiveClock();

  const oeeTarget    = payload?.summary.overallOee     ?? 0;
  const outputTarget = payload?.summary.totalOutput    ?? 0;
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
      `${import.meta.env.BASE_URL}api/dashboard?shift=${encodeURIComponent(shift)}`,
      { signal }
    );
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    setPayload(data);
    setLoading(false);
    return data;
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    loadDashboard(controller.signal).catch((fetchError) => {
      if (fetchError.name === 'AbortError') return;
      setError(fetchError.message);
      setLoading(false);
    });

    return () => controller.abort();
  }, [shift]);

  useEffect(() => {
    const eventSource = new EventSource(
      `${import.meta.env.BASE_URL}api/events?shift=${encodeURIComponent(shift)}`
    );

    eventSource.addEventListener('dashboard:update', () => {
      loadDashboard().catch((fetchError) => setError(fetchError.message));
    });

    eventSource.addEventListener('error', () => eventSource.close());

    return () => eventSource.close();
  }, [shift]);

  useEffect(() => {
    const id = setInterval(() => {
      loadDashboard().catch(() => {});
    }, 45000);
    return () => clearInterval(id);
  }, [shift]);

  const stats = useMemo(() => {
    if (!payload) return [];

    const dtH = Math.floor(dtAnim / 60);
    const dtM = Math.round(dtAnim % 60);

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
  }, [payload, oeeAnim, outputAnim, partsAnim, dtAnim, alertAnim]);

  const topAlert = payload?.alerts?.[0] ?? null;

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
    const productionRows = payload.oeeTrend.map((point, index) => ({
      label: point.label,
      output: formatShortNumber(Math.round((payload.summary.totalOutput / payload.oeeTrend.length) * (0.82 + index * 0.03))),
      oee: point.value.toFixed(1)
    }));
    const qualityRows = [
      { label: 'First Pass Yield', value: `${payload.summary.qualityRate.toFixed(1)}%` },
      { label: 'Rework Rate', value: '4.8%' },
      { label: 'Scrap Rate', value: '1.2%' },
      { label: 'Inspection Pass Rate', value: '97.9%' }
    ];

    return {
      Dashboard: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="stat-grid">
            {stats.map((stat) => (
              <article key={stat.title} className={`stat-card tone-${stat.tone}`}>
                <div className="stat-head">
                  <span>{stat.title}</span>
                </div>
                <div className="stat-value">{stat.value}</div>
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
              <h3>Press Overview</h3>
            </div>
            <div className="press-row">
              {payload?.presses.map((press) => {
                const tone = statusTone(press.status);
                const toneColor = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--success)';

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
      Presses: (
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
      Downtime: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Top Losses" subtitle="Current shift downtime contribution" badge="Live">
              <div className="loss-list">
                {payload.downtime.map((item) => (
                  <div key={item.reason} className="loss-row">
                    <span>{item.reason}</span>
                    <strong>{item.minutes}m</strong>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Response Log" subtitle="Illustrative action queue" badge="Live">
              <div className="note-list">
                <div className="note-row">
                  <strong>Tool change escalation</strong>
                  <span>Maintenance team assigned</span>
                </div>
                <div className="note-row">
                  <strong>Material shortage watch</strong>
                  <span>Planning notified for resupply</span>
                </div>
                <div className="note-row">
                  <strong>Quality hold review</strong>
                  <span>Inspector sign-off pending</span>
                </div>
              </div>
            </SectionCard>
          </section>
          <div className="bottom-grid">
            <DowntimeParetoChart data={payload.downtime} />
            <OeeTrendChart data={payload.oeeTrend} />
          </div>
        </>
      ),
      Production: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Shift Throughput" subtitle="Average output by day in this sample" badge="Live">
              <div className="data-table">
                {productionRows.map((row) => (
                  <div key={row.label} className="data-row">
                    <span>{row.label}</span>
                    <strong>{row.output}</strong>
                    <small>{row.oee}% OEE</small>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Production Notes" subtitle="Demo summary for the line supervisor" badge="Live">
              <div className="note-list">
                <div className="note-row">
                  <strong>Stable cadence</strong>
                  <span>Output is tracking above the prior shift</span>
                </div>
                <div className="note-row">
                  <strong>Press 05 offline</strong>
                  <span>Impact isolated to one cell</span>
                </div>
                <div className="note-row">
                  <strong>Handover complete</strong>
                  <span>Next shift is aligned on open items</span>
                </div>
              </div>
            </SectionCard>
          </section>
          <OeeTrendChart data={payload.oeeTrend} />
        </>
      ),
      Quality: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Quality Snapshot" subtitle="Key quality measures for the current run" badge="Live">
              <div className="quality-grid">
                {qualityRows.map((row) => (
                  <div key={row.label} className="quality-item">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Defect Themes" subtitle="Demo classification from the shift" badge="Live">
              <div className="loss-list">
                <div className="loss-row">
                  <span>Surface scratches</span>
                  <strong>12</strong>
                </div>
                <div className="loss-row">
                  <span>Alignment drift</span>
                  <strong>8</strong>
                </div>
                <div className="loss-row">
                  <span>Torque variance</span>
                  <strong>5</strong>
                </div>
              </div>
            </SectionCard>
          </section>
          <SectionCard title="Inspection Status" subtitle="Current containment and release status" badge="Live">
            <div className="note-list">
              <div className="note-row">
                <strong>Zone A</strong>
                <span>Cleared for production</span>
              </div>
              <div className="note-row">
                <strong>Zone B</strong>
                <span>Under review for repeat defects</span>
              </div>
              <div className="note-row">
                <strong>Zone C</strong>
                <span>No open quality holds</span>
              </div>
            </div>
          </SectionCard>
        </>
      ),
      Reports: (
        <>
          <div className="tab-live-row">
            <span className="live-chip"><span className="live-dot" />Live</span>
          </div>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Daily Reports" subtitle="Ready-to-share operational packs" badge="Live">
              <div className="report-list">
                <div className="report-row">
                  <span>Shift handoff summary</span>
                  <button type="button">Preview</button>
                </div>
                <div className="report-row">
                  <span>Downtime breakdown</span>
                  <button type="button">Download</button>
                </div>
                <div className="report-row">
                  <span>Quality snapshot</span>
                  <button type="button">Preview</button>
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
                  <span>Compact press cards</span>
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
  }, [payload, stats]);

  return (
    <div className="app-shell">
      <section className="dashboard-panel">
        <div className="dashboard-frame">
          <aside className="sidebar">
            <div className="sidebar-logo">Q</div>
            <nav>
              {sidebarTabs.map((item) => (
                <button key={item} className={`nav-item ${activeTab === item ? 'active' : ''}`} type="button" onClick={() => setActiveTab(item)}>
                  <span className="nav-dot" />
                  <span>{item}</span>
                </button>
              ))}
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
                  {clock}
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
              tabContent?.[activeTab] ?? null
            )}
          </main>
        </div>
      </section>

      <PressPanel press={selectedPress} onClose={() => setSelectedPress(null)} />
    </div>
  );
}

export default App;
