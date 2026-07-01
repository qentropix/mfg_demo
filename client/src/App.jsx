import { useEffect, useMemo, useRef, useState } from 'react';
import { useCountUp } from './hooks.js';
import { OeeTrendChart, DowntimeParetoChart } from './Charts.jsx';
import PressPanel from './PressPanel.jsx';
import OrderPanel from './OrderPanel.jsx';
import AnomalyPanel from './AnomalyPanel.jsx';
import AlertPanel from './AlertPanel.jsx';
import CalibrationPanel from './CalibrationPanel.jsx';
import CertificationPanel from './CertificationPanel.jsx';
import SupplierPanel from './SupplierPanel.jsx';
import CapaPanel from './CapaPanel.jsx';
import AssistantPanel from './AssistantPanel.jsx';

const appLogoUrl = new URL('../../assets/favicon.svg', import.meta.url).href;

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
    description: 'Shift coverage, operator assignments, and machine readiness across the line.'
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

function SectionCard({ title, subtitle, badge, className = '', children }) {
  return (
    <article className={`section-card${className ? ` ${className}` : ''}`}>
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

function MaintenanceNoteRow({ press, onSave }) {
  const savedNote = press.maintenanceNotes ?? '';
  const fieldId = `maintenance-note-${press.pressName.replace(/\s+/g, '-').toLowerCase()}`;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(savedNote);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setDraft(savedNote);
    setSaveError('');
  }, [savedNote]);

  const cancelEditing = () => {
    setDraft(savedNote);
    setSaveError('');
    setIsEditing(false);
  };

  const saveNote = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setSaveError('');
    try {
      await onSave(press.pressName, draft);
      setIsEditing(false);
    } catch (error) {
      setSaveError(error.message || 'Could not save maintenance notes.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <form className="maintenance-note-editor" onSubmit={saveNote}>
        <label htmlFor={fieldId}>{press.pressName}</label>
        <textarea
          id={fieldId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelEditing();
          }}
          maxLength={2000}
          rows={3}
          autoFocus
          disabled={isSaving}
        />
        {saveError ? <p role="alert">{saveError}</p> : null}
        <div className="maintenance-note-editor-actions">
          <button type="button" className="btn-secondary" onClick={cancelEditing} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      className="note-row maintenance-note-row"
      onClick={() => setIsEditing(true)}
      aria-label={`Edit maintenance notes for ${press.pressName}`}
    >
      <strong>{press.pressName}</strong>
      <span>{savedNote || 'No maintenance notes on record.'}</span>
      <small>Edit</small>
    </button>
  );
}

function ReportCard({ text, activeShift }) {
  const sections = parseShiftReport(text);

  return (
    <div className="report-card">
      <div className="report-header">
        SHIFT HANDOVER REPORT · {activeShift} · {new Date().toLocaleString()}
      </div>
      {sections.length > 0 ? (
        sections.map((section) => (
          <div key={section.header} className="report-section">
            <h4>{section.header}</h4>
            <p>{section.body}</p>
          </div>
        ))
      ) : (
        <div className="report-fallback">
          <p>{text}</p>
        </div>
      )}
    </div>
  );
}

function employeeStatusTone(status) {
  if (status === 'Active') return 'success';
  if (status === 'On Break') return 'warning';
  return 'danger';
}

function integrationTone(status) {
  if (status === 'Connected') return 'success';
  if (status === 'Configured') return 'warning';
  return 'muted';
}

function anomalyTone(severity) {
  return severity === 'Critical' ? 'danger' : 'warning';
}

function calibrationTone(status) {
  if (status === 'Overdue') return 'danger';
  if (status === 'Due Soon') return 'warning';
  return 'success';
}

function ncrStatusTone(status) {
  if (status === 'Closed') return 'success';
  if (status === 'Under Review') return 'warning';
  return 'danger';
}

function getEmployeeStatus(employee) {
  if (employee.certifications?.some((cert) => cert.status === 'Expired')) return 'Expired';
  if (
    employee.certifications?.some((cert) => {
      const daysToExpiry = (cert.expiryDate - Date.now()) / 86400000;
      return daysToExpiry > 0 && daysToExpiry <= 30 && cert.status !== 'Expired';
    })
  ) {
    return 'Expiring Soon';
  }
  return 'Current';
}

function getSupplierAuditTrend(supplier) {
  const history = [...(supplier.auditHistory ?? [])]
    .filter((entry) => typeof entry.score === 'number')
    .sort((a, b) => a.date - b.date);

  if (history.length < 2) return 'stable';
  const latest = history[history.length - 1].score;
  const previous = history[history.length - 2].score;
  if (latest < previous) return 'declining';
  if (latest > previous) return 'improving';
  return 'stable';
}

function getSupplierStatusTone(status) {
  if (status === 'Suspended') return 'danger';
  if (status === 'Requalification Due') return 'warning';
  return 'success';
}

function getCapaStatusTone(status) {
  if (status === 'Closed') return 'success';
  if (status === 'Overdue') return 'danger';
  return 'warning';
}

function formatCapaDueDate(dueDate) {
  const diffMs = dueDate - Date.now();
  const diffDays = Math.floor(Math.abs(diffMs) / 86400000);
  return diffMs > 0 ? `In ${diffDays}d` : `Overdue ${diffDays}d`;
}

function getCapaStageProgress(capa) {
  const stages = ['Open', 'Root Cause Analysis', 'Action Pending', 'Verification', 'Closed'];
  const currentIndex = stages.indexOf(capa.status);
  return currentIndex < 0 ? 0 : Math.round((currentIndex / (stages.length - 1)) * 100);
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="assistant-toggle-icon">
      <path d="M4 4h16v11H8l-4 4V4zm3 4h10v2H7V8zm0 3h7v2H7v-2z" />
    </svg>
  );
}

function formatRelativeMinutes(timestamp) {
  if (!timestamp) return 'just now';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
}

function formatRelativeDate(timestamp) {
  if (!timestamp) return 'just now';
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  const dayRemainder = hours % 24;
  return dayRemainder ? `${days}d ${dayRemainder}h ago` : `${days}d ago`;
}

function getLocalDateInputValue(date = new Date()) {
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60000);
  return localDate.toISOString().slice(0, 10);
}

function deriveCalibrationStatus(nextDue) {
  if (nextDue < Date.now()) return 'Overdue';
  if (nextDue < Date.now() + 30 * 86400000) return 'Due Soon';
  return 'Current';
}

function parseShiftReport(text) {
  return text
    .split(/###\s+/g)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const [header, ...body] = section.split('\n');
      return {
        header: header.trim(),
        body: body.join('\n').trim()
      };
    });
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
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [criticalDismissed, setCriticalDismissed] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioValue, setScenarioValue] = useState('');
  const [scenarioResult, setScenarioResult] = useState('');
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [performanceSort, setPerformanceSort] = useState({ field: 'outputCount', dir: 'desc' });
  const [optimizerResult, setOptimizerResult] = useState('');
  const [optimizerLoading, setOptimizerLoading] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedReportHistoryId, setSelectedReportHistoryId] = useState(null);
  const [reportDate, setReportDate] = useState(() => getLocalDateInputValue());
  const [reportHistory, setReportHistory] = useState([]);
  const [historyRangeDays, setHistoryRangeDays] = useState(210);
  const [historySummary, setHistorySummary] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyInsights, setHistoryInsights] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [anomalies, setAnomalies] = useState([]);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState(null);
  const anomalyDefaultSelectedRef = useRef(false);
  const [employees, setEmployees] = useState([]);
  const [employeesSeedShift, setEmployeesSeedShift] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [calibrations, setCalibrations] = useState([]);
  const [selectedCalibrationAssetTag, setSelectedCalibrationAssetTag] = useState(null);
  const [calibrationStatusFilter, setCalibrationStatusFilter] = useState('All');
  const [calibrationSearch, setCalibrationSearch] = useState('');
  const [calibrationTypeFilter, setCalibrationTypeFilter] = useState('All');
  const [calibrationDrawerOpen, setCalibrationDrawerOpen] = useState(false);
  const [calibrationSort, setCalibrationSort] = useState({ field: 'nextDue', dir: 'asc' });
  const [calibrationModalOpen, setCalibrationModalOpen] = useState(false);
  const [calibrationForm, setCalibrationForm] = useState({
    assetTag: '',
    name: '',
    type: 'Gauge',
    location: '',
    intervalDays: '90',
    lastCalibrated: '',
    calibratedBy: ''
  });
  const [ncrs, setNcrs] = useState([]);
  const [capas, setCapas] = useState([]);
  const [selectedCapaId, setSelectedCapaId] = useState(null);
  const [highlightedNcr, setHighlightedNcr] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState('All');
  const [supplierRiskFilter, setSupplierRiskFilter] = useState('All');
  const [supplierMaterialFilter, setSupplierMaterialFilter] = useState('All');
  const [qualityAnalysisText, setQualityAnalysisText] = useState('');
  const [qualityAnalysisLoading, setQualityAnalysisLoading] = useState(false);
  const [ncrModalOpen, setNcrModalOpen] = useState(false);
  const [ncrForm, setNcrForm] = useState({
    machine: '',
    defectType: '',
    qtyAffected: '1',
    description: '',
    severity: 'Medium'
  });
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestSystem, setRequestSystem] = useState('');
  const [requestText, setRequestText] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantStreaming, setAssistantStreaming] = useState(false);
  const [adminAiGaps, setAdminAiGaps] = useState([]);
  const [adminAiGapsLoading, setAdminAiGapsLoading] = useState(false);
  const [adminAiGapsError, setAdminAiGapsError] = useState('');
  const [adminAiGapsStatus, setAdminAiGapsStatus] = useState('all');
  const [adminAiGapsLimit, setAdminAiGapsLimit] = useState(25);
  const [adminAiGapSelectedId, setAdminAiGapSelectedId] = useState(null);
  const [adminAiGapMessage, setAdminAiGapMessage] = useState('');
  const [dataHealth, setDataHealth] = useState(null);
  const [dataHealthLoading, setDataHealthLoading] = useState(false);
  const [dataHealthError, setDataHealthError] = useState('');
  const [anomalyThresholds, setAnomalyThresholds] = useState({
    warningOeeDrop: 8,
    criticalOee: 65,
    sustainedTicks: 2
  });
  const [freshnessSeconds, setFreshnessSeconds] = useState(0);
  const lastUpdatedRef = useRef(Date.now());
  const prevOeeRef = useRef({});
  const lowOeeCountRef = useRef({});

  async function loadAdminAiGaps({ analyze = false } = {}) {
    setAdminAiGapsLoading(true);
    setAdminAiGapsError('');
    setAdminAiGapMessage('');
    try {
      const url = analyze
        ? '/api/admin/ai-gaps/analyze'
        : `/api/admin/ai-gaps?limit=${encodeURIComponent(adminAiGapsLimit)}${adminAiGapsStatus !== 'all' ? `&status=${encodeURIComponent(adminAiGapsStatus)}` : ''}`;
      const response = await fetch(url, {
        method: analyze ? 'POST' : 'GET',
        headers: analyze ? { 'Content-Type': 'application/json' } : undefined,
        body: analyze ? JSON.stringify({ days: 30, minCount: 2 }) : undefined
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const gaps = analyze ? (payload.gaps ?? []) : (payload.gaps ?? []);
      setAdminAiGaps(gaps);
      if (analyze) {
        setAdminAiGapMessage(`Analyzed ${gaps.length} gap(s) from recent AI failures.`);
      }
      if (gaps.length && !adminAiGapSelectedId) {
        setAdminAiGapSelectedId(gaps[0].id);
      }
    } catch (fetchError) {
      setAdminAiGapsError(fetchError.message);
    } finally {
      setAdminAiGapsLoading(false);
    }
  }

  async function loadDataHealth() {
    setDataHealthLoading(true);
    setDataHealthError('');
    try {
      const response = await fetch('/api/admin/data-health');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      setDataHealth(await response.json());
    } catch (fetchError) {
      setDataHealthError(fetchError.message);
    } finally {
      setDataHealthLoading(false);
    }
  }

  const selectedAdminAiGap = adminAiGaps.find((gap) => gap.id === adminAiGapSelectedId) ?? adminAiGaps[0] ?? null;
  const selectedAdminAiProposal = selectedAdminAiGap?.proposal ?? selectedAdminAiGap?.proposals?.[0]?.patchJson ?? selectedAdminAiGap?.proposals?.[0]?.patch_json ?? null;

  useEffect(() => {
    if (activeTab === 'Settings' && !adminAiGaps.length && !adminAiGapsLoading) {
      loadAdminAiGaps().catch(() => {});
    }
    if (activeTab === 'Settings' && !dataHealth && !dataHealthLoading) {
      loadDataHealth().catch(() => {});
    }
  }, [activeTab, adminAiGaps.length, adminAiGapsLoading, adminAiGapsLimit, adminAiGapsStatus, dataHealth, dataHealthLoading]);

  const integrations = [
    {
      name: 'ERP',
      platforms: 'SAP · Oracle · Epicor · Infor',
      status: 'Configured',
      detail: 'Work order sync pending activation',
      icon: '🏭'
    },
    {
      name: 'MES',
      platforms: 'Ignition · Wonderware · FactoryTalk',
      status: 'Connected',
      detail: 'Real-time stream active',
      icon: '⚙'
    },
    {
      name: 'Machine PLCs',
      platforms: 'OPC-UA · Siemens · Allen-Bradley',
      status: 'Connected',
      detail: '6 machines reporting',
      icon: '🔌'
    },
    {
      name: 'Quality System',
      platforms: 'ETQ · MasterControl · Intelex',
      status: 'Available',
      detail: 'Supported - not yet configured',
      icon: '✓'
    },
    {
      name: 'HR / Scheduling',
      platforms: 'ADP · UKG · SAP HCM',
      status: 'Available',
      detail: 'Supported - not yet configured',
      icon: '👥'
    }
  ];

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

  const activeAnomalies = useMemo(
    () => anomalies.filter((anomaly) => !anomaly.resolved),
    [anomalies]
  );
  const selectedAnomaly = anomalies.find((anomaly) => anomaly.id === selectedAnomalyId) ?? null;
  const parsedReportSections = useMemo(() => parseShiftReport(reportText), [reportText]);

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
    setReportText('');
    setReportLoading(false);
    setSelectedReportHistoryId(null);
  }, [shift]);

  useEffect(() => {
    setQualityAnalysisText('');
    setQualityAnalysisLoading(false);
    setNcrModalOpen(false);
    setRequestModalOpen(false);
    setSelectedEmployeeId(null);
    setSelectedCapaId(null);
    setHighlightedNcr('');
    setSelectedSupplierId(null);
    anomalyDefaultSelectedRef.current = false;
  }, [shift]);

  const handleAssistantMessage = async (text) => {
    const content = text.trim();
    if (!content || assistantStreaming) return;

    const userMsg = { role: 'user', content };
    const nextMessages = [...assistantMessages, userMsg];
    const assistantSeedId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setAssistantMessages([
      ...nextMessages,
      {
        role: 'assistant',
        content: 'Thinking...',
        requestId: assistantSeedId,
        prompt: content,
        activeTab,
        feedbackSubmitted: false
      }
    ]);
    setAssistantStreaming(true);

    try {
      const response = await fetch(`${baseUrl}api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, shiftName: shift })
      });

      if (response.status === 503) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Operations Assistant is currently unavailable.');
      }

      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const requestId = response.headers.get('x-request-id') || assistantSeedId;
      setAssistantMessages((current) => {
        const lastMessage = current.at(-1);
        if (!lastMessage || lastMessage.role !== 'assistant') {
          return current;
        }

        return [
          ...current.slice(0, -1),
          {
            ...lastMessage,
            requestId,
            prompt: content,
            activeTab,
            feedbackSubmitted: Boolean(lastMessage.feedbackSubmitted)
          }
        ];
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finalText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        finalText += chunk;
        setAssistantMessages((current) => [
          ...current.slice(0, -1),
          {
            ...current.at(-1),
            role: 'assistant',
            content: finalText,
            requestId,
            prompt: content,
            activeTab
          }
        ]);
      }
    } catch (error) {
      setAssistantMessages((current) => [
        ...current.slice(0, -1),
        {
          role: 'assistant',
          content:
            error.message === 'AI not configured' || error.message.includes('unavailable')
              ? 'Operations Assistant is currently unavailable.'
              : error.message,
          requestId: assistantSeedId,
          prompt: content,
          activeTab,
          feedbackSubmitted: false
        }
      ]);
    } finally {
      setAssistantStreaming(false);
    }
  };

  const submitAssistantFeedback = async ({
    requestId,
    rating,
    comment = '',
    correctAnswer = '',
    rawQuery = '',
    source = '',
    queryType = '',
    resolvedScope = '',
    resolvedWindow = '',
    reaskedOrCorrected = false,
    activeTab: feedbackTab = activeTab
  }) => {
    if (!requestId) {
      throw new Error('Missing request id for feedback.');
    }

    const response = await fetch(`${baseUrl}api/ai/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        rating,
        comment,
        correctAnswer,
        rawQuery,
        source,
        queryType,
        resolvedScope,
        resolvedWindow,
        reaskedOrCorrected,
        shiftName: shift,
        activeTab: feedbackTab
      })
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    setAssistantMessages((current) =>
      current.map((message) =>
        message.requestId === requestId
          ? {
              ...message,
              feedbackSubmitted: true,
              feedbackRating: rating,
              feedbackComment: comment,
              feedbackCorrectAnswer: correctAnswer
            }
          : message
      )
    );

    setToastMessage('AI feedback sent.');
  };

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timeoutId = window.setTimeout(() => setToastMessage(''), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

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

  useEffect(() => {
    if (!anomalyDefaultSelectedRef.current && !selectedAnomalyId && activeAnomalies.length > 0) {
      setSelectedAnomalyId(activeAnomalies[0].id);
      anomalyDefaultSelectedRef.current = true;
    }
  }, [activeAnomalies, selectedAnomalyId]);

  useEffect(() => {
    setNcrs(payload?.ncrs ?? []);
    setCapas(payload?.capas ?? []);
    if (payload?.suppliers?.length) {
      setSuppliers(payload.suppliers);
    }
    if (payload?.calibrations?.length) {
      setCalibrations(
        payload.calibrations.map((instrument) => ({
          ...instrument,
          status: deriveCalibrationStatus(instrument.nextDue)
        }))
      );
    }

    if (!payload) return;

    const machineOptions = payload.presses ?? [];
    const defectOptions = payload.defects ?? [];

    setNcrForm((current) => ({
      ...current,
      machine:
        machineOptions.some((press) => press.pressName === current.machine)
          ? current.machine
          : machineOptions[0]?.pressName ?? '',
      defectType:
        defectOptions.some((defect) => defect.type === current.defectType)
          ? current.defectType
          : defectOptions[0]?.type ?? ''
    }));
  }, [payload?.ncrs, payload?.presses, payload?.defects, payload, calibrations.length, suppliers.length]);

  useEffect(() => {
    if (selectedSupplierId && suppliers.some((supplier) => supplier.id === selectedSupplierId)) return;
    if (selectedSupplierId) {
      setSelectedSupplierId(null);
    }
  }, [selectedSupplierId, suppliers]);

  useEffect(() => {
    if (selectedCapaId && capas.some((capa) => capa.id === selectedCapaId)) return;
    if (selectedCapaId) {
      setSelectedCapaId(null);
    }
  }, [selectedCapaId, capas]);

  useEffect(() => {
    if (!highlightedNcr) return;
    if (ncrs.some((ncr) => ncr.id === highlightedNcr)) return;
    setHighlightedNcr('');
  }, [highlightedNcr, ncrs]);

  useEffect(() => {
    if (!payload?.employees?.length) return;

    setEmployees(payload.employees);
    setEmployeesSeedShift(shift);
  }, [payload?.employees, shift]);

  useEffect(() => {
    if (!selectedCalibrationAssetTag) return;
    if (calibrations.some((instrument) => instrument.assetTag === selectedCalibrationAssetTag)) return;
    setSelectedCalibrationAssetTag(null);
  }, [calibrations, selectedCalibrationAssetTag]);

  useEffect(() => {
    if (!calibrationDrawerOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setCalibrationDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [calibrationDrawerOpen]);

  useEffect(() => {
    if (!payload?.presses?.length) return undefined;

    const now = Date.now();
    const detected = [];

    payload.presses.forEach((press) => {
      const prev = prevOeeRef.current[press.pressName];
      const priorLowCount = lowOeeCountRef.current[press.pressName] ?? 0;
      const trend = press.trend ?? [];

      if (press.status === 'Down') {
        detected.push({
          id: `${press.pressName}-down`,
          machine: press.pressName,
          metric: 'Machine Status',
          severity: 'Critical',
          description: `${press.pressName} is in a Down state - safety lockout or fault`,
          detectedAt: now,
          resolved: false,
          trend,
          currentOee: press.oee,
          status: press.status,
          downtimeMinutes: press.downtimeMinutes
        });
      }

      if (prev !== undefined && prev - press.oee > anomalyThresholds.warningOeeDrop) {
        detected.push({
          id: `${press.pressName}-oee-drop`,
          machine: press.pressName,
          metric: 'OEE Drop',
          severity: 'Warning',
          description: `${press.pressName} OEE dropped ${(prev - press.oee).toFixed(1)}% in the last cycle`,
          detectedAt: now,
          resolved: false,
          trend,
          currentOee: press.oee,
          status: press.status,
          downtimeMinutes: press.downtimeMinutes
        });
      }

      if (press.status !== 'Running' && prev !== undefined) {
        detected.push({
          id: `${press.pressName}-minor-stop`,
          machine: press.pressName,
          metric: 'Status Change',
          severity: 'Warning',
          description: `${press.pressName} transitioned to ${press.status}`,
          detectedAt: now,
          resolved: false,
          trend,
          currentOee: press.oee,
          status: press.status,
          downtimeMinutes: press.downtimeMinutes
        });
      }

      const nextLowCount = press.oee < anomalyThresholds.criticalOee ? priorLowCount + 1 : 0;
      lowOeeCountRef.current[press.pressName] = nextLowCount;
      if (nextLowCount >= anomalyThresholds.sustainedTicks) {
        detected.push({
          id: `${press.pressName}-sustained-low`,
          machine: press.pressName,
          metric: 'Sustained Low OEE',
          severity: 'Critical',
          description: `${press.pressName} OEE below ${anomalyThresholds.criticalOee}% for ${nextLowCount} consecutive cycles`,
          detectedAt: now,
          resolved: false,
          trend,
          currentOee: press.oee,
          status: press.status,
          downtimeMinutes: press.downtimeMinutes
        });
      }

      prevOeeRef.current[press.pressName] = press.oee;
    });

    setAnomalies((current) => {
      const detectedById = new Map(detected.map((item) => [item.id, item]));
      const detectedIds = new Set(detectedById.keys());
      const next = [];

      current.forEach((anomaly) => {
        const fresh = detectedById.get(anomaly.id);
        if (fresh) {
          next.push({
            ...anomaly,
            ...fresh,
            resolved: false,
            resolvedAt: null,
            detectedAt: anomaly.detectedAt ?? fresh.detectedAt
          });
          return;
        }

        next.push({
          ...anomaly,
          resolved: true,
          resolvedAt: anomaly.resolvedAt ?? now
        });
      });

      detected.forEach((item) => {
        if (!current.some((anomaly) => anomaly.id === item.id)) {
          next.unshift(item);
        }
      });

      return next;
    });
  }, [payload?.presses, anomalyThresholds]);

  useEffect(() => {
    const resolved = anomalies.some((anomaly) => anomaly.resolved);
    if (!resolved) return undefined;

    const timeoutId = window.setTimeout(() => {
      setAnomalies((current) => current.filter((anomaly) => !anomaly.resolved));
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [anomalies]);

  const runShiftReport = async () => {
    if (reportLoading) return;

    setReportLoading(true);
    setReportText('');
    setSelectedReportHistoryId(null);

    try {
      const selectedReportDate = reportDate || getLocalDateInputValue();
      const response = await fetch(`${baseUrl}api/reports/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftName: shift,
          reportDate: selectedReportDate
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const finalText = payload.reportText ?? '';
      setReportText(finalText);

      if (finalText.trim()) {
        setReportHistory((current) => [
          {
            id: Date.now(),
            shiftName: shift,
            reportDate: selectedReportDate,
            generatedAt: new Date().toISOString(),
            text: finalText
          },
          ...current.slice(0, 4)
        ]);
      }
    } catch (error) {
      setReportText(error.message);
    } finally {
      setReportLoading(false);
    }
  };

  async function loadHistory(rangeDays = historyRangeDays) {
    setHistoryLoading(true);
    setHistoryError('');

    try {
      const [summaryResponse, eventsResponse, insightsResponse] = await Promise.all([
        fetch(`/api/history/summary?shift=${encodeURIComponent(shift)}&days=${rangeDays}`),
        fetch(`/api/history/events?shift=${encodeURIComponent(shift)}&days=${Math.min(rangeDays, 30)}&limit=120`),
        fetch(`/api/history/insights?shift=${encodeURIComponent(shift)}&days=${rangeDays}`)
      ]);

      if (!summaryResponse.ok || !eventsResponse.ok || !insightsResponse.ok) {
        throw new Error('Unable to load history data.');
      }

      const [summaryPayload, eventsPayload, insightsPayload] = await Promise.all([
        summaryResponse.json(),
        eventsResponse.json(),
        insightsResponse.json()
      ]);

      setHistorySummary(summaryPayload.summary ?? []);
      setHistoryEvents(eventsPayload.events ?? []);
      setHistoryInsights(insightsPayload ?? null);
      setHistoryRangeDays(rangeDays);
    } catch (error) {
      setHistoryError(error.message);
      setHistorySummary([]);
      setHistoryEvents([]);
      setHistoryInsights(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'Reports') {
      loadHistory(historyRangeDays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, shift]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [shift, activeTab]);

  const handleCopyReport = async () => {
    if (!reportText.trim()) return;
    try {
      await navigator.clipboard.writeText(reportText);
    } catch {
      setError('Unable to copy report to clipboard.');
    }
  };

  const handleExportReport = (format) => {
    const selectedReportDate = reportDate || getLocalDateInputValue();
    const params = new URLSearchParams({
      shift,
      reportDate: selectedReportDate,
      format
    });
    window.open(`${baseUrl}api/reports/daily/export?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleViewReport = (entry) => {
    setReportLoading(false);
    setSelectedReportHistoryId(entry.id);
    setReportText(entry.text);
    if (entry.reportDate) {
      setReportDate(entry.reportDate);
    }
    setActiveTab('Reports');
    window.requestAnimationFrame(() => {
      document.getElementById('report-card-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

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
  const selectedAlert = payload?.alerts?.find((alert) => alert.id === selectedAlertId) ?? null;

  const qualityModel = useMemo(() => {
    const summary = payload?.summary ?? {};
    const totalOutput = summary.totalOutput ?? 0;
    const goodParts = summary.goodParts ?? 0;
    const inspectionPassRate = summary.inspectionPassRate ?? summary.qualityRate ?? 0;
    const qualityHoldMinutes = payload?.downtime?.find((item) => item.reason === 'Quality Hold')?.minutes ?? 0;
    const firstPassYield = totalOutput > 0 ? (goodParts / totalOutput) * 100 : 0;
    const reworkRate = (qualityHoldMinutes / 480) * 100;
    const scrapRate = totalOutput > 0 ? ((totalOutput - goodParts) / totalOutput) * 100 : 0;
    const defectRows = (payload?.defects ?? [])
      .map((defect) => {
        const previousCount = payload?.prevShiftDefects?.find((item) => item.type === defect.type)?.count ?? 0;
        const delta = defect.count - previousCount;
        return {
          ...defect,
          previousCount,
          delta,
          tone: delta > 0 ? 'danger' : delta < 0 ? 'success' : 'muted'
        };
      })
      .sort((a, b) => b.count - a.count);
    const topRiskMachine = [...(payload?.presses ?? [])].sort((a, b) => a.oee - b.oee)[0] ?? null;

    return {
      metrics: [
        {
          title: 'First Pass Yield',
          value: `${firstPassYield.toFixed(1)}%`,
          note: `${goodParts.toLocaleString()} good / ${totalOutput.toLocaleString()} total`
        },
        {
          title: 'Rework Rate',
          value: `${reworkRate.toFixed(1)}%`,
          note: `${qualityHoldMinutes}m quality hold`
        },
        {
          title: 'Scrap Rate',
          value: `${scrapRate.toFixed(1)}%`,
          note: `${Math.max(totalOutput - goodParts, 0).toLocaleString()} pieces`
        },
        {
          title: 'Inspection Pass Rate',
          value: `${inspectionPassRate.toFixed(1)}%`,
          note: 'From live shift summary'
        }
      ],
      defectRows,
      topRiskMachine,
      openNcrCount: ncrs.filter((ncr) => ncr.status !== 'Closed').length
    };
  }, [ncrs, payload]);

  const calibrationCounts = useMemo(
    () => ({
      total: calibrations.length,
      current: calibrations.filter((instrument) => instrument.status === 'Current').length,
      dueSoon: calibrations.filter((instrument) => instrument.status === 'Due Soon').length,
      overdue: calibrations.filter((instrument) => instrument.status === 'Overdue').length
    }),
    [calibrations]
  );

  const calibrationGroups = useMemo(
    () => ({
      All: calibrations,
      Current: calibrations.filter((instrument) => instrument.status === 'Current'),
      'Due Soon': calibrations.filter((instrument) => instrument.status === 'Due Soon'),
      Overdue: calibrations.filter((instrument) => instrument.status === 'Overdue')
    }),
    [calibrations]
  );

  const sortedCalibrations = useMemo(() => {
    const search = calibrationSearch.trim().toLowerCase();
    const filtered = calibrations.filter((instrument) => {
      const statusMatches = calibrationStatusFilter === 'All' || instrument.status === calibrationStatusFilter;
      const typeMatches = calibrationTypeFilter === 'All' || instrument.type === calibrationTypeFilter;
      const queryMatches =
        !search ||
        [instrument.assetTag, instrument.name, instrument.type, instrument.location, instrument.certNumber, instrument.calibratedBy]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      return statusMatches && typeMatches && queryMatches;
    });

    const sorted = [...filtered].sort((a, b) => {
      const { field, dir } = calibrationSort;
      const valueA = a[field];
      const valueB = b[field];

      if (valueA === valueB) return 0;

      if (typeof valueA === 'string' || typeof valueB === 'string') {
        const comparison = String(valueA).localeCompare(String(valueB));
        return dir === 'asc' ? comparison : -comparison;
      }

      const comparison = valueA < valueB ? -1 : 1;
      return dir === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [calibrationSort, calibrations, calibrationSearch, calibrationStatusFilter, calibrationTypeFilter]);

  const calibrationTypes = useMemo(
    () => [...new Set(calibrations.map((instrument) => instrument.type))].sort(),
    [calibrations]
  );

  const calibrationDrawerInstruments = calibrationGroups[calibrationStatusFilter] ?? [];
  const openCalibrationDrawer = (status) => {
    setCalibrationStatusFilter(status);
    setCalibrationDrawerOpen(true);
  };

  const selectedCalibration =
    calibrations.find((instrument) => instrument.assetTag === selectedCalibrationAssetTag) ?? null;

  const employeeRoster = employees.length ? employees : payload?.employees ?? [];
  const supplierRoster = suppliers.length ? suppliers : payload?.suppliers ?? [];
  const certModel = useMemo(() => {
    const coverageGaps = employeeRoster.filter((employee) => {
      const machineCert = employee.certifications?.find((cert) =>
        cert.name.toLowerCase().includes(employee.assignedMachine.toLowerCase())
      );
      return machineCert?.status === 'Expired' || employee.shiftStatus === 'Absent';
    });

    const certCounts = {
      total: employeeRoster.length,
      fullyCertified: employeeRoster.filter((employee) =>
        employee.certifications?.every((cert) => cert.status === 'Current')
      ).length,
      expiringSoon: employeeRoster.filter((employee) =>
        employee.certifications?.some((cert) => {
          const daysToExpiry = (cert.expiryDate - Date.now()) / 86400000;
          return daysToExpiry > 0 && daysToExpiry <= 30;
        })
      ).length,
      expired: employeeRoster.filter((employee) =>
        employee.certifications?.some((cert) => cert.status === 'Expired')
      ).length
    };

    const selectedEmployee =
      employeeRoster.find((employee) => employee.id === selectedEmployeeId) ?? null;

    const sortedEmployees = [...employeeRoster].sort((a, b) => {
      const statusOrder = { Expired: 0, 'Expiring Soon': 1, Current: 2 };
      const statusA = getEmployeeStatus(a);
      const statusB = getEmployeeStatus(b);
      if (statusA !== statusB) return statusOrder[statusA] - statusOrder[statusB];
      return a.name.localeCompare(b.name);
    });

    return {
      certCounts,
      coverageGaps,
      selectedEmployee,
      sortedEmployees
    };
  }, [employeeRoster, selectedEmployeeId]);

  const supplierModel = useMemo(() => {
    const selectedSupplier =
      supplierRoster.find((supplier) => supplier.id === selectedSupplierId) ?? null;
    const supplierMaterials = [...new Set(supplierRoster.flatMap((supplier) => supplier.materials ?? []))].sort();
    const search = supplierSearch.trim().toLowerCase();

    const supplierCounts = {
      total: supplierRoster.length,
      approved: supplierRoster.filter((supplier) => supplier.status === 'Approved').length,
      requalDue: supplierRoster.filter((supplier) => supplier.status === 'Requalification Due').length,
      onHold: supplierRoster.filter((supplier) => supplier.status === 'Suspended').length
    };

    const filteredSuppliers = supplierRoster.filter((supplier) => {
      const statusMatches = supplierStatusFilter === 'All' || supplier.status === supplierStatusFilter;
      const riskMatches = supplierRiskFilter === 'All' || effectiveRiskLevel(supplier) === supplierRiskFilter;
      const materialMatches =
        supplierMaterialFilter === 'All' || (supplier.materials ?? []).includes(supplierMaterialFilter);
      const queryMatches =
        !search ||
        [supplier.name, supplier.id, supplier.status, supplier.riskLevel, effectiveRiskLevel(supplier), ...(supplier.materials ?? [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      return statusMatches && riskMatches && materialMatches && queryMatches;
    });

    const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
      const order = { Suspended: 0, 'Requalification Due': 1, Approved: 2 };
      const statusA = order[a.status] ?? 3;
      const statusB = order[b.status] ?? 3;
      if (statusA !== statusB) return statusA - statusB;
      return a.name.localeCompare(b.name);
    });

    return {
      supplierCounts,
      supplierMaterials,
      selectedSupplier,
      filteredSuppliers,
      sortedSuppliers
    };
  }, [supplierRoster, selectedSupplierId, supplierSearch, supplierStatusFilter, supplierRiskFilter, supplierMaterialFilter]);

  const capaModel = useMemo(() => {
    const stages = ['Open', 'Root Cause Analysis', 'Action Pending', 'Verification', 'Closed'];
    const selectedCapa = capas.find((capa) => capa.id === selectedCapaId) ?? null;

    const capaCounts = {
      total: capas.length,
      open: capas.filter((capa) => capa.status === 'Open').length,
      inProgress: capas.filter((capa) => ['Root Cause Analysis', 'Action Pending', 'Verification'].includes(capa.status)).length,
      overdue: capas.filter((capa) => capa.dueDate < Date.now() && capa.status !== 'Closed').length,
      closedThisMonth: capas.filter((capa) => {
        const now = new Date();
        const closed = new Date(capa.closedAt ?? 0);
        return capa.status === 'Closed' && closed.getMonth() === now.getMonth() && closed.getFullYear() === now.getFullYear();
      }).length
    };

    const sortedCapas = [...capas].sort((a, b) => {
      if (a.status === b.status) return b.openedDate - a.openedDate;
      return stages.indexOf(a.status) - stages.indexOf(b.status);
    });

    return {
      capaCounts,
      selectedCapa,
      sortedCapas
    };
  }, [capas, selectedCapaId]);

  const badgeCounts = useMemo(() => {
    const alerts = payload?.alerts ?? [];

    return {
      'Quality & NCR': ncrs.filter((ncr) => ncr.status !== 'Closed').length,
      CAPA: capaModel.capaCounts.overdue,
      Calibration: calibrations.filter((calibration) => calibration.status === 'Overdue').length,
      Certifications: certModel.certCounts.expired,
      Suppliers: supplierModel.supplierCounts.onHold,
      Alerts: alerts.length
    };
  }, [payload, ncrs, capaModel.capaCounts.overdue, calibrations, certModel.certCounts.expired, supplierModel.supplierCounts.onHold]);

  const syncLog = useMemo(
    () => [
      {
        system: 'MES',
        timestamp: `${Math.floor((Date.now() % 120000) / 1000)}s ago`,
        records: '847 production records',
        status: 'Connected'
      },
      {
        system: 'Machine PLCs',
        timestamp: 'Real-time',
        records: 'OPC-UA stream active since 06:00',
        status: 'Connected'
      },
      {
        system: 'ERP',
        timestamp: 'Pending activation',
        records: '—',
        status: 'Configured'
      }
    ],
    [freshnessSeconds]
  );

  const workforceModel = useMemo(() => {
    const employees = employeeRoster;
    const presses = payload?.presses ?? [];

    const coverageGapEmployees = employees.filter((employee) => employee.shiftStatus === 'Absent');
    const expiredCertEmployees = employees.filter((employee) =>
      employee.certifications?.some(
        (cert) =>
          cert.name.toLowerCase().includes(employee.assignedMachine.toLowerCase()) &&
          cert.status === 'Expired'
      )
    );

    const performanceRows = presses
      .map((press) => {
        const employee = employees.find(
          (item) => item.assignedMachine === press.pressName && item.shiftStatus === 'Active'
        );

        return {
          ...press,
          employeeName: employee?.name ?? 'Unassigned',
          employeeId: employee?.id ?? null,
          employeeStatus: employee?.shiftStatus ?? 'Unassigned'
        };
      })
      .sort((a, b) => {
        const { field, dir } = performanceSort;
        const valueA = a[field];
        const valueB = b[field];

        if (valueA === valueB) return 0;
        const comparison = valueA < valueB ? -1 : 1;
        return dir === 'asc' ? comparison : -comparison;
      });

    const topPerformer = [...performanceRows].sort((a, b) => b.outputCount - a.outputCount)[0] ?? null;

    return {
      employees,
      performanceRows,
      topPerformerMachine: topPerformer?.pressName ?? null,
      summary: {
        total: employees.length,
        active: employees.filter((employee) => employee.shiftStatus === 'Active').length,
        onBreak: employees.filter((employee) => employee.shiftStatus === 'On Break').length,
        absent: employees.filter((employee) => employee.shiftStatus === 'Absent').length,
        coverageGaps: coverageGapEmployees.length,
        expiredCerts: expiredCertEmployees.length
      },
      coverageGapEmployees,
      expiredCertEmployees
    };
  }, [payload, performanceSort, employeeRoster]);

  useEffect(() => {
    setOptimizerResult('');
    setOptimizerLoading(false);
    setPerformanceSort({ field: 'outputCount', dir: 'desc' });
  }, [shift]);

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
          setScenarioResult('AI is currently unavailable.');
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

  const handleCreateAnomalyAlert = async (anomaly) => {
    if (!anomaly) return;

    try {
      const response = await fetch(`${baseUrl}api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: anomaly.severity === 'Critical' ? 'critical' : 'warning',
          title: `${anomaly.machine} ${anomaly.metric}`,
          message: anomaly.description,
          isActive: true
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      await loadDashboard();
    } catch (error) {
      setError(error.message);
    }
  };

  const handleDismissAnomaly = (anomalyId) => {
    setAnomalies((current) =>
      current.map((anomaly) =>
        anomaly.id === anomalyId
          ? { ...anomaly, resolved: true, resolvedAt: anomaly.resolvedAt ?? Date.now() }
          : anomaly
      )
    );
    setSelectedAnomalyId(null);
  };

  const handleDeleteAlert = async (alert) => {
    if (!alert) return;

    const previousAlerts = payload?.alerts ?? [];
    setPayload((current) =>
      current
        ? { ...current, alerts: (current.alerts ?? []).filter((item) => item.id !== alert.id) }
        : current
    );
    setSelectedAlertId((current) => (current === alert.id ? null : current));

    try {
      const response = await fetch(
        `${baseUrl}api/alerts/${encodeURIComponent(alert.id)}?shift=${encodeURIComponent(shift)}`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json().catch(() => null);
      if (data?.dashboard) {
        setPayload(data.dashboard);
      }
      setToastMessage('Alert deleted.');
    } catch (error) {
      setPayload((current) => (current ? { ...current, alerts: previousAlerts } : current));
      setSelectedAlertId(alert.id);
      setError(error.message);
    }
  };

  const runOptimizer = async () => {
    if (optimizerLoading || !payload) return;

    setOptimizerLoading(true);
    setOptimizerResult('');

    try {
      const response = await fetch(`${baseUrl}api/ai/shift-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftName: shift,
          prompt: 'Analyze the current shift roster and recommend specific reassignment changes to improve coverage and sustain output.',
          employees: workforceModel.employees,
          presses: payload.presses ?? [],
          orders: payload.orders ?? []
        })
      });

      if (!response.ok) {
        if (response.status === 503) {
          setOptimizerResult('Shift optimizer is currently unavailable.');
          return;
        }
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setOptimizerResult('No streaming response was available.');
        return;
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setOptimizerResult((previous) => previous + decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      setOptimizerResult(error.message);
    } finally {
      setOptimizerLoading(false);
    }
  };

  const runQualityAnalysis = async () => {
    if (qualityAnalysisLoading || !payload) return;

    setQualityAnalysisLoading(true);
    setQualityAnalysisText('');

    try {
      const response = await fetch(`${baseUrl}api/ai/quality-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftName: shift,
          summary: payload.summary,
          presses: payload.presses ?? [],
          defects: payload.defects ?? []
        })
      });

      if (!response.ok) {
        if (response.status === 503) {
          setQualityAnalysisText('Quality analysis is currently unavailable.');
          return;
        }
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setQualityAnalysisText('No streaming response was available.');
        return;
      }

      const decoder = new TextDecoder();
      let finalText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        finalText += chunk;
        setQualityAnalysisText(finalText);
      }
    } catch (error) {
      setQualityAnalysisText(error.message);
    } finally {
      setQualityAnalysisLoading(false);
    }
  };

  const handleRaiseNcr = async () => {
    if (!payload || !ncrForm.machine || !ncrForm.defectType || !ncrForm.description.trim()) return;

    const nextNcr = {
      id: `NCR-2024-0${String(ncrs.length + 44).padStart(3, '0')}`,
      date: Date.now(),
      machine: ncrForm.machine,
      defectType: ncrForm.defectType,
      qtyAffected: Number(ncrForm.qtyAffected) || 1,
      status: 'Open',
      assignedTo: 'EMP-1055',
      capaId: null,
      description: ncrForm.description.trim(),
      severity: ncrForm.severity
    };

    setNcrs((current) => [nextNcr, ...current]);
    setNcrModalOpen(false);

    try {
      const response = await fetch(`${baseUrl}api/ncr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftName: shift,
          ...nextNcr
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      if (data?.ncr) {
        setNcrs((current) => [data.ncr, ...current.filter((item) => item.id !== nextNcr.id)]);
      }
      await loadDashboard();
      setNcrForm((current) => ({
        ...current,
        qtyAffected: '1',
        description: ''
      }));
    } catch (error) {
      setError(error.message);
      setNcrs((current) => current.filter((item) => item.id !== nextNcr.id));
    }
  };

  const persistCapaUpdate = async (updatedCapa) => {
    try {
      const response = await fetch(`${baseUrl}api/capa/${encodeURIComponent(updatedCapa.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftName: shift,
          ...updatedCapa
        })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      if (data?.capa) {
        setCapas((current) => current.map((capa) => (capa.id === data.capa.id ? data.capa : capa)));
      }
      if (data?.capa?.status === 'Closed' && data.capa.ncrId) {
        setNcrs((current) => current.map((ncr) => (ncr.id === data.capa.ncrId ? { ...ncr, status: 'Closed' } : ncr)));
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const handleAdvanceCapaStage = (capaId) => {
    const stages = ['Open', 'Root Cause Analysis', 'Action Pending', 'Verification', 'Closed'];
    const target = capas.find((capa) => capa.id === capaId);
    if (!target) return;

    const currentIdx = stages.indexOf(target.status);
    if (currentIdx < 0 || currentIdx >= stages.length - 1) return;

    const nextStage = stages[currentIdx + 1];
    const timestamp = Date.now();
    const updatedCapa = {
      ...target,
      status: nextStage,
      percentComplete: nextStage === 'Closed' ? 100 : Math.max(target.percentComplete, Math.round(((currentIdx + 1) / (stages.length - 1)) * 100)),
      stageHistory: [...(target.stageHistory ?? []), { stage: nextStage, timestamp }],
      ...(nextStage === 'Closed' ? { closedAt: timestamp } : {})
    };

    setCapas((current) => current.map((capa) => (capa.id === capaId ? updatedCapa : capa)));
    if (nextStage === 'Closed' && target.ncrId) {
      setNcrs((current) => current.map((ncr) => (ncr.id === target.ncrId ? { ...ncr, status: 'Closed' } : ncr)));
    }
    persistCapaUpdate(updatedCapa);
  };

  const handleToggleCapaAction = (capaId, actionId) => {
    const target = capas.find((capa) => capa.id === capaId);
    if (!target) return;

    const actions = (target.actions ?? []).map((action) =>
      action.id === actionId ? { ...action, completed: !action.completed } : action
    );
    const completedCount = actions.filter((action) => action.completed).length;
    const percentComplete = actions.length ? Math.round((completedCount / actions.length) * 100) : target.percentComplete;
    const updatedCapa = {
      ...target,
      actions,
      percentComplete
    };

    setCapas((current) => current.map((capa) => (capa.id === capaId ? updatedCapa : capa)));
    persistCapaUpdate(updatedCapa);
  };

  const handleRequestIntegration = () => {
    if (!requestSystem.trim() || !requestText.trim()) return;
    setRequestModalOpen(false);
    setToastMessage('Thanks - we\'ll follow up within 24 hours');
    setRequestSystem('');
    setRequestText('');
  };

  const handleScheduleCalibration = async ({ instrument, scheduledDate, provider, type }) => {
    const formattedDate = new Date(scheduledDate).toLocaleDateString();
    const optimistic = {
      ...instrument,
      lastScheduledAt: Date.now(),
      scheduledProvider: provider,
      scheduledType: type
    };

    setCalibrations((current) => current.map((item) => (item.assetTag === instrument.assetTag ? optimistic : item)));
    setToastMessage(`Recalibration scheduled for ${formattedDate}.`);

    try {
      const response = await fetch(`${baseUrl}api/calibrations/${encodeURIComponent(instrument.assetTag)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(optimistic)
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      await loadDashboard();
    } catch (error) {
      setError(error.message);
      await loadDashboard().catch(() => undefined);
    }
  };

  const handleAddInstrument = () => {
    const lastCalibrated = new Date(calibrationForm.lastCalibrated);
    const intervalDays = Number(calibrationForm.intervalDays) || 0;

    if (
      !calibrationForm.assetTag.trim() ||
      !calibrationForm.name.trim() ||
      !calibrationForm.location.trim() ||
      !Number.isFinite(lastCalibrated.getTime()) ||
      intervalDays <= 0
    ) {
      return;
    }

    const lastCalibratedMs = lastCalibrated.getTime();
    const nextDue = lastCalibratedMs + intervalDays * 86400000;
    const status = deriveCalibrationStatus(nextDue);

    const nextInstrument = {
      assetTag: calibrationForm.assetTag.trim(),
      name: calibrationForm.name.trim(),
      type: calibrationForm.type,
      location: calibrationForm.location.trim(),
      intervalDays,
      lastCalibrated: lastCalibratedMs,
      nextDue,
      certNumber: calibrationForm.assetTag.trim(),
      calibratedBy: calibrationForm.calibratedBy.trim() || 'Internal QA',
      results: { measured: '', tolerance: '', outcome: 'Pass' },
      status
    };

    setCalibrations((current) => [...current, nextInstrument]);
    setCalibrationModalOpen(false);
    setToastMessage(`Instrument ${nextInstrument.assetTag} added as ${status.toLowerCase()}.`);
    fetch(`${baseUrl}api/calibrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextInstrument)
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        return loadDashboard();
      })
      .catch((error) => {
        setError(error.message);
        return loadDashboard().catch(() => undefined);
      });
    setCalibrationForm({
      assetTag: '',
      name: '',
      type: 'Gauge',
      location: '',
      intervalDays: '90',
      lastCalibrated: '',
      calibratedBy: ''
    });
  };

  const handleLogTraining = async (employeeId, cert) => {
    if (!cert?.name) return;

    setEmployees((current) =>
      current.map((employee) =>
        employee.id === employeeId
          ? {
              ...employee,
              certifications: [
                ...employee.certifications.filter((item) => item.name !== cert.name),
                cert
              ]
            }
          : employee
      )
    );
    setToastMessage(`Training logged for ${cert.name}.`);

    try {
      const response = await fetch(`${baseUrl}api/workforce/${encodeURIComponent(employeeId)}/certifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftName: shift, ...cert })
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      await loadDashboard();
    } catch (error) {
      setError(error.message);
      await loadDashboard().catch(() => undefined);
    }
  };

  const handleSupplierStatusChange = async (supplierId, newStatus) => {
    setSuppliers((current) =>
      current.map((supplier) =>
        supplier.id === supplierId ? { ...supplier, status: newStatus } : supplier
      )
    );
    setToastMessage(`Supplier status updated to ${newStatus}.`);

    try {
      const response = await fetch(`${baseUrl}api/suppliers/${encodeURIComponent(supplierId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      await loadDashboard();
    } catch (error) {
      setError(error.message);
      await loadDashboard().catch(() => undefined);
    }
  };

  const handleScheduleAudit = async (supplierId, scheduledDate, notes = '') => {
    const targetDate = new Date(scheduledDate);
    if (!Number.isFinite(targetDate.getTime())) return;

    setSuppliers((current) =>
      current.map((supplier) =>
        supplier.id === supplierId
          ? {
              ...supplier,
              auditHistory: [
                ...(supplier.auditHistory ?? []),
                {
                  date: targetDate.getTime(),
                  type: 'Scheduled',
                  score: null,
                  outcome: `Pending${notes ? ` - ${notes.trim()}` : ''}`
                }
              ]
            }
          : supplier
      )
    );
    setToastMessage(`Audit scheduled for ${targetDate.toLocaleDateString()}.`);

    try {
      const response = await fetch(`${baseUrl}api/suppliers/${encodeURIComponent(supplierId)}/audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: targetDate.toISOString(), notes })
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      await loadDashboard();
    } catch (error) {
      setError(error.message);
      await loadDashboard().catch(() => undefined);
    }
  };

  const handleSaveMaintenanceNotes = async (pressName, maintenanceNotes) => {
    const response = await fetch(
      `${baseUrl}api/presses/${encodeURIComponent(pressName)}?shift=${encodeURIComponent(shift)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenanceNotes })
      }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    if (data.dashboard) {
      setPayload(data.dashboard);
    }
    setSelectedPress((current) => (current?.pressName === pressName ? data.press : current));
    setToastMessage(`Maintenance notes updated for ${pressName}.`);
    return data.press;
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

  useEffect(() => {
    if (selectedAlertId && !selectedAlert) {
      setSelectedAlertId(null);
    }
  }, [selectedAlert, selectedAlertId]);

  const tabContent = useMemo(() => {
    if (!payload) return null;

    const shiftComparisonEntries = shiftTabs.map((item) => ({
      shift: item,
      value: shiftSummaries[item] ?? 1
    }));
    const materials = payload.materials ?? [];
    const suppliers = supplierRoster;
    const criticalMaterials = materials.filter((material) => material.status === 'Critical');
    const displayedSuppliers = suppliers.map((supplier) => ({
      ...supplier,
      effectiveRiskLevel: effectiveRiskLevel(supplier),
      auditTrend: getSupplierAuditTrend(supplier)
    }));

    return {
      Dashboard: (
        <>
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
          <section className="order-board">
            {(payload.orders ?? []).map((order) => {
              const press = payload.presses.find((item) => item.pressName === order.machineAssigned);
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  press={press}
                  ncrs={ncrs}
                  onClick={() => setSelectedOrder(order)}
                />
              );
            })}
          </section>
        </>
      ),
      Machines: (
        <>
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
          <SectionCard
            title="Maintenance Notes"
            subtitle="Click any note to edit the current shift log"
            className="maintenance-notes-card"
          >
            <div className="note-list">
              {payload.presses.map((press) => (
                <MaintenanceNoteRow
                  key={press.pressName}
                  press={press}
                  onSave={handleSaveMaintenanceNotes}
                />
              ))}
            </div>
          </SectionCard>
        </>
      ),
      'Supply Chain': (
        <>
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
                  <button
                    key={supplier.id}
                    type="button"
                    className="supplier-risk-row"
                    onClick={() => setSelectedSupplierId(supplier.id)}
                  >
                    <div>
                      <strong>{supplier.name}</strong>
                      <span>{supplier.id} · {supplier.materials.join(', ')}</span>
                    </div>
                    <span className={`badge tone-${supplier.effectiveRiskLevel === 'High' ? 'danger' : supplier.effectiveRiskLevel === 'Medium' ? 'warning' : 'success'}`}>
                      {supplier.effectiveRiskLevel} Risk
                    </span>
                  </button>
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
      Workforce: (
        <>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Shift Coverage" subtitle="Current roster health and machine readiness">
              <div className="workforce-summary-grid">
                <article className="workforce-summary-card">
                  <span>Total Operators</span>
                  <strong>{workforceModel.summary.total}</strong>
                </article>
                <article className="workforce-summary-card">
                  <span>Active</span>
                  <strong>{workforceModel.summary.active}</strong>
                </article>
                <article className="workforce-summary-card">
                  <span>Absent</span>
                  <strong>{workforceModel.summary.absent}</strong>
                </article>
                <article className="workforce-summary-card">
                  <span>Expired Machine Certs</span>
                  <strong>{workforceModel.summary.expiredCerts}</strong>
                </article>
              </div>
            </SectionCard>

            <SectionCard title="Coverage Gaps" subtitle="Absent operators and expired machine certifications">
              <div className="workforce-alert-stack">
                {workforceModel.coverageGapEmployees.map((employee) => {
                  const machineCert = employee.certifications.find((cert) =>
                    cert.name.toLowerCase().includes(employee.assignedMachine.toLowerCase())
                  );

                  return (
                    <article key={employee.id} className="alert-card tone-warning workforce-alert-card">
                      <div className="alert-head">
                        <strong>{employee.name}</strong>
                        <span>{employee.id}</span>
                      </div>
                      <p>
                        Coverage gap on {employee.assignedMachine}. {employee.role} is marked {employee.shiftStatus.toLowerCase()}.
                      </p>
                      {machineCert ? (
                        <p className="workforce-alert-detail">
                          {machineCert.name} is {machineCert.status.toLowerCase()}.
                        </p>
                      ) : null}
                    </article>
                  );
                })}

                {workforceModel.expiredCertEmployees.map((employee) => {
                  const machineCert = employee.certifications.find((cert) =>
                    cert.name.toLowerCase().includes(employee.assignedMachine.toLowerCase())
                  );

                  return (
                    <article key={`${employee.id}-cert`} className="alert-card tone-danger workforce-alert-card">
                      <div className="alert-head">
                        <strong>{employee.name}</strong>
                        <span>{employee.id}</span>
                      </div>
                      <p>
                        Expired machine certification for {employee.assignedMachine} on {machineCert?.name ?? 'assigned machine certification'}.
                      </p>
                    </article>
                  );
                })}

                {!workforceModel.coverageGapEmployees.length && !workforceModel.expiredCertEmployees.length ? (
                  <div className="note-row">
                    <strong>No coverage gaps</strong>
                    <span>All machine assignments are covered and current.</span>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          </section>

          <SectionCard
            title="Shift Roster"
            subtitle="Employees, assignments, and current readiness"
            className="shift-roster-card"
          >
            <div className="roster-grid">
              {workforceModel.employees.map((employee) => {
                const tone = employeeStatusTone(employee.shiftStatus);
                const machineCert = employee.certifications.find((cert) =>
                  cert.name.toLowerCase().includes(employee.assignedMachine.toLowerCase())
                );
                const hasCoverageGap = employee.shiftStatus === 'Absent';
                const certExpired = machineCert?.status === 'Expired';

                return (
                  <article key={employee.id} className="roster-card">
                    <div className="roster-header">
                      <div>
                        <span className="roster-name">{employee.name}</span>
                        <span className="muted">{employee.id}</span>
                      </div>
                      <span className={`badge tone-${tone}`}>{employee.shiftStatus}</span>
                    </div>
                    <div className="roster-role">
                      {employee.role} · {employee.assignedMachine}
                    </div>
                    {hasCoverageGap ? (
                      <div className="roster-flag tone-warning">Coverage gap on {employee.assignedMachine}</div>
                    ) : null}
                    {certExpired ? (
                      <div className="roster-flag tone-danger">Cert expired for {employee.assignedMachine}</div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </SectionCard>

          <section className="tab-grid tab-grid-2 workforce-bottom-grid">
            <SectionCard title="Operator Performance" subtitle="Machine output mapped to active employees">
              <div className="table-scroll">
                <table className="workforce-table">
                  <thead>
                    <tr>
                      <th>Machine</th>
                      <th>Operator</th>
                      <th>
                        <button
                          type="button"
                          className="sortable-head"
                          onClick={() =>
                            setPerformanceSort((current) => ({
                              field: 'outputCount',
                              dir: current.field === 'outputCount' && current.dir === 'desc' ? 'asc' : 'desc'
                            }))
                          }
                        >
                          Output
                          {performanceSort.field === 'outputCount' ? ` ${performanceSort.dir === 'asc' ? '^' : 'v'}` : null}
                        </button>
                      </th>
                      <th>
                        <button
                          type="button"
                          className="sortable-head"
                          onClick={() =>
                            setPerformanceSort((current) => ({
                              field: 'oee',
                              dir: current.field === 'oee' && current.dir === 'desc' ? 'asc' : 'desc'
                            }))
                          }
                        >
                          OEE
                          {performanceSort.field === 'oee' ? ` ${performanceSort.dir === 'asc' ? '^' : 'v'}` : null}
                        </button>
                      </th>
                      <th>Downtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workforceModel.performanceRows.map((row) => (
                      <tr key={row.pressName} className={row.pressName === workforceModel.topPerformerMachine ? 'top-performer' : ''}>
                        <td>{row.pressName}</td>
                        <td>
                          <strong>{row.employeeName}</strong>
                          <div className="muted">{row.employeeId ?? 'No active operator'}</div>
                        </td>
                        <td>{formatShortNumber(row.outputCount)}</td>
                        <td>{row.oee.toFixed(0)}%</td>
                        <td>{row.downtimeMinutes}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="AI Shift Optimizer" subtitle="Coverage gaps and reassignment recommendations">
              <div className="optimizer-panel">
                <p className="workforce-note">
                  Analyze the current roster against machine status and ask for a targeted coverage recommendation.
                </p>
                <button type="button" className="btn-primary" onClick={runOptimizer} disabled={optimizerLoading}>
                  {optimizerLoading ? 'Analyzing...' : 'Run AI Optimizer'}
                </button>
                <div className="optimizer-result-card">
                  {optimizerLoading ? (
                    <span>Streaming recommendation...</span>
                  ) : optimizerResult ? (
                    <p>{optimizerResult}</p>
                  ) : (
                    <span>The optimizer will explain coverage gaps, reassignments, and the machines that can sustain output.</span>
                  )}
                </div>
              </div>
            </SectionCard>
          </section>
        </>
      ),
      'Quality & NCR': (
        <>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Quality Snapshot" subtitle="Yield, scrap, and inspection performance this shift">
              <div className="quality-grid">
                {qualityModel.metrics.map((metric) => (
                  <article key={metric.title} className="quality-item">
                    <span>{metric.title}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.note}</small>
                  </article>
                ))}
              </div>
              <div className="quality-summary-line">
                <div>
                  <strong>Highest risk machine</strong>
                  <span>{qualityModel.topRiskMachine ? `${qualityModel.topRiskMachine.pressName} at ${qualityModel.topRiskMachine.oee.toFixed(1)}% OEE` : 'No machine data available'}</span>
                </div>
                <div>
                  <strong>Open NCRs</strong>
                  <span>{qualityModel.openNcrCount}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="AI Quality Analysis" subtitle="Summarize the highest risk machine and current defect trend">
              <div className="analysis-actions">
                <button type="button" className="btn-primary" onClick={runQualityAnalysis} disabled={qualityAnalysisLoading}>
                  {qualityAnalysisLoading ? 'Analyzing...' : 'Run Quality Analysis'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setNcrModalOpen(true)}>
                  Raise NCR
                </button>
              </div>
              <div className="analysis-result-card">
                {qualityAnalysisLoading ? (
                  <span>Streaming quality analysis...</span>
                ) : qualityAnalysisText ? (
                  <p>{qualityAnalysisText}</p>
                ) : (
                  <span>The analyst will call out the riskiest machine, the trending defect, and a practical next step.</span>
                )}
              </div>
            </SectionCard>
          </section>

          <section className="tab-grid tab-grid-2">
            <SectionCard
              title="Defect Themes"
              subtitle="Current defect counts and movement versus the previous shift"
              className="defect-themes-card"
            >
              <div className="defect-list">
                {qualityModel.defectRows.map((defect) => (
                  <article key={defect.type} className="defect-row">
                    <div>
                      <strong>{defect.type}</strong>
                      <span>
                        {defect.count} this shift, {defect.previousCount} prior shift
                      </span>
                    </div>
                    <div className="defect-trend">
                      <span className={`trend-pill tone-${defect.tone}`}>
                        {defect.delta > 0 ? `+${defect.delta}` : defect.delta < 0 ? `${defect.delta}` : '0'}
                      </span>
                      <span className={`trend-arrow tone-${defect.tone}`}>
                        {defect.delta > 0 ? 'Up' : defect.delta < 0 ? 'Down' : 'Flat'}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="NCR Register"
              subtitle="Current nonconformance records for the active shift"
              className="ncr-register-card"
            >
              <div className="ncr-toolbar">
                <button type="button" className="btn-secondary" onClick={() => setNcrModalOpen(true)}>
                  Raise NCR
                </button>
                <span className="ncr-toolbar-copy">{qualityModel.openNcrCount} open record(s)</span>
              </div>
              <div className="ncr-table-wrap">
                <table className="ncr-table">
                  <thead>
                    <tr>
                      <th>NCR #</th>
                      <th>Date</th>
                      <th>Machine</th>
                      <th>Defect Type</th>
                      <th>Qty Affected</th>
                      <th>Status</th>
                      <th>Assigned To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ncrs.map((ncr) => (
                      <tr
                        key={ncr.id}
                        className={`ncr-row tone-${ncrStatusTone(ncr.status)}${highlightedNcr === ncr.id ? ' row-highlighted' : ''}`}
                      >
                        <td>{ncr.id}</td>
                        <td>{formatRelativeDate(ncr.date)}</td>
                        <td>{ncr.machine}</td>
                        <td>{ncr.defectType}</td>
                        <td>{ncr.qtyAffected}</td>
                        <td>
                          <span className={`badge tone-${ncrStatusTone(ncr.status)}`}>{ncr.status}</span>
                        </td>
                        <td>{ncr.assignedTo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </section>
        </>
      ),
      Calibration: (
        <>
          <section className="stat-grid calibration-stats calibration-summary-grid">
            {[
              {
                key: 'All',
                label: 'Total',
                count: calibrationCounts.total,
                note: 'Instruments tracked',
                tone: 'cyan'
              },
              {
                key: 'Current',
                label: 'Current',
                count: calibrationCounts.current,
                note: 'Within interval',
                tone: 'success'
              },
              {
                key: 'Due Soon',
                label: 'Due Soon',
                count: calibrationCounts.dueSoon,
                note: 'Within 30 days',
                tone: 'warning'
              },
              {
                key: 'Overdue',
                label: 'Overdue',
                count: calibrationCounts.overdue,
                note: 'Needs immediate action',
                tone: 'danger'
              }
            ].map((card) => (
              <button
                key={card.key}
                type="button"
                className={`stat-card tone-${card.tone} calibration-summary-card${calibrationStatusFilter === card.key ? ' active' : ''}`}
                onClick={() => openCalibrationDrawer(card.key)}
              >
                <div className="stat-head">
                  <span>{card.label}</span>
                </div>
                <div className="stat-value">{card.count}</div>
                <div className="stat-delta">{card.note}</div>
                <div className="calibration-preview-list">
                  <span className="calibration-preview-chip">Open list</span>
                </div>
              </button>
            ))}
          </section>

          <section className="section-card calibration-panel-shell">
            <div className="section-card-header">
              <div>
                <h3>Calibration Register</h3>
                <p>Sort by any column and open a calibration record for details.</p>
              </div>
              <div className="calibration-toolbar">
                <button type="button" className="btn-primary" onClick={() => setCalibrationModalOpen(true)}>
                  + Add Instrument
                </button>
              </div>
            </div>
            <div className="calibration-filter-bar">
              <label className="scenario-field calibration-search-field">
                <span>Search</span>
                <input
                  type="search"
                  value={calibrationSearch}
                  onChange={(event) => setCalibrationSearch(event.target.value)}
                  placeholder="Asset tag, instrument, location..."
                />
              </label>
              <label className="scenario-field calibration-type-field">
                <span>Type</span>
                <select value={calibrationTypeFilter} onChange={(event) => setCalibrationTypeFilter(event.target.value)}>
                  <option value="All">All types</option>
                  {calibrationTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <div className="calibration-filter-chips">
                {['All', 'Current', 'Due Soon', 'Overdue'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`calibration-filter-chip${calibrationStatusFilter === status ? ' active' : ''}`}
                    onClick={() => setCalibrationStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
                <div className="calibration-filter-summary">
                  Showing {sortedCalibrations.length} of {calibrations.length}
                </div>
              </div>
            <div className="table-scroll">
              <table className="calibration-table">
                <thead>
                  <tr>
                    {[
                      ['assetTag', 'Asset Tag'],
                      ['name', 'Instrument'],
                      ['type', 'Type'],
                      ['location', 'Location'],
                      ['lastCalibrated', 'Last Calibrated'],
                      ['nextDue', 'Next Due'],
                      ['status', 'Status']
                    ].map(([field, label]) => (
                      <th key={field}>
                        <button
                          type="button"
                          className="sortable-head"
                          onClick={() =>
                            setCalibrationSort((current) => ({
                              field,
                              dir: current.field === field && current.dir === 'asc' ? 'desc' : 'asc'
                            }))
                          }
                        >
                          {label}
                          {calibrationSort.field === field ? ` ${calibrationSort.dir === 'asc' ? '^' : 'v'}` : null}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCalibrations.map((instrument) => {
                    const rowTone = calibrationTone(instrument.status);
                    return (
                      <tr
                        key={instrument.assetTag}
                        className={instrument.status === 'Overdue' ? 'row-danger' : instrument.status === 'Due Soon' ? 'row-warning' : ''}
                        onClick={() => setSelectedCalibrationAssetTag(instrument.assetTag)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="mono">{instrument.assetTag}</td>
                        <td>
                          <strong>{instrument.name}</strong>
                        </td>
                        <td>{instrument.type}</td>
                        <td>{instrument.location}</td>
                        <td>{new Date(instrument.lastCalibrated).toLocaleDateString()}</td>
                        <td>{new Date(instrument.nextDue).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge tone-${rowTone}`}>{instrument.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ),
      Certifications: (
        <>
          <section className="section-card">
            <div className="section-card-header">
              <div>
                <h3>Compliance Overview</h3>
                <p>Certification coverage across the current active roster.</p>
              </div>
            </div>
            <div className="quality-grid certification-grid">
              <article className="quality-item">
                <span>Total Employees</span>
                <strong>{certModel.certCounts.total}</strong>
              </article>
              <article className="quality-item">
                <span>Fully Certified</span>
                <strong>{certModel.certCounts.fullyCertified}</strong>
              </article>
              <article className="quality-item">
                <span>Expiring Soon</span>
                <strong>{certModel.certCounts.expiringSoon}</strong>
              </article>
              <article className="quality-item">
                <span>Expired</span>
                <strong>{certModel.certCounts.expired}</strong>
              </article>
            </div>
          </section>

          <section className="tab-grid tab-grid-2">
            <SectionCard
              title="Coverage Gap Alerts"
              subtitle="Expired machine certifications that create a staffing gap"
              className="coverage-gap-alerts-card"
            >
              <div className="workforce-alert-stack">
                {certModel.coverageGaps.map((employee) => {
                  const machineCert = employee.certifications.find((cert) =>
                    cert.name.toLowerCase().includes(employee.assignedMachine.toLowerCase())
                  );
                  const daysAgo = Math.floor((Date.now() - (machineCert?.expiryDate ?? Date.now())) / 86400000);

                  return (
                    <article key={employee.id} className="alert-card tone-danger workforce-alert-card">
                      <div className="alert-head">
                        <strong>{employee.name}</strong>
                        <span>{employee.id}</span>
                      </div>
                      <p>
                        Coverage gap: {employee.name} ({employee.id}) is assigned to {employee.assignedMachine} but their Machine Operation certification expired {daysAgo} day(s) ago.
                      </p>
                    </article>
                  );
                })}

                {!certModel.coverageGaps.length ? (
                  <div className="note-row">
                    <strong>No coverage gaps</strong>
                    <span>All machine certifications are current.</span>
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard
              title="Employee Certification Matrix"
              subtitle="Click a row to inspect and log new training"
              className="cert-matrix-card"
            >
              <div className="table-scroll">
                <table className="cert-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Role</th>
                      <th>Assigned Machine</th>
                      <th>Status</th>
                      <th>Certifications</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certModel.sortedEmployees.map((employee) => {
                      const rowStatus = getEmployeeStatus(employee);
                      return (
                        <tr
                          key={employee.id}
                          className={rowStatus === 'Expired' ? 'row-danger' : rowStatus === 'Expiring Soon' ? 'row-warning' : ''}
                          onClick={() => setSelectedEmployeeId(employee.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <strong>{employee.name}</strong>
                            <div className="muted">{employee.id}</div>
                          </td>
                          <td>{employee.role}</td>
                          <td>{employee.assignedMachine}</td>
                          <td>
                            <span className={`badge tone-${rowStatus === 'Expired' ? 'danger' : rowStatus === 'Expiring Soon' ? 'warning' : 'success'}`}>
                              {rowStatus}
                            </span>
                          </td>
                          <td>{employee.certifications.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </section>
        </>
      ),
      Suppliers: (
        <>
          <section className="section-card">
            <div className="section-card-header">
              <div>
                <h3>Supplier Qualification Overview</h3>
                <p>Coverage across approved, requalification due, and on-hold suppliers.</p>
              </div>
            </div>
            <div className="supplier-filter-bar">
              <label className="scenario-field supplier-search-field">
                <span>Search</span>
                <input
                  type="search"
                  placeholder="Supplier, ID, status, risk, or material"
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                />
              </label>
              <label className="scenario-field supplier-material-field">
                <span>Material</span>
                <select value={supplierMaterialFilter} onChange={(event) => setSupplierMaterialFilter(event.target.value)}>
                  <option value="All">All materials</option>
                  {supplierModel.supplierMaterials.map((material) => (
                    <option key={material} value={material}>
                      {material}
                    </option>
                  ))}
                </select>
              </label>
              <label className="scenario-field supplier-status-field">
                <span>Status</span>
                <select value={supplierStatusFilter} onChange={(event) => setSupplierStatusFilter(event.target.value)}>
                  <option value="All">All statuses</option>
                  <option value="Approved">Approved</option>
                  <option value="Requalification Due">Requalification Due</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </label>
              <label className="scenario-field supplier-risk-field">
                <span>Risk</span>
                <select value={supplierRiskFilter} onChange={(event) => setSupplierRiskFilter(event.target.value)}>
                  <option value="All">All risks</option>
                  <option value="High">High risk</option>
                  <option value="Medium">Medium risk</option>
                  <option value="Low">Low risk</option>
                </select>
              </label>
              <div className="supplier-filter-summary">
                Showing {supplierModel.sortedSuppliers.length} of {supplierModel.supplierCounts.total}
              </div>
            </div>
            <div className="quality-grid supplier-summary-grid">
              <article className="quality-item">
                <span>Total Suppliers</span>
                <strong>{supplierModel.supplierCounts.total}</strong>
              </article>
              <article className="quality-item">
                <span>Approved</span>
                <strong>{supplierModel.supplierCounts.approved}</strong>
              </article>
              <article className="quality-item">
                <span>Requalification Due</span>
                <strong>{supplierModel.supplierCounts.requalDue}</strong>
              </article>
              <article className="quality-item">
                <span>On Hold</span>
                <strong>{supplierModel.supplierCounts.onHold}</strong>
              </article>
            </div>
          </section>

          <section className="section-card supplier-register-card">
            <div className="section-card-header">
              <div>
                <h3>Supplier Register</h3>
                <p>Audit score, qualification status, and delivery risk at a glance.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="supplier-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Materials</th>
                    <th>Audit Score</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>History</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierModel.sortedSuppliers.map((supplier) => {
                    const trend = getSupplierAuditTrend(supplier);
                    return (
                      <tr
                        key={supplier.id}
                        className={supplier.status === 'Suspended' ? 'row-danger' : supplier.status === 'Requalification Due' ? 'row-warning' : ''}
                        onClick={() => setSelectedSupplierId(supplier.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <strong>{supplier.name}</strong>
                          <div className="muted">{supplier.id}</div>
                        </td>
                        <td>{supplier.materials.join(', ')}</td>
                        <td style={{ color: supplier.auditScore >= 80 ? 'var(--success)' : supplier.auditScore >= 60 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>
                          {supplier.auditScore}
                        </td>
                        <td>
                          <span className={`badge tone-${getSupplierStatusTone(supplier.status)}`}>{supplier.status}</span>
                        </td>
                        <td>
                          <span className={`badge tone-${supplier.effectiveRiskLevel === 'High' ? 'danger' : supplier.effectiveRiskLevel === 'Medium' ? 'warning' : 'success'}`}>
                            {supplier.effectiveRiskLevel} Risk
                          </span>
                        </td>
                        <td>
                          {supplier.auditHistory?.length ?? 0} entries
                          {trend === 'declining' ? <div className="supplier-warning">↓ Declining</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ),
      CAPA: (
        <>
          <section className="section-card">
            <div className="section-card-header">
              <div>
                <h3>CAPA Tracker</h3>
                <p>Track corrective actions through root cause, containment, verification, and closeout.</p>
              </div>
            </div>
            <div className="quality-grid capa-summary-grid">
              <article className="quality-item">
                <span>Total CAPAs</span>
                <strong>{capaModel.capaCounts.total}</strong>
              </article>
              <article className="quality-item">
                <span>Open</span>
                <strong>{capaModel.capaCounts.open}</strong>
              </article>
              <article className="quality-item">
                <span>In Progress</span>
                <strong>{capaModel.capaCounts.inProgress}</strong>
              </article>
              <article className="quality-item">
                <span>Overdue</span>
                <strong>{capaModel.capaCounts.overdue}</strong>
              </article>
              <article className="quality-item">
                <span>Closed This Month</span>
                <strong>{capaModel.capaCounts.closedThisMonth}</strong>
              </article>
            </div>
          </section>

          <SectionCard
            title="CAPA Register"
            subtitle="Click a record to inspect the stage workflow and root cause work"
            className="capa-register-card"
          >
            <div className="capa-list">
              {capaModel.sortedCapas.map((capa) => {
                const tone = getCapaStatusTone(capa.status);
                const progress = getCapaStageProgress(capa);
                return (
                  <article
                    key={capa.id}
                    className={`capa-card${selectedCapaId === capa.id ? ' capa-card-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCapaId(capa.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedCapaId(capa.id);
                      }
                    }}
                  >
                    <div className="capa-card-top">
                      <div>
                        <strong>{capa.id}</strong>
                        <span>{capa.machine} · {capa.defectType}</span>
                      </div>
                      <span className={`badge tone-${tone}`}>{capa.status}</span>
                    </div>
                    <p>{capa.issueDescription}</p>
                    <div className="capa-progress-row">
                      <span>{formatCapaDueDate(capa.dueDate)}</span>
                      <span>{progress}% complete</span>
                    </div>
                    <div className="capa-progress-bar">
                      <div className="capa-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="capa-meta">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveTab('Quality & NCR');
                          setHighlightedNcr(capa.ncrId);
                        }}
                      >
                        {capa.ncrId} →
                      </button>
                      <span>{capa.stageHistory?.length ?? 0} stages</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </SectionCard>
        </>
      ),
      'Anomaly Detector': (
        <>
          <section className="tab-grid tab-grid-2">
            <SectionCard title="Detection Summary" subtitle="Rules are watching current machine behavior">
              <div className="quality-grid anomaly-summary-grid">
                <article className="quality-item">
                  <span>Active</span>
                  <strong>{activeAnomalies.length}</strong>
                </article>
                <article className="quality-item">
                  <span>Critical</span>
                  <strong>{activeAnomalies.filter((item) => item.severity === 'Critical').length}</strong>
                </article>
                <article className="quality-item">
                  <span>Warnings</span>
                  <strong>{activeAnomalies.filter((item) => item.severity === 'Warning').length}</strong>
                </article>
                <article className="quality-item">
                  <span>Resolved</span>
                  <strong>{anomalies.filter((item) => item.resolved).length}</strong>
                </article>
              </div>
              <p className="workforce-note">
                Detection fires on down states, OEE drops, status changes, and sustained low OEE below the current thresholds.
              </p>
            </SectionCard>

            <SectionCard title="Selected Anomaly" subtitle="Open a machine to inspect details and get AI diagnosis">
              {selectedAnomaly ? (
                <div className="selected-anomaly-card">
                  <div className="selected-anomaly-head">
                    <div>
                      <strong>{selectedAnomaly.machine}</strong>
                      <span>{selectedAnomaly.metric}</span>
                    </div>
                    <span className={`badge tone-${anomalyTone(selectedAnomaly.severity)}`}>
                      {selectedAnomaly.severity}
                    </span>
                  </div>
                  <p>{selectedAnomaly.description}</p>
                  <div className="selected-anomaly-meta">
                    <span>OEE {selectedAnomaly.currentOee?.toFixed(1)}%</span>
                    <span>{selectedAnomaly.status}</span>
                    <span>{formatRelativeMinutes(selectedAnomaly.detectedAt)}</span>
                  </div>
                  <button type="button" className="btn-primary" onClick={() => setSelectedAnomalyId(selectedAnomaly.id)}>
                    Open Detail Panel
                  </button>
                </div>
              ) : (
                <div className="note-row">
                  <strong>No active anomaly selected</strong>
                  <span>Click a machine below to open the detail panel.</span>
                </div>
              )}
            </SectionCard>
          </section>

          <SectionCard
            title="Active Anomalies"
            subtitle="Current anomaly queue across the machine fleet"
            className="active-anomalies-card"
          >
            <div className="anomaly-list">
              {activeAnomalies.length > 0 ? (
                activeAnomalies.map((anomaly) => (
                  <button
                    key={anomaly.id}
                    type="button"
                    className={`anomaly-card ${selectedAnomaly?.id === anomaly.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAnomalyId(anomaly.id)}
                  >
                    <div className="anomaly-card-top">
                      <div>
                        <strong>{anomaly.machine}</strong>
                        <span>{anomaly.metric}</span>
                      </div>
                      <span className={`badge tone-${anomalyTone(anomaly.severity)}`}>{anomaly.severity}</span>
                    </div>
                    <p>{anomaly.description}</p>
                    <div className="anomaly-card-foot">
                      <span>{anomaly.currentOee?.toFixed(1)}% OEE</span>
                      <span>{formatRelativeMinutes(anomaly.detectedAt)}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="note-row">
                  <strong>No active anomalies</strong>
                  <span>Monitoring continues on each live tick.</span>
                </div>
              )}
            </div>
          </SectionCard>

          {anomalies.some((item) => item.resolved) ? (
            <SectionCard
              title="Resolved Anomalies"
              subtitle="Fading items are removed after a short delay"
              className="resolved-anomalies-card"
            >
              <div className="anomaly-list resolved-list">
                {anomalies
                  .filter((item) => item.resolved)
                  .slice(0, 4)
                  .map((anomaly) => (
                    <div key={`${anomaly.id}-resolved`} className="anomaly-card resolved">
                      <div className="anomaly-card-top">
                        <div>
                          <strong>{anomaly.machine}</strong>
                          <span>{anomaly.metric}</span>
                        </div>
                        <span className="badge tone-muted">Resolved</span>
                      </div>
                      <p>{anomaly.description}</p>
                    </div>
                  ))}
              </div>
            </SectionCard>
          ) : null}
        </>
      ),
      Reports: (
        <>
          <section className="report-stack">
            <SectionCard title="Daily Reports" subtitle="Generate and share the current shift handover">
              <div className="report-controls">
                <label className="report-date-picker">
                  <span>Report Date</span>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(event) => setReportDate(event.target.value)}
                    max={getLocalDateInputValue()}
                  />
                </label>
                <div className="report-actions">
                  <button type="button" className="btn-primary" onClick={runShiftReport} disabled={reportLoading}>
                    {reportLoading ? 'Generating...' : 'Generate Shift Report'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={handleCopyReport} disabled={!reportText.trim()}>
                    Copy to Clipboard
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => handleExportReport('csv')} disabled={reportLoading}>
                    Export CSV
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => handleExportReport('pdf')} disabled={reportLoading}>
                    Export PDF
                  </button>
                </div>
              </div>

              <div className="report-card-shell" id="report-card-shell">
                {selectedReportHistoryId ? (
                  <div className="report-view-banner">
                    Viewing saved report from history
                  </div>
                ) : null}
                {reportLoading ? (
                  <div className="loading-state">Streaming shift report...</div>
                ) : reportText ? (
                  <ReportCard text={reportText} activeShift={shift} />
                ) : (
                  <div className="placeholder-card report-placeholder">
                    <h2>Daily Shift Report</h2>
                    <p>Generate a report for the selected date with performance, issues, handover notes, and recommendations.</p>
                    <span className="badge tone-muted">Not Generated</span>
                  </div>
                )}
              </div>

              <div className="report-history">
                <div className="section-card-header compact-header">
                  <div>
                    <h3>Report History</h3>
                    <p>Last five generated reports for quick review.</p>
                  </div>
                </div>
                {reportHistory.length > 0 ? (
                  <div className="report-history-list">
                    {reportHistory.map((entry) => (
                      <div key={entry.id} className="report-history-row">
                        <div>
                          <strong>{entry.shiftName}</strong>
                          <span>
                            {entry.reportDate ? `Report date: ${entry.reportDate} · ` : ''}
                            {new Date(entry.generatedAt).toLocaleString()}
                          </span>
                        </div>
                        <button type="button" className="btn-secondary" onClick={() => handleViewReport(entry)}>
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="note-row">
                    <strong>No reports yet</strong>
                    <span>Generate a shift report to populate history.</span>
                  </div>
                )}
              </div>
            </SectionCard>
            <SectionCard title="Historical Trends" subtitle="Six to eight months of operational history">
              <div className="history-toolbar">
                {[30, 90, 180, 210].map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={`filter-chip ${historyRangeDays === days ? 'active' : ''}`}
                    onClick={() => loadHistory(days)}
                  >
                    {days}d
                  </button>
                ))}
                <button type="button" className="btn-secondary" onClick={() => loadHistory(historyRangeDays)} disabled={historyLoading}>
                  {historyLoading ? 'Loading...' : 'Refresh History'}
                </button>
              </div>
              {historyError ? <div className="history-error">{historyError}</div> : null}
              <div className="history-grid">
                <div className="history-card">
                  <h4>Operational Insights</h4>
                  {historyInsights ? (
                    <div className="history-insight-list">
                      <div><strong>Average OEE</strong><span>{historyInsights.summary.avgOee?.toFixed?.(1) ?? 'N/A'}%</span></div>
                      <div><strong>Total Output</strong><span>{Math.round(historyInsights.summary.totalOutput || 0).toLocaleString()}</span></div>
                      <div><strong>Downtime</strong><span>{Math.round(historyInsights.summary.downtimeMinutes || 0)}m</span></div>
                      <div><strong>Avg Quality</strong><span>{historyInsights.summary.avgQualityRate?.toFixed?.(1) ?? 'N/A'}%</span></div>
                    </div>
                  ) : (
                    <p className="muted-copy">Insights appear here once history is loaded.</p>
                  )}
                </div>
                <div className="history-card history-patterns history-patterns-compact">
                  <h4>Recurring Patterns</h4>
                  {historyInsights?.eventBreakdown?.length ? (
                    <div className="history-pattern-list">
                      {historyInsights.eventBreakdown.slice(0, 4).map((item) => (
                        <div key={`${item.eventType}-${item.severity}`} className="history-pattern-row">
                          <div>
                            <strong>{item.eventType}</strong>
                            <p>{item.severity}</p>
                          </div>
                          <span>{item.count} event{item.count === 1 ? '' : 's'}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-copy">Pattern breakdown appears once history is loaded.</p>
                  )}
                </div>
              </div>
            </SectionCard>

            </section>
        </>
      ),
      Alerts: (
        <>
          <section className="tab-grid tab-grid-2">
            <SectionCard
              title="Open Alerts"
              subtitle="Sorted by severity for the current shift"
              className="open-alerts-card"
            >
              <div className="alerts-list single-column">
                {payload.alerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    className={`alert-card alert-card-button tone-${alert.severity}${selectedAlertId === alert.id ? ' active' : ''}`}
                    onClick={() => setSelectedAlertId(alert.id)}
                  >
                    <div className="alert-head">
                      <strong>{alert.title}</strong>
                      <span>{alert.createdAt}</span>
                    </div>
                    <p>{alert.message}</p>
                  </button>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Escalation Rules" subtitle="Demo workflow for the alert queue">
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
          <section className="section-card">
            <div className="section-card-header">
              <div>
                <h3>Anomaly Detection Thresholds</h3>
                <p>Adjust detection sensitivity for live machine monitoring.</p>
              </div>
            </div>
            <div className="threshold-grid">
              <label className="threshold-field">
                <span>OEE Warning Drop (%)</span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={anomalyThresholds.warningOeeDrop}
                  onChange={(event) =>
                    setAnomalyThresholds((current) => ({
                      ...current,
                      warningOeeDrop: Number(event.target.value) || 0
                    }))
                  }
                />
              </label>
              <label className="threshold-field">
                <span>Critical OEE Floor (%)</span>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={anomalyThresholds.criticalOee}
                  onChange={(event) =>
                    setAnomalyThresholds((current) => ({
                      ...current,
                      criticalOee: Number(event.target.value) || 0
                    }))
                  }
                />
              </label>
              <label className="threshold-field">
                <span>Sustained Ticks for Critical</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={anomalyThresholds.sustainedTicks}
                  onChange={(event) =>
                    setAnomalyThresholds((current) => ({
                      ...current,
                      sustainedTicks: Math.max(1, Number(event.target.value) || 1)
                    }))
                  }
                />
              </label>
            </div>
          </section>

          <section className="tab-grid tab-grid-3 integrations-layout">
            <SectionCard title="Data Health" subtitle="PostgreSQL source coverage and worker checkpoints">
              <div className="admin-ai-actions">
                <button type="button" className="btn-secondary" onClick={() => loadDataHealth()} disabled={dataHealthLoading}>
                  {dataHealthLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              {dataHealthError ? <p className="admin-ai-error">{dataHealthError}</p> : null}
              <div className="note-list settings-profile-list">
                {(dataHealth?.tables ?? []).slice(0, 8).map((table) => (
                  <div key={table.table} className="note-row">
                    <strong>{table.table}</strong>
                    <span>
                      {table.rows} rows{table.min_date && table.max_date ? ` | ${table.min_date} to ${table.max_date}` : ''}
                    </span>
                  </div>
                ))}
                {!dataHealthLoading && !(dataHealth?.tables ?? []).length ? (
                  <div className="note-row">
                    <strong>Status</strong>
                    <span>No data-health response loaded yet.</span>
                  </div>
                ) : null}
              </div>
              <div className="note-list settings-profile-list">
                {(dataHealth?.checkpoints ?? []).slice(0, 3).map((checkpoint) => (
                  <div key={checkpoint.source_name} className="note-row">
                    <strong>{checkpoint.source_name}</strong>
                    <span>{checkpoint.row_count} rows | {new Date(checkpoint.updated_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="AI Gap Proposals"
              subtitle="Failure patterns and suggested retrieval updates from recent AI interactions"
              className="settings-ai-card"
            >
              <div className="admin-ai-toolbar">
                <div className="admin-ai-toolbar-group">
                  <label className="admin-ai-control">
                    <span>Filter</span>
                    <select value={adminAiGapsStatus} onChange={(event) => setAdminAiGapsStatus(event.target.value)}>
                      <option value="all">All</option>
                      <option value="proposed">Proposed</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                  <label className="admin-ai-control">
                    <span>Limit</span>
                    <select value={adminAiGapsLimit} onChange={(event) => setAdminAiGapsLimit(Number(event.target.value))}>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                </div>
                <div className="admin-ai-actions">
                  <button type="button" className="btn-secondary" onClick={() => loadAdminAiGaps()} disabled={adminAiGapsLoading}>
                    Refresh
                  </button>
                  <button type="button" className="btn-primary" onClick={() => loadAdminAiGaps({ analyze: true })} disabled={adminAiGapsLoading}>
                    Analyze Failures
                  </button>
                </div>
              </div>

              {adminAiGapMessage ? <p className="admin-ai-note">{adminAiGapMessage}</p> : null}
              {adminAiGapsError ? <p className="admin-ai-error">{adminAiGapsError}</p> : null}

              <div className="admin-ai-grid">
                <div className="admin-ai-list">
                  {adminAiGapsLoading ? <div className="admin-ai-empty">Loading gap proposals...</div> : null}
                  {!adminAiGapsLoading && !adminAiGaps.length ? (
                    <div className="admin-ai-empty">No AI gaps recorded yet. Run an analysis after collecting failures.</div>
                  ) : null}
                  {adminAiGaps.map((gap) => {
                    const isSelected = gap.id === selectedAdminAiGap?.id;
                    return (
                      <button
                        key={gap.id}
                        type="button"
                        className={`admin-ai-gap ${isSelected ? 'selected' : ''}`}
                        onClick={() => setAdminAiGapSelectedId(gap.id)}
                      >
                        <div className="admin-ai-gap-head">
                          <strong>{gap.capabilityName || gap.gapKey}</strong>
                          <span>{gap.failureCount} failure{gap.failureCount === 1 ? '' : 's'}</span>
                        </div>
                        <div className="admin-ai-gap-meta">
                          <span>{gap.gapType}</span>
                          <span>{gap.status}</span>
                        </div>
                        <div className="admin-ai-gap-queries">
                          {(gap.exampleQueries ?? []).slice(0, 2).map((query) => (
                            <span key={query}>{query}</span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="admin-ai-detail">
                  {selectedAdminAiGap ? (
                    <>
                      <div className="admin-ai-detail-head">
                        <div>
                          <h4>{selectedAdminAiGap.capabilityName || selectedAdminAiGap.gapKey}</h4>
                          <p>{selectedAdminAiGap.gapType}</p>
                        </div>
                        <span className={`badge badge-${selectedAdminAiGap.status === 'resolved' ? 'success' : 'warning'}`}>
                          {selectedAdminAiGap.status}
                        </span>
                      </div>
                      <div className="admin-ai-stats">
                        <div>
                          <strong>{selectedAdminAiGap.failureCount}</strong>
                          <span>Failures</span>
                        </div>
                        <div>
                          <strong>{selectedAdminAiGap.frequency}</strong>
                          <span>Frequency</span>
                        </div>
                        <div>
                          <strong>{(selectedAdminAiGap.exampleQueries ?? []).length}</strong>
                          <span>Examples</span>
                        </div>
                      </div>
                      <div className="admin-ai-section">
                        <h5>Example queries</h5>
                        <ul className="admin-ai-query-list">
                          {(selectedAdminAiGap.exampleQueries ?? []).length ? (
                            selectedAdminAiGap.exampleQueries.map((query) => <li key={query}>{query}</li>)
                          ) : (
                            <li>No examples captured yet.</li>
                          )}
                        </ul>
                      </div>
                      <div className="admin-ai-section">
                        <h5>Proposal</h5>
                        <pre className="admin-ai-proposal">{JSON.stringify(selectedAdminAiProposal ?? selectedAdminAiGap.proposal ?? {}, null, 2)}</pre>
                      </div>
                      <div className="admin-ai-actions admin-ai-actions-inline">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={async () => {
                            await fetch(`/api/admin/ai-gaps/${selectedAdminAiGap.id}/propose`, { method: 'POST' });
                            await loadAdminAiGaps();
                          }}
                          disabled={adminAiGapsLoading}
                        >
                          Draft Proposal
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={async () => {
                            await fetch(`/api/admin/ai-gaps/${selectedAdminAiGap.id}/approve`, { method: 'POST' });
                            await loadAdminAiGaps();
                          }}
                          disabled={adminAiGapsLoading}
                        >
                          Mark Resolved
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="admin-ai-empty">Select a gap to inspect the proposal.</div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Last Sync" subtitle="Recent integration activity and freshness">
              <div className="sync-log">
                {syncLog.map((entry) => (
                  <div key={entry.system} className="sync-row">
                    <div>
                      <strong>{entry.system}</strong>
                      <span>{entry.records}</span>
                    </div>
                    <div className="sync-meta">
                      <span>{entry.timestamp}</span>
                      <span className={`integration-badge tone-${integrationTone(entry.status)}`}>
                        {entry.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Data Flow" subtitle="Where operational data moves between systems">
              <div className="data-flow">
                <div className="flow-col">
                  <h4>Sources</h4>
                  <div className="flow-list">
                    <span className="flow-token">ERP</span>
                    <span className="flow-token">MES</span>
                    <span className="flow-token">Machine PLCs</span>
                  </div>
                </div>
                <div className="flow-bridge" aria-hidden="true">
                  <span className="flow-arrow">→</span>
                  <span className="flow-line" />
                  <span className="flow-arrow">→</span>
                </div>
                <div className="flow-col">
                  <h4>Plant Apps</h4>
                  <div className="flow-list">
                    <span className="flow-token">Dashboard</span>
                    <span className="flow-token">Alerts</span>
                    <span className="flow-token">Reports</span>
                    <span className="flow-token">AI Assist</span>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Profile & Preferences" subtitle="Demo configuration controls and account details">
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
              <div className="note-list settings-profile-list">
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

          {requestModalOpen ? (
            <div className="modal-overlay" onClick={() => setRequestModalOpen(false)}>
              <div className="scenario-modal request-modal" onClick={(event) => event.stopPropagation()}>
                <div className="panel-header">
                  <h2>Request Integration</h2>
                  <button className="panel-close" type="button" onClick={() => setRequestModalOpen(false)} aria-label="Close modal">
                    x
                  </button>
                </div>

                <form
                  className="request-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleRequestIntegration();
                  }}
                >
                  <label className="scenario-field">
                    <span>System</span>
                    <input type="text" value={requestSystem} readOnly />
                  </label>
                  <label className="scenario-field">
                    <span>Tell us about your {requestSystem || 'system'} environment</span>
                    <textarea
                      rows="4"
                      value={requestText}
                      onChange={(event) => setRequestText(event.target.value)}
                    />
                  </label>
                  <button type="submit" className="btn-primary" disabled={!requestSystem.trim() || !requestText.trim()}>
                    Submit Request
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </>
      )
    };
  }, [
    payload,
    stats,
    freshnessSeconds,
    shiftSummaries,
    criticalDismissed,
    scenarioLoading,
    scenarioResult,
    workforceModel,
    performanceSort,
    optimizerLoading,
    optimizerResult,
    anomalies,
    activeAnomalies,
    selectedAnomaly,
    anomalyThresholds,
    calibrations,
    calibrationCounts,
    sortedCalibrations,
    calibrationSort,
    selectedCalibrationAssetTag,
    certModel,
    qualityModel,
    ncrs,
    qualityAnalysisText,
    qualityAnalysisLoading,
    requestModalOpen,
    requestSystem,
    requestText,
    ncrModalOpen,
    ncrForm,
    shift
  ]);

  const navMenu = (
    <nav className="sidebar-nav">
      {navSections.map((section) => (
        <div key={section.label} className="sidebar-section">
          <div className="nav-section-header">{section.label}</div>
          {section.tabs.map((item) => (
            <button
              key={item}
              className={`nav-item ${activeTab === item ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setActiveTab(item);
                setMobileNavOpen(false);
              }}
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
          onClick={() => {
            setActiveTab('Settings');
            setMobileNavOpen(false);
          }}
        >
          <span className="nav-tab">
            <span className="nav-dot" />
            <span className="nav-tab-label">Settings</span>
          </span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className="app-shell">
      <section className="dashboard-panel">
        <div className="dashboard-frame">
          <aside className="sidebar">
            <div className="sidebar-logo" aria-label="Qentropix logo">
              <img src={appLogoUrl} alt="" aria-hidden="true" />
            </div>
            {navMenu}
          </aside>

          <main className="dashboard-content">
            <header className="topbar">
              <div className="topbar-title-wrap">
                <button
                  type="button"
                  className="mobile-nav-toggle"
                  onClick={() => setMobileNavOpen((current) => !current)}
                  aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  aria-expanded={mobileNavOpen}
                  aria-controls="mobile-nav-drawer"
                >
                  <span />
                  <span />
                  <span />
                </button>
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
              tabContent?.[activeTab] ?? null
            )}
          </main>
        </div>
      </section>

      {mobileNavOpen ? (
        <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)}>
          <aside
            id="mobile-nav-drawer"
            className="mobile-nav-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-nav-drawer-header">
              <div className="sidebar-logo" aria-label="Qentropix logo">
                <img src={appLogoUrl} alt="" aria-hidden="true" />
              </div>
              <button type="button" className="mobile-nav-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation menu">
                ×
              </button>
            </div>
            {navMenu}
          </aside>
        </div>
      ) : null}

      <button
        type="button"
        className="assistant-toggle"
        onClick={() => setAssistantOpen((current) => !current)}
        aria-expanded={assistantOpen}
        aria-controls="assistant-panel"
      >
        <ChatIcon />
        <span>Ask AI</span>
      </button>

      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        activeShift={shift}
        activeTab={activeTab}
        data={payload}
        ncrs={ncrs}
        capas={capas}
        anomalies={anomalies}
        messages={assistantMessages}
        onSendMessage={handleAssistantMessage}
        onSubmitFeedback={submitAssistantFeedback}
        streaming={assistantStreaming}
      />

      <div
        className={`calibration-drawer-backdrop${calibrationDrawerOpen ? ' open' : ''}`}
        onClick={() => setCalibrationDrawerOpen(false)}
      >
        <aside className="calibration-drawer" onClick={(event) => event.stopPropagation()}>
          <button
            className="panel-close"
            type="button"
            onClick={() => setCalibrationDrawerOpen(false)}
            aria-label="Close calibration drawer"
          >
            x
          </button>

          <div className="calibration-drawer-header">
            <div>
              <h3>{calibrationStatusFilter === 'All' ? 'All Instruments' : `${calibrationStatusFilter} Instruments`}</h3>
              <p>{calibrationDrawerInstruments.length} instrument(s) in this list</p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCalibrationStatusFilter('All');
                setCalibrationDrawerOpen(false);
              }}
            >
              Show All
            </button>
          </div>

          <div className="calibration-drawer-list">
            {calibrationDrawerInstruments.length > 0 ? (
              calibrationDrawerInstruments.map((instrument) => (
                <button
                  key={instrument.assetTag}
                  type="button"
                  className={`calibration-drawer-item${selectedCalibrationAssetTag === instrument.assetTag ? ' active' : ''}`}
                  onClick={() => setSelectedCalibrationAssetTag(instrument.assetTag)}
                >
                  <strong>{instrument.assetTag}</strong>
                  <span>{instrument.name}</span>
                  <small>
                    {instrument.location} · {instrument.type} · {instrument.status}
                  </small>
                </button>
              ))
            ) : (
              <div className="note-row">
                <strong>No instruments in this group</strong>
                <span>Try another calibration status filter.</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      <PressPanel
        press={selectedPress}
        onClose={() => setSelectedPress(null)}
        onSaveMaintenanceNotes={handleSaveMaintenanceNotes}
      />
      <CalibrationPanel
        instrument={selectedCalibration}
        onClose={() => setSelectedCalibrationAssetTag(null)}
        onSchedule={handleScheduleCalibration}
      />
      <CertificationPanel
        employee={certModel.selectedEmployee}
        onClose={() => setSelectedEmployeeId(null)}
        onLogTraining={handleLogTraining}
      />
      <SupplierPanel
        supplier={supplierModel.selectedSupplier}
        onClose={() => setSelectedSupplierId(null)}
        onStatusChange={handleSupplierStatusChange}
        onScheduleAudit={handleScheduleAudit}
      />
      <CapaPanel
        capa={capaModel.selectedCapa}
        onClose={() => setSelectedCapaId(null)}
        onAdvanceStage={handleAdvanceCapaStage}
        onToggleAction={handleToggleCapaAction}
        onOpenSourceNcr={(ncrId) => {
          setActiveTab('Quality & NCR');
          setHighlightedNcr(ncrId);
        }}
        apiBase={baseUrl}
      />
      <AnomalyPanel
        anomaly={selectedAnomaly}
        press={selectedAnomaly && payload?.presses ? payload.presses.find((item) => item.pressName === selectedAnomaly.machine) ?? null : null}
        apiBase={baseUrl}
        onClose={() => setSelectedAnomalyId(null)}
        onCreateAlert={handleCreateAnomalyAlert}
        onDismiss={handleDismissAnomaly}
      />
      <AlertPanel
        alert={selectedAlert}
        onClose={() => setSelectedAlertId(null)}
        onDelete={handleDeleteAlert}
      />
      <OrderPanel
        order={selectedOrder}
        press={
          selectedOrder
            ? payload?.presses.find((item) => item.pressName === selectedOrder.machineAssigned)
            : null
        }
        ncrs={ncrs}
        onClose={() => setSelectedOrder(null)}
      />
      {toastMessage ? <div className="toast-notification">{toastMessage}</div> : null}
      {calibrationModalOpen ? (
        <div className="modal-overlay" onClick={() => setCalibrationModalOpen(false)}>
          <div className="scenario-modal calibration-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>Add Instrument</h2>
              <button className="panel-close" type="button" onClick={() => setCalibrationModalOpen(false)} aria-label="Close modal">
                x
              </button>
            </div>

            <form
              className="scenario-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleAddInstrument();
              }}
            >
              <label className="scenario-field">
                <span>Asset Tag</span>
                <input
                  type="text"
                  value={calibrationForm.assetTag}
                  onChange={(event) => setCalibrationForm((current) => ({ ...current, assetTag: event.target.value }))}
                />
              </label>
              <label className="scenario-field">
                <span>Name</span>
                <input
                  type="text"
                  value={calibrationForm.name}
                  onChange={(event) => setCalibrationForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="scenario-field">
                <span>Type</span>
                <select
                  value={calibrationForm.type}
                  onChange={(event) => setCalibrationForm((current) => ({ ...current, type: event.target.value }))}
                >
                  <option value="Gauge">Gauge</option>
                  <option value="Torque Tool">Torque Tool</option>
                  <option value="Sensor">Sensor</option>
                  <option value="Vision System">Vision System</option>
                  <option value="Micrometer">Micrometer</option>
                  <option value="Thermometer">Thermometer</option>
                  <option value="Alignment">Alignment</option>
                  <option value="Timer">Timer</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="scenario-field">
                <span>Location</span>
                <input
                  type="text"
                  value={calibrationForm.location}
                  onChange={(event) => setCalibrationForm((current) => ({ ...current, location: event.target.value }))}
                />
              </label>
              <label className="scenario-field">
                <span>Interval Days</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={calibrationForm.intervalDays}
                  onChange={(event) => setCalibrationForm((current) => ({ ...current, intervalDays: event.target.value }))}
                />
              </label>
              <label className="scenario-field">
                <span>Last Calibrated</span>
                <input
                  type="date"
                  value={calibrationForm.lastCalibrated}
                  onChange={(event) => setCalibrationForm((current) => ({ ...current, lastCalibrated: event.target.value }))}
                />
              </label>
              <label className="scenario-field">
                <span>Performed By</span>
                <input
                  type="text"
                  value={calibrationForm.calibratedBy}
                  onChange={(event) => setCalibrationForm((current) => ({ ...current, calibratedBy: event.target.value }))}
                  placeholder="Internal QA"
                />
              </label>
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  !calibrationForm.assetTag.trim() ||
                  !calibrationForm.name.trim() ||
                  !calibrationForm.location.trim() ||
                  !calibrationForm.lastCalibrated ||
                  !calibrationForm.intervalDays
                }
              >
                Add Instrument
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {ncrModalOpen && payload ? (
        <div className="modal-overlay" onClick={() => setNcrModalOpen(false)}>
          <div className="scenario-modal quality-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>Raise NCR</h2>
              <button className="panel-close" type="button" onClick={() => setNcrModalOpen(false)} aria-label="Close modal">
                x
              </button>
            </div>

            <form
              className="ncr-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleRaiseNcr();
              }}
            >
              <label className="scenario-field">
                <span>Machine</span>
                <select value={ncrForm.machine} onChange={(event) => setNcrForm((current) => ({ ...current, machine: event.target.value }))}>
                  <option value="">Select machine...</option>
                  {(payload.presses ?? []).map((press) => (
                    <option key={press.pressName} value={press.pressName}>
                      {press.pressName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="scenario-field">
                <span>Defect Type</span>
                <select value={ncrForm.defectType} onChange={(event) => setNcrForm((current) => ({ ...current, defectType: event.target.value }))}>
                  <option value="">Select defect type...</option>
                  {(payload.defects ?? []).map((defect) => (
                    <option key={defect.type} value={defect.type}>
                      {defect.type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="scenario-field">
                <span>Qty Affected</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={ncrForm.qtyAffected}
                  onChange={(event) => setNcrForm((current) => ({ ...current, qtyAffected: event.target.value }))}
                />
              </label>

              <label className="scenario-field">
                <span>Description</span>
                <textarea
                  rows="4"
                  value={ncrForm.description}
                  onChange={(event) => setNcrForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>

              <div className="ncr-severity-group">
                <span className="scenario-field-label">Severity</span>
                <label>
                  <input
                    type="radio"
                    name="ncrSeverity"
                    value="Low"
                    checked={ncrForm.severity === 'Low'}
                    onChange={(event) => setNcrForm((current) => ({ ...current, severity: event.target.value }))}
                  />
                  Low
                </label>
                <label>
                  <input
                    type="radio"
                    name="ncrSeverity"
                    value="Medium"
                    checked={ncrForm.severity === 'Medium'}
                    onChange={(event) => setNcrForm((current) => ({ ...current, severity: event.target.value }))}
                  />
                  Medium
                </label>
                <label>
                  <input
                    type="radio"
                    name="ncrSeverity"
                    value="High"
                    checked={ncrForm.severity === 'High'}
                    onChange={(event) => setNcrForm((current) => ({ ...current, severity: event.target.value }))}
                  />
                  High
                </label>
              </div>

              <button type="submit" className="btn-primary" disabled={!ncrForm.machine || !ncrForm.defectType || !ncrForm.description.trim()}>
                Save NCR
              </button>
            </form>
          </div>
        </div>
      ) : null}
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
