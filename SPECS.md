# Qentropix Platform — Full Feature Specifications

**Project:** mfg_demo  
**Platform:** Qentropix Operate + Qentropix Comply (one integrated system)  
**Stack:** React 18 + Vite (client) · Express.js (server) · PostgreSQL via `pg` · SSE for live push  
**Audience:** Demostrable to any manufacturing industry — pharma, food & bev, metal fab, discrete mfg

---

## Table of Contents

1. [Demo Data Foundation](#1-demo-data-foundation)
2. [Navigation & Information Architecture](#2-navigation--information-architecture)
3. [AI Infrastructure](#3-ai-infrastructure)
4. [Dashboard Enhancements](#4-dashboard-enhancements)
5. [Production & Orders](#5-production--orders)
6. [Supply Chain Scenario Simulator](#6-supply-chain-scenario-simulator)
7. [Workforce Intelligence](#7-workforce-intelligence)
8. [Integrations Panel](#8-integrations-panel)
9. [Anomaly Detector](#9-anomaly-detector)
10. [AI Shift Handover Report](#10-ai-shift-handover-report)
11. [Quality & NCR Register](#11-quality--ncr-register)
12. [Calibration Tracker](#12-calibration-tracker)
13. [Employee Certifications](#13-employee-certifications)
14. [Supplier Qualification Tracker](#14-supplier-qualification-tracker)
15. [CAPA Tracker](#15-capa-tracker)
16. [Operations AI Assistant](#16-operations-ai-assistant)

---

## 1. Demo Data Foundation

**File:** `server/demoData.js`  
**Why first:** Every feature references shared demo data. Before building any tab, seed data needs ERP-style identifiers and a shared structure so Supplier, Employee, NCR, and CAPA records are consistent across tabs that reference the same objects. A prospect should see `WO-2047` and `PN-AL-3842` and immediately think "that looks like our ERP."

### Work Orders — add to each shift object

```js
orders: [
  {
    id: 'WO-2047', partNumber: 'PN-AL-3842', partName: 'Aluminium Side Bracket',
    machineAssigned: 'Press 01', qtyOrdered: 1000, qtyProduced: 847,
    dueDate: Date.now() + 4 * 60 * 60 * 1000, // +4 hours from now
    status: 'On Track'
  },
  {
    id: 'WO-2048', partNumber: 'PN-ST-1104', partName: 'Steel Hinge Mount',
    machineAssigned: 'Press 04', qtyOrdered: 600, qtyProduced: 201,
    dueDate: Date.now() + 1 * 60 * 60 * 1000, // +1 hour — at risk
    status: 'At Risk'
  },
  {
    id: 'WO-2049', partNumber: 'PN-AL-2201', partName: 'Reinforcement Channel',
    machineAssigned: 'Press 02', qtyOrdered: 450, qtyProduced: 447,
    dueDate: Date.now() - 2 * 60 * 60 * 1000, // -2 hours — overdue
    status: 'Delayed'
  },
  // 2 queued orders with dueDate > now + 8 hours, status: 'Queued'
]
```

> **Rule:** All due dates use `Date.now() + offsetMs`. Never hardcode ISO date strings — they go stale.

### Materials — add to each shift object

```js
materials: [
  { code: 'MAT-1042', name: 'Aluminium Billet 6061', unit: 'kg',
    stockQty: 180, reorderPoint: 500, reorderQty: 1000,
    dailyUsageRate: 85, daysOfSupply: 2.1, status: 'Critical' },
  { code: 'MAT-2087', name: 'Steel Coil C1018', unit: 'rolls',
    stockQty: 12, reorderPoint: 20, reorderQty: 50,
    dailyUsageRate: 2.2, daysOfSupply: 5.4, status: 'Low' },
  // 4 more with daysOfSupply > 7, status: 'OK'
]
```

`daysOfSupply = stockQty / dailyUsageRate`. Status: < 3 days → Critical, 3–7 → Low, > 7 → OK.

### Suppliers — module-level export (shared: Supply Chain + Suppliers tabs)

```js
export const suppliers = [
  {
    id: 'SUP-001', name: 'Acero Metals',
    materials: ['MAT-1042'], contact: { name: 'James Rivera', email: 'j.rivera@acerometals.com', phone: '416-555-0182' },
    leadTimeDays: 14, lastDeliveryStatus: 'Delayed', riskLevel: 'High',
    auditScore: 71, qualifiedDate: Date.now() - 180 * 86400000,
    nextRequalDate: Date.now() - 60 * 86400000, // overdue
    status: 'Requalification Due',
    auditHistory: [
      { date: Date.now() - 180 * 86400000, type: 'On-site', score: 71, outcome: 'Pass' },
      { date: Date.now() - 365 * 86400000, type: 'On-site', score: 78, outcome: 'Pass' },
      { date: Date.now() - 550 * 86400000, type: 'Remote', score: 82, outcome: 'Pass' },
    ]
  },
  {
    id: 'SUP-002', name: 'Precision Tooling Co.',
    materials: ['MAT-2087'], status: 'Suspended', riskLevel: 'High', auditScore: 54,
    // ... full object
  },
  // 4 more with status: 'Approved', riskLevel: 'Low' or 'Medium'
]
```

### Employees — module-level export (shared: Workforce + Certifications tabs)

```js
export const employees = [
  {
    id: 'EMP-1042', name: 'Sarah Chen', role: 'Machine Operator',
    assignedMachine: 'Press 05', shiftStatus: 'Absent',
    certifications: [
      { name: 'Machine Operation - Press 05', issuedDate: Date.now() - 400 * 86400000,
        expiryDate: Date.now() - 14 * 86400000, status: 'Expired' },
      { name: 'Lockout/Tagout (LOTO)', issuedDate: Date.now() - 200 * 86400000,
        expiryDate: Date.now() + 165 * 86400000, status: 'Current' },
    ]
  },
  {
    id: 'EMP-1055', name: 'Marcus Webb', role: 'Quality Inspector',
    assignedMachine: 'Press 04', shiftStatus: 'Active',
    certifications: [
      { name: 'Quality Inspection Level 2', expiryDate: Date.now() + 25 * 86400000, status: 'Expiring Soon' },
      // ...
    ]
  },
  // 6 more: mix of Machine Operators, Maintenance Techs, one Shift Supervisor
]
```

### Defects — add to each shift object

```js
defects: [
  { type: 'Dimensional Variance', count: 14, trend: 'up' },
  { type: 'Surface Finish', count: 8, trend: 'down' },
  { type: 'Assembly Tolerance', count: 5, trend: 'stable' },
  { type: 'Material Hardness', count: 3, trend: 'up' },
],
prevShiftDefects: [
  { type: 'Dimensional Variance', count: 9 },
  { type: 'Surface Finish', count: 11 },
  { type: 'Assembly Tolerance', count: 5 },
  { type: 'Material Hardness', count: 1 },
]
```

### NCRs — add to each shift object

```js
ncrs: [
  { id: 'NCR-2024-0042', date: Date.now() - 2 * 3600000, machine: 'Press 04',
    defectType: 'Dimensional Variance', qtyAffected: 14,
    status: 'Under Review', assignedTo: 'EMP-1055', capaId: 'CAPA-2024-0018',
    description: 'Dimensional variance outside tolerance on PN-AL-3842 run' },
  { id: 'NCR-2024-0041', date: Date.now() - 5 * 3600000, machine: 'Press 02',
    defectType: 'Surface Finish', qtyAffected: 6,
    status: 'Open', assignedTo: 'EMP-1055', capaId: null },
  { id: 'NCR-2024-0039', date: Date.now() - 3 * 86400000, machine: 'Press 01',
    defectType: 'Assembly Tolerance', qtyAffected: 3,
    status: 'Closed', assignedTo: 'EMP-1055', capaId: 'CAPA-2024-0016' },
]
```

### CAPAs — module-level export

```js
export const capas = [
  {
    id: 'CAPA-2024-0018', ncrId: 'NCR-2024-0042', machine: 'Press 04',
    defectType: 'Dimensional Variance', source: 'NCR-2024-0042',
    issueDescription: 'Recurring dimensional variance on Press 04 — 3rd occurrence this month',
    severity: 'Major', assignedTo: 'EMP-1055',
    openedDate: Date.now() - 2 * 3600000,
    dueDate: Date.now() + 3 * 86400000,
    status: 'Root Cause Analysis', percentComplete: 35,
    rootCause: null, // populated when AI Assist is used
    actions: [
      { id: 1, description: 'Inspect tooling on Press 04 for wear', owner: 'EMP-1042', dueDate: Date.now() + 86400000, completed: true },
      { id: 2, description: 'Reduce inspection interval for PN-AL-3842', owner: 'EMP-1055', dueDate: Date.now() + 3 * 86400000, completed: false },
      { id: 3, description: 'Update tooling change schedule in maintenance system', owner: 'EMP-1055', dueDate: Date.now() + 5 * 86400000, completed: false },
    ],
    stageHistory: [
      { stage: 'Open', timestamp: Date.now() - 2 * 3600000 },
      { stage: 'Root Cause Analysis', timestamp: Date.now() - 1 * 3600000 },
    ]
  },
  // 1 status: 'Open', 1 status: 'Overdue' (dueDate in past), 1 status: 'Verification', 1 status: 'Closed'
]
```

### Calibration Instruments — module-level export

```js
export const calibrations = [
  { assetTag: 'INST-G-041', name: 'Digital Vernier Gauge', type: 'Gauge',
    location: 'Press 04 QC Station', intervalDays: 90,
    lastCalibrated: Date.now() - 115 * 86400000,
    nextDue: Date.now() - 25 * 86400000, // overdue
    certNumber: 'CAL-2024-0312', calibratedBy: 'Internal QA',
    results: { measured: '25.03mm', tolerance: '±0.02mm', outcome: 'Pass' },
    status: 'Overdue'
  },
  // 2 more Overdue, 2 Due Soon (nextDue within 30 days), 5 Current
]
```

### Acceptance Criteria
- [ ] All due/expiry/calibration dates calculated relative to `Date.now()` — no hardcoded ISO strings
- [ ] `suppliers` and `employees` are single module-level exports — not duplicated per shift
- [ ] NCR `capaId` values match actual CAPA `id` values in `capas` export
- [ ] CAPA `ncrId` values match actual NCR `id` values in each shift's `ncrs` array
- [ ] At least one of each status state exists in NCRs, CAPAs, calibrations, suppliers
- [ ] Coverage gap scenario coherent: Sarah Chen assigned to Press 05, cert for Press 05 expired

---

## 2. Navigation & Information Architecture

**File:** `client/src/App.jsx`, `client/src/styles.css`  
**Depends on:** Task 1 (demo data)

### Sidebar restructure

Replace the flat `sidebarTabs` array with a grouped structure. Render section headers as non-clickable `<div className="nav-section-header">` labels above each group.

```js
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
  },
]
// Settings rendered separately below sections
```

Update `tabMeta` object to include all new tabs with title and description.

### Rename "Presses" → "Machines"

Replace everywhere in `App.jsx`: sidebar label, `tabMeta` title, tab description, any heading or copy that says "Press" as a generic noun. Machine names in data (`Press 01`, etc.) are data — leave those alone.

### Placeholder tabs

New tabs not yet built render a placeholder card:
```jsx
<div className="placeholder-card">
  <h2>{tabMeta[activeTab].title}</h2>
  <p>{tabMeta[activeTab].description}</p>
  <span className="badge tone-muted">Coming Soon</span>
</div>
```

### Badge counts

Add `badgeCounts` state in `App.jsx`, derived from data on each render:

```js
const badgeCounts = {
  'Quality & NCR': ncrs.filter(n => n.status !== 'Closed').length,
  'CAPA': capas.filter(c => c.dueDate < Date.now() && c.status !== 'Closed').length,
  'Calibration': calibrations.filter(c => c.status === 'Overdue').length,
  'Certifications': employees.filter(e => e.certifications.some(c => c.status === 'Expired')).length,
  'Alerts': data?.alerts?.length ?? 0,
}
```

Render badge in sidebar tab label:
```jsx
<span className="nav-tab">
  {tab}
  {badgeCounts[tab] > 0 && <span className="nav-badge">{badgeCounts[tab]}</span>}
</span>
```

`.nav-badge`: small red pill, `background: var(--danger)`, `color: white`, `border-radius: 9999px`, `font-size: 10px`, `padding: 1px 5px`, positioned inline after the label.

`.nav-section-header`: `font-size: 10px`, `letter-spacing: 0.1em`, `color: var(--muted)`, `padding: 16px 16px 4px`, `text-transform: uppercase`.

### Acceptance Criteria
- [ ] Sidebar renders three labeled sections with all tabs correctly grouped
- [ ] All existing tabs function with no regressions
- [ ] "Presses" renamed to "Machines" in all sidebar/heading copy — data names unchanged
- [ ] Unbuilt tabs render placeholder card — no blank or broken pages
- [ ] Badge counts visible on Quality & NCR, CAPA, Calibration, Certifications, Alerts
- [ ] Sidebar scrollable if viewport height is too short to show all tabs

---

## 3. AI Infrastructure

**File:** `server/aiService.js` (new), `package.json`, `.env.example`  
**Build before:** All AI features (Tasks 6, 7, 9, 10, 14, 15, 16, 18)

### Install

```bash
npm install @anthropic-ai/sdk
```

Add to `.env.example`:
```
ANTHROPIC_API_KEY=
```

### server/aiService.js

```js
import Anthropic from '@anthropic-ai/sdk';

/**
 * Streams a Claude completion to the caller.
 *
 * Server-side usage (in an Express route):
 *   res.setHeader('Content-Type', 'text/plain; charset=utf-8');
 *   res.setHeader('Transfer-Encoding', 'chunked');
 *   res.setHeader('Cache-Control', 'no-cache');
 *   try {
 *     const stream = await streamCompletion({ systemPrompt, userMessage, contextData });
 *     stream.on('text', (text) => res.write(text));
 *     stream.on('end', () => res.end());
 *   } catch (err) {
 *     if (err.isFallback) return res.status(503).json({ error: 'AI not configured', fallback: true });
 *     return res.status(500).json({ error: err.message });
 *   }
 *
 * Client-side usage (in a React component):
 *   const response = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
 *   if (!response.ok) { handle fallback }
 *   const reader = response.body.getReader();
 *   const decoder = new TextDecoder();
 *   while (true) {
 *     const { done, value } = await reader.read();
 *     if (done) break;
 *     setText(prev => prev + decoder.decode(value));
 *   }
 */
export async function streamCompletion({ systemPrompt, userMessage, contextData }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.isFallback = true;
    throw err;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const fullSystemPrompt = contextData
    ? systemPrompt + '\n\nCurrent operational data:\n' + JSON.stringify(contextData, null, 2)
    : systemPrompt;

  return client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: fullSystemPrompt,
    messages: Array.isArray(userMessage)
      ? userMessage  // supports multi-turn (chat)
      : [{ role: 'user', content: userMessage }],
  });
}
```

### Acceptance Criteria
- [ ] `streamCompletion` exported and importable in `server/index.js`
- [ ] Missing API key throws with `err.isFallback = true` — no unhandled exception
- [ ] Streaming works end-to-end: client sees tokens appearing progressively
- [ ] All 7 AI endpoints (`/api/ai/quality-analysis`, `/supply-scenario`, `/shift-optimize`, `/anomaly-diagnosis`, `/root-cause`, `/chat`, `/shift-report`) use this module — no direct Anthropic SDK calls in `index.js`
- [ ] Module contains zero manufacturing-specific prompts or logic

---

## 4. Dashboard Enhancements

**Files:** `client/src/App.jsx`, `client/src/styles.css`, `server/demoData.js`  
**Depends on:** Task 1

### Shift Target Progress card

Add a 6th stat card. Add `targetOutput` to each shift's summary in `demoData.js` (Shift A: 1000, Shift B: 850).

```jsx
<StatCard
  label="Shift Target"
  value={`${formatShortNumber(data.summary.totalOutput)} / ${formatShortNumber(data.summary.targetOutput)}`}
  sub={`${((data.summary.totalOutput / data.summary.targetOutput) * 100).toFixed(1)}%`}
  tone={
    data.summary.totalOutput / data.summary.targetOutput >= 0.85 ? 'success' :
    data.summary.totalOutput / data.summary.targetOutput >= 0.70 ? 'warning' : 'danger'
  }
/>
```

The existing `useCountUp` hook handles animation for `totalOutput`.

### Machine card mini sparklines

Generate 5 historical OEE points per machine using the sinusoidal formula. In `getDemoDashboard()`, add a `trend` array to each press:

```js
trend: Array.from({ length: 5 }, (_, k) => {
  const pastTick = tick - (4 - k);
  const wave = Math.sin(pastTick * 1.3 + i * 1.07);
  return Math.max(0, Math.min(100, press.oee + wave * 2.5));
})
```

Render in machine card as an inline SVG polyline:

```jsx
function Sparkline({ points, width = 80, height = 24 }) {
  const min = Math.min(...points), max = Math.max(...points);
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((v - min) / (max - min || 1)) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline points={coords} fill="none" stroke="var(--cyan)" strokeWidth="1.5" />
    </svg>
  );
}
```

### Shift comparison bar

Fetch the other shift's summary on mount alongside the primary shift. Add a `shiftSummaries` state object:

```js
const [shiftSummaries, setShiftSummaries] = useState({});

useEffect(() => {
  Promise.all(shiftTabs.map(shift =>
    fetch(`${BASE}api/dashboard?shift=${encodeURIComponent(shift)}`)
      .then(r => r.json())
      .then(d => [shift, d.summary.overallOee])
  )).then(entries => setShiftSummaries(Object.fromEntries(entries)));
}, []);
```

Render as a flex row of labeled segments proportional to OEE values:

```jsx
<div className="shift-comparison-bar">
  {shiftTabs.map(shift => (
    <div
      key={shift}
      className={`shift-segment ${activeShift === shift ? 'active' : ''}`}
      style={{ flex: shiftSummaries[shift] ?? 1 }}
      onClick={() => setActiveShift(shift)}
    >
      <span>{shift}</span>
      <span>{shiftSummaries[shift]?.toFixed(1)}%</span>
    </div>
  ))}
</div>
```

CSS: `.shift-segment` background `var(--panel)`, `.shift-segment.active` background `var(--cyan)` at 20% opacity with cyan border.

### Freshness indicator

```js
const lastUpdatedRef = useRef(Date.now());
const [freshnessSeconds, setFreshnessSeconds] = useState(0);

// In SSE event handler:
lastUpdatedRef.current = Date.now();

// In useEffect:
useEffect(() => {
  const id = setInterval(() => {
    setFreshnessSeconds(Math.floor((Date.now() - lastUpdatedRef.current) / 1000));
  }, 1000);
  return () => clearInterval(id);
}, []);
```

Render next to the Live badge: `"Updated ${freshnessSeconds}s ago"`.

### Acceptance Criteria
- [ ] Shift Target Progress card animates via `useCountUp`, color class changes at 85%/70%
- [ ] Machine cards display sparklines that update on each live tick
- [ ] Shift comparison bar renders both shifts, switches active shift on click
- [ ] Freshness counter resets to 0 on each SSE event, counts up correctly
- [ ] No layout regressions at 1280px viewport

---

## 5. Production & Orders

**Files:** `client/src/App.jsx`, `client/src/OrderPanel.jsx` (new), `client/src/styles.css`  
**Depends on:** Task 1

### Tab rename
`'Production'` → `'Production & Orders'` in `navSections` and `tabMeta`.

### Active Orders board

Reads `data.orders`. CSS grid, 3 columns, each card:

```jsx
function OrderCard({ order, press, ncrs, onClick }) {
  const now = Date.now();
  const minsRemaining = (order.dueDate - now) / 60000;
  const dueLabel = minsRemaining > 0
    ? `Due in ${Math.floor(minsRemaining / 60)}h ${Math.floor(minsRemaining % 60)}m`
    : `Overdue by ${Math.floor(-minsRemaining / 60)}h ${Math.floor((-minsRemaining) % 60)}m`;

  // Dynamic status: override data status with live machine state
  const liveStatus =
    press?.status !== 'Running' ? 'At Risk' :
    minsRemaining < 0 ? 'Delayed' :
    order.status;

  const tone = liveStatus === 'On Track' ? 'success' : liveStatus === 'At Risk' ? 'warning' : 'danger';
  const hasQualityHold = ncrs.some(n => n.machine === order.machineAssigned && n.status !== 'Closed');

  return (
    <div className="order-card" onClick={onClick}>
      <div className="order-card-header">
        <span className="order-id">{order.id}</span>
        <span className={`badge tone-${tone}`}>{liveStatus}</span>
      </div>
      <div className="order-part">{order.partNumber} — {order.partName}</div>
      <div className="order-machine">{order.machineAssigned}</div>
      <div className="order-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(order.qtyProduced / order.qtyOrdered) * 100}%`, background: `var(--${tone === 'success' ? 'success' : tone === 'warning' ? 'amber' : 'rose'})` }} />
        </div>
        <span>{order.qtyProduced} / {order.qtyOrdered}</span>
      </div>
      <div className={`order-due ${minsRemaining < 0 ? 'overdue' : ''}`}>{dueLabel}</div>
      {hasQualityHold && <div className="quality-hold-flag tone-warning">⚠ Quality Hold — NCR open</div>}
    </div>
  );
}
```

### Queue panel

Below the order grid:
```jsx
<div className="queue-panel">
  <h3>Up Next</h3>
  {data.orders.filter(o => o.status === 'Queued').map(order => (
    <div className="queue-row" key={order.id}>
      <span>{order.id}</span>
      <span>{order.partName}</span>
      <span className="muted">Est. start: {formatRelativeTime(order.dueDate - 8 * 3600000)}</span>
    </div>
  ))}
</div>
```

### OrderPanel.jsx (new component)

Mirror the structure of `PressPanel.jsx`. Props: `order`, `press`, `ncrs`, `onClose`.

Sections:
1. **Order header** — WO number, part number, part name, customer reference (add `customerRef` to demoData, e.g., `'CUST-REF-8821'`)
2. **Assigned machine** — machine name, current OEE ring (reuse the conic-gradient ring component from PressPanel), current status badge
3. **Production pace** — `actualRate = order.qtyProduced / (shiftElapsedMinutes / 60)` units/hr, `requiredRate = (order.qtyOrdered - order.qtyProduced) / (minsToDeadline / 60)`. Display both; red text on `requiredRate` if actual < required
4. **Quality hold banner** — same logic as OrderCard, amber banner if open NCR on assigned machine
5. **Job history** — last 2 completed orders on this machine from `PRESS_DETAILS` or demoData

### Throughput table

Find the existing throughput table in App.jsx Production tab. Add two columns:
- **Target:** `order.qtyOrdered` for that shift's primary active order
- **Variance:** `qtyProduced - qtyOrdered`, render as `+12` (green) or `-43` (red)

### Acceptance Criteria
- [ ] Order cards render with dynamically computed status badges
- [ ] At Risk badge fires when assigned machine is not Running (not just from data field)
- [ ] Quality hold banner shows on WO-2048 card (Press 04 has open NCR in demo data)
- [ ] Due time label is relative and live — counts down
- [ ] OrderPanel opens on click, closes on backdrop click and ESC
- [ ] Production pace section shows actual vs required rate, red when behind
- [ ] Queue panel shows queued orders with estimated start times
- [ ] Throughput table has Target and Variance columns with correct colors

---

## 6. Supply Chain Scenario Simulator

**Files:** `client/src/App.jsx`, `server/index.js`, `server/aiService.js`, `client/src/styles.css`  
**Depends on:** Tasks 1, 3

### Tab content

New tab renders when `activeTab === 'Supply Chain'`. Two panels + scenario modal.

### Inventory & Material Status panel

```jsx
<table className="data-table">
  <thead>
    <tr><th>Code</th><th>Material</th><th>Stock</th><th>Unit</th><th>Days Supply</th><th>Reorder Point</th><th>Status</th></tr>
  </thead>
  <tbody>
    {data.materials.map(mat => (
      <tr key={mat.code}>
        <td className="mono">{mat.code}</td>
        <td>{mat.name}</td>
        <td>{mat.stockQty.toLocaleString()}</td>
        <td className="muted">{mat.unit}</td>
        <td>{mat.daysOfSupply.toFixed(1)}</td>
        <td>{mat.reorderPoint.toLocaleString()}</td>
        <td><span className={`badge tone-${mat.status === 'Critical' ? 'danger' : mat.status === 'Low' ? 'warning' : 'success'}`}>{mat.status}</span></td>
      </tr>
    ))}
  </tbody>
</table>
```

Critical materials banner (dismissible via `[criticalDismissed, setCriticalDismissed]` state):

```jsx
{!criticalDismissed && data.materials.some(m => m.status === 'Critical') && (
  <div className="alert-banner tone-warning">
    ⚠ Material shortage risk — {data.materials.filter(m => m.status === 'Critical').length} item(s) below reorder threshold
    <button onClick={() => setCriticalDismissed(true)}>✕</button>
  </div>
)}
```

### Supplier Risk panel

Reads from `suppliers` prop (lifted state from `App.jsx`). Risk level override logic:

```js
const effectiveRiskLevel = (s) =>
  s.status === 'Suspended' || s.status === 'Requalification Due' ? 'High' : s.riskLevel;
```

### Scenario Simulator

State: `scenarioOpen` (bool), `scenarioValue` (string), `scenarioResult` (string), `scenarioLoading` (bool).

Modal form:
```jsx
<select value={scenarioValue} onChange={e => setScenarioValue(e.target.value)}>
  <option value="">Select a scenario...</option>
  <option value="supplier_delay_2w">Supplier delays delivery by 2 weeks</option>
  <option value="material_drop_50pct">Material stock drops 50% unexpectedly</option>
  <option value="demand_spike_30pct">Production demand spikes 30% next shift</option>
</select>
```

On submit: close modal, set `scenarioLoading: true`, call:

```js
POST /api/ai/supply-scenario
Body: { shiftName: activeShift, scenario: scenarioValue, materials: data.materials, suppliers }
```

Stream response into `scenarioResult`. Render in a result card below the "Run Scenario" button.

**Server route `POST /api/ai/supply-scenario`:**

```js
app.post('/api/ai/supply-scenario', async (req, res) => {
  const { shiftName, scenario, materials, suppliers } = req.body;
  const scenarioLabels = {
    supplier_delay_2w: 'Key supplier delays delivery by 2 weeks',
    material_drop_50pct: 'Primary material stock drops 50% unexpectedly',
    demand_spike_30pct: 'Production demand spikes 30% next shift',
  };
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  try {
    const stream = await aiService.streamCompletion({
      systemPrompt: `You are a manufacturing supply chain analyst. Analyze the operational impact of the given scenario on the plant floor. Identify which machines and orders are affected, how many days of production are at risk, and give one specific mitigation recommendation. Be concise — 3 to 4 sentences. Use material codes and machine names from the data.`,
      userMessage: `Scenario: ${scenarioLabels[scenario]}`,
      contextData: { shiftName, materials, suppliers },
    });
    stream.on('text', t => res.write(t));
    stream.on('end', () => res.end());
  } catch (err) {
    if (err.isFallback) return res.status(503).json({ error: 'AI not configured', fallback: true });
    res.status(500).json({ error: err.message });
  }
});
```

### Acceptance Criteria
- [ ] Inventory table renders with at least 1 Critical and 1 Low material in demo state
- [ ] Critical banner appears and is dismissible per session
- [ ] Supplier risk panel forces High Risk for Suspended/Requalification Due suppliers automatically
- [ ] Suspending a supplier in the Suppliers tab updates risk level here (shared state)
- [ ] Scenario modal validates selection before enabling Run button
- [ ] Scenario result streams into result card word by word
- [ ] Graceful fallback if `ANTHROPIC_API_KEY` not set

---

## 7. Workforce Intelligence

**Files:** `client/src/App.jsx`, `server/index.js`, `server/aiService.js`, `client/src/styles.css`  
**Depends on:** Tasks 1, 3

### Shift Roster panel

Reads `employees` (lifted state from `App.jsx`, same object used by Certifications tab).

```jsx
{employees.map(emp => {
  const hasCoverageGap = !employees.some(
    e => e.assignedMachine === emp.assignedMachine &&
         (e.shiftStatus === 'Active' || e.shiftStatus === 'On Break') &&
         e.id !== emp.id
  ) && emp.shiftStatus === 'Absent';

  const certExpired = emp.certifications.some(
    c => c.name.includes(emp.assignedMachine) && c.status === 'Expired'
  );

  return (
    <div className="roster-card" key={emp.id}>
      <div className="roster-header">
        <span>{emp.name}</span>
        <span className="muted">{emp.id}</span>
        <span className={`badge tone-${emp.shiftStatus === 'Active' ? 'success' : emp.shiftStatus === 'On Break' ? 'warning' : 'danger'}`}>
          {emp.shiftStatus}
        </span>
      </div>
      <div className="roster-role">{emp.role} · {emp.assignedMachine}</div>
      {hasCoverageGap && <div className="roster-flag tone-warning">⚠ Coverage gap on {emp.assignedMachine}</div>}
      {certExpired && <div className="roster-flag tone-danger">✕ Cert expired for {emp.assignedMachine}</div>}
    </div>
  );
})}
```

### Operator Performance table

Map `data.presses` to employees by `assignedMachine`:

```js
const performanceRows = data.presses.map(press => {
  const emp = employees.find(e => e.assignedMachine === press.pressName && e.shiftStatus === 'Active');
  return { ...press, employeeName: emp?.name ?? 'Unassigned', employeeId: emp?.id };
});
```

Sortable by `outputCount` and `oee` — `sortField` and `sortDir` in state. Top performer (highest `outputCount`) gets `className="top-performer"` on the row.

### AI Shift Optimizer

```js
POST /api/ai/shift-optimize
Body: { shiftName, employees, presses: data.presses, orders: data.orders }
```

Server system prompt:
> "You are a manufacturing shift supervisor optimizing workforce coverage. Analyze the current roster and machine statuses. Identify coverage gaps and suggest specific operator reassignments. Name operators by their actual names from the data. Explain why the recommended donor machine can sustain output without the moved operator. Be specific and actionable — 3 to 4 sentences."

Stream response into `optimizerResult` state. Render in a card with "Dismiss" button.

### Acceptance Criteria
- [ ] Roster shows all employees with correct status badges
- [ ] Sarah Chen (EMP-1042) absent → coverage gap flag on Press 05
- [ ] Expired cert flag fires for the same scenario (reads from same `employees` state)
- [ ] Performance table is sortable, top performer has cyan left border
- [ ] AI Optimizer streams recommendation naming real employee names and machines
- [ ] Coverage gap logic matches what Certifications tab shows — same data, same result

---

## 8. Integrations Panel

**Files:** `client/src/App.jsx`, `client/src/styles.css`

Added as a section inside the Settings tab. No new API routes — purely UI.

### Connected Systems panel

Static array defined in component (not demoData):

```js
const integrations = [
  { name: 'ERP', platforms: 'SAP · Oracle · Epicor · Infor', status: 'Configured', detail: 'Work order sync pending activation', icon: '🏭' },
  { name: 'MES', platforms: 'Ignition · Wonderware · FactoryTalk', status: 'Connected', detail: 'Real-time stream active' },
  { name: 'Machine PLCs', platforms: 'OPC-UA · Siemens · Allen-Bradley', status: 'Connected', detail: '6 machines reporting' },
  { name: 'Quality System', platforms: 'ETQ · MasterControl · Intelex', status: 'Available', detail: 'Supported — not yet configured' },
  { name: 'HR / Scheduling', platforms: 'ADP · UKG · SAP HCM', status: 'Available', detail: 'Supported — not yet configured' },
];
```

Status badge tones: Connected → `success`, Configured → `warning`, Available → use `color: var(--muted)` (no tone class).

### Last Sync log

MES and PLC timestamps computed dynamically:

```js
const syncLog = [
  { system: 'MES', timestamp: `${Math.floor((Date.now() % 120000) / 1000)}s ago`, records: '847 production records', status: 'Connected' },
  { system: 'Machine PLCs', timestamp: 'Real-time', records: 'OPC-UA stream active since 06:00', status: 'Connected' },
  { system: 'ERP', timestamp: 'Pending activation', records: '—', status: 'Configured' },
];
```

### Data Flow diagram

Pure CSS flexbox, no library:

```jsx
<div className="data-flow">
  <div className="flow-col sources">
    <h4>Your Systems</h4>
    {['ERP', 'MES', 'Machine PLCs', 'Quality System'].map(s => (
      <div className="flow-box" key={s}>{s}</div>
    ))}
  </div>
  <div className="flow-arrows">→</div>
  <div className="flow-col platform">
    <div className="flow-box platform-box">Qentropix</div>
  </div>
  <div className="flow-arrows">→</div>
  <div className="flow-col outputs">
    <h4>In Front of Your People</h4>
    {['Dashboard', 'Reports', 'AI Assistant', 'Alerts', 'Comply Modules'].map(o => (
      <div className="flow-box" key={o}>{o}</div>
    ))}
  </div>
</div>
```

### Request Integration modal

State: `requestModalOpen`, `requestSystem`, `requestText`.

For Available tiles, render a "Request Integration" button. Modal: system name pre-filled (read-only), textarea "Tell us about your [system] environment", Submit button. On submit: close modal, call `setToastMessage('Thanks — we\'ll follow up within 24 hours')`. Toast auto-dismisses via `setTimeout` of 4000ms.

Toast component — fixed `bottom: 80px`, `right: 24px`, CSS fade-out:

```jsx
{toastMessage && (
  <div className="toast-notification">{toastMessage}</div>
)}
```

### Acceptance Criteria
- [ ] 5 integration tiles render with correct status badges
- [ ] Data flow diagram shows three columns — Sources → Qentropix → Outputs
- [ ] MES and PLC sync timestamps update every second (dynamically computed)
- [ ] "Request Integration" only available on Available tiles
- [ ] Modal opens, accepts text, toast confirms on submit
- [ ] Toast auto-dismisses after 4 seconds

---

## 9. Anomaly Detector

**Files:** `client/src/App.jsx`, `client/src/AnomalyPanel.jsx` (new), `server/index.js`, `server/aiService.js`, `client/src/styles.css`  
**Depends on:** Task 3

### Detection logic

Run in a `useEffect` that watches `data.presses`. Maintain refs for previous tick values:

```js
const prevOeeRef = useRef({});
const lowOeeCountRef = useRef({});

useEffect(() => {
  if (!data?.presses) return;
  const newAnomalies = [];

  data.presses.forEach((press, i) => {
    const prev = prevOeeRef.current[press.pressName];
    const lowCount = lowOeeCountRef.current[press.pressName] ?? 0;

    if (press.status === 'Down') {
      newAnomalies.push({
        id: `${press.pressName}-down`, machine: press.pressName,
        metric: 'Machine Status', severity: 'Critical',
        description: `${press.pressName} is in a Down state — safety lockout or fault`,
        detectedAt: Date.now(), resolved: false,
      });
    }

    if (prev !== undefined && (prev - press.oee) > 8) {
      newAnomalies.push({
        id: `${press.pressName}-oee-drop`, machine: press.pressName,
        metric: 'OEE Drop', severity: 'Warning',
        description: `${press.pressName} OEE dropped ${(prev - press.oee).toFixed(1)}% in the last cycle`,
        detectedAt: Date.now(), resolved: false,
      });
    }

    if (press.status !== 'Running' && prev !== undefined) {
      newAnomalies.push({
        id: `${press.pressName}-minor-stop`, machine: press.pressName,
        metric: 'Status Change', severity: 'Warning',
        description: `${press.pressName} transitioned to ${press.status}`,
        detectedAt: Date.now(), resolved: false,
      });
    }

    const newLowCount = press.oee < anomalyThresholds.criticalOee ? lowCount + 1 : 0;
    lowOeeCountRef.current[press.pressName] = newLowCount;
    if (newLowCount >= anomalyThresholds.sustainedTicks) {
      newAnomalies.push({
        id: `${press.pressName}-sustained-low`, machine: press.pressName,
        metric: 'Sustained Low OEE', severity: 'Critical',
        description: `${press.pressName} OEE below ${anomalyThresholds.criticalOee}% for ${newLowCount} consecutive cycles`,
        detectedAt: Date.now(), resolved: false,
      });
    }

    prevOeeRef.current[press.pressName] = press.oee;
  });

  setAnomalies(prev => {
    const existing = prev.filter(a => newAnomalies.some(n => n.id === a.id) || !newAnomalies.some(n => n.machine === a.machine));
    return [...newAnomalies.filter(n => !existing.some(e => e.id === n.id)), ...existing];
  });
}, [data?.presses]);
```

Threshold state in `App.jsx` (configurable from Settings):
```js
const [anomalyThresholds, setAnomalyThresholds] = useState({
  warningOeeDrop: 8,   // % drop
  criticalOee: 65,     // absolute %
  sustainedTicks: 2,   // consecutive ticks
});
```

### AnomalyPanel.jsx

Props: `anomaly`, `press`, `onClose`, `onCreateAlert`, `onDismiss`.

Sections:
1. Machine KPIs (current OEE, status, downtime)
2. Trend chart — `OeeTrendChart` component from `Charts.jsx` but with `press.trend` (7 ticks) from `getDemoDashboard`
3. AI Diagnosis — "Get AI Diagnosis" button → `POST /api/ai/anomaly-diagnosis`, stream into `diagnosisText`
4. Action buttons: "Create Alert" (calls `POST /api/alerts`, increments badge), "Dismiss"

**Server route `POST /api/ai/anomaly-diagnosis`:**

```js
app.post('/api/ai/anomaly-diagnosis', async (req, res) => {
  const { machine, metric, currentOee, trend } = req.body;
  // ... standard streaming pattern using aiService
  // systemPrompt: "You are a maintenance engineer. Given a machine anomaly, explain what the pattern is likely caused by and what to physically inspect. Be specific. 2-3 sentences."
  // userMessage: `Machine: ${machine}. Anomaly: ${metric}. Current OEE: ${currentOee}%. Trend: ${trend.join(', ')}%`
});
```

### Settings — threshold configuration

Add to Settings tab:

```jsx
<div className="settings-card">
  <h3>Anomaly Detection Thresholds</h3>
  <label>OEE Warning Drop (%): <input type="number" value={anomalyThresholds.warningOeeDrop} onChange={...} /></label>
  <label>Critical OEE Floor (%): <input type="number" value={anomalyThresholds.criticalOee} onChange={...} /></label>
  <label>Sustained Ticks for Critical: <input type="number" value={anomalyThresholds.sustainedTicks} onChange={...} /></label>
</div>
```

### Acceptance Criteria
- [ ] Feed always has at least 1 Critical anomaly in demo state (Press 05 Down)
- [ ] New anomalies appear on each SSE tick when rules fire
- [ ] Resolved anomalies fade (CSS transition) before removal — not abruptly removed
- [ ] AnomalyPanel opens with trend chart for the flagged machine
- [ ] AI Diagnosis streams referencing machine name and specific metric
- [ ] "Create Alert" calls `POST /api/alerts` — Alerts sidebar badge increments
- [ ] Threshold changes in Settings affect detection behavior immediately

---

## 10. AI Shift Handover Report

**Files:** `client/src/App.jsx`, `server/index.js`, `server/aiService.js`, `client/src/styles.css`  
**Depends on:** Task 3

### Reports tab

Replace the non-functional "Preview" button on the first Daily Reports card with "Generate Shift Report."

State: `reportText` (string), `reportLoading` (bool), `reportHistory` (array, max 5).

### Streaming and parsing

Server streams text with `### SECTION` markers:

```js
POST /api/ai/shift-report
Body: { shiftName }
```

Server handler:
```js
const dashboard = await getDashboardPayload(shiftName);
const openNcrs = dashboard.ncrs?.filter(n => n.status !== 'Closed') ?? [];
const overdueCApas = capas.filter(c => c.dueDate < Date.now() && c.status !== 'Closed');

const systemPrompt = `You are a manufacturing shift supervisor writing a formal shift handover report.
Structure your response with exactly these four section headers on their own lines:
### PERFORMANCE SUMMARY
### ISSUES & ACTIONS
### HANDOVER NOTES
### RECOMMENDATIONS
Each section: 2-4 sentences. Use real machine names, order numbers, and quantities from the data.
Do not mention AI, data structures, or JSON.`;

const userMessage = `Write a shift handover report for ${shiftName}.`;
const contextData = {
  summary: dashboard.summary,
  machines: dashboard.presses,
  downtime: dashboard.downtime,
  orders: dashboard.orders,
  openNcrs,
  overdueCApas,
  activeAlerts: dashboard.alerts,
};
```

Client renders report card with section headers styled:

```jsx
function ReportCard({ text }) {
  const sections = text.split(/###\s+/g).filter(Boolean);
  return (
    <div className="report-card">
      <div className="report-header">
        SHIFT HANDOVER REPORT · {activeShift} · {new Date().toLocaleString()}
      </div>
      {sections.map(section => {
        const [header, ...body] = section.split('\n');
        return (
          <div className="report-section" key={header}>
            <h4>{header.trim()}</h4>
            <p>{body.join('\n').trim()}</p>
          </div>
        );
      })}
    </div>
  );
}
```

### Report history

```js
// After streaming completes (stream 'end' event on client):
setReportHistory(prev => [
  { id: Date.now(), shiftName: activeShift, generatedAt: new Date().toISOString(), text: reportText },
  ...prev.slice(0, 4),
]);
```

Render history list below the generate button. "View" restores `reportText`.

### Acceptance Criteria
- [ ] "Generate Shift Report" button replaces non-functional Preview button
- [ ] Report streams progressively with section headers styled distinctly
- [ ] Performance Summary contains real OEE and output vs target numbers
- [ ] Issues & Actions mentions open NCRs by ID if they exist
- [ ] Handover Notes mentions overdue CAPAs if they exist
- [ ] "Copy to Clipboard" copies full plain text
- [ ] Report history shows last 5, "View" restores the report text
- [ ] Graceful fallback message if API key not configured

---

## 11. Quality & NCR Register

**Files:** `client/src/App.jsx`, `server/index.js`, `server/aiService.js`, `client/src/styles.css`  
**Depends on:** Tasks 1, 3

### Quality Snapshot — live data

Replace hardcoded metric card values:

```js
const qualityMetrics = {
  'First Pass Yield': `${((data.summary.goodParts / data.summary.totalOutput) * 100).toFixed(1)}%`,
  'Rework Rate': (() => {
    const qhDowntime = data.downtime.find(d => d.reason === 'Quality Hold');
    return `${((qhDowntime?.minutes ?? 0) / 480 * 100).toFixed(1)}%`; // 480 = 8hr shift
  })(),
  'Scrap Rate': `${(((data.summary.totalOutput - data.summary.goodParts) / data.summary.totalOutput) * 100).toFixed(1)}%`,
  'Inspection Pass Rate': data.summary.inspectionPassRate + '%', // add to demoData summary
};
```

### Defect Themes

Replace hardcoded defect list with `data.defects`. Compute trend vs `data.prevShiftDefects`:

```jsx
{data.defects.map(defect => {
  const prev = data.prevShiftDefects.find(d => d.type === defect.type);
  const trendIcon = defect.count > (prev?.count ?? 0) ? '↑' : defect.count < (prev?.count ?? 0) ? '↓' : '→';
  const trendClass = defect.count > (prev?.count ?? 0) ? 'tone-danger' : 'tone-success';
  return (
    <div className="defect-row" key={defect.type}>
      <span>{defect.type}</span>
      <span>{defect.count} parts</span>
      <span className={trendClass}>{trendIcon}</span>
    </div>
  );
})}
```

### AI Quality Analysis card

State: `qualityAnalysisText` (string), `qualityAnalysisLoading` (bool).

```js
POST /api/ai/quality-analysis
Body: { shiftName, summary: data.summary, presses: data.presses, defects: data.defects }
```

Server system prompt:
> "You are a manufacturing quality analyst. Analyze the shift data and provide a 3-4 sentence quality narrative. Identify the highest-risk machine by name with its OEE. Call out which defect type is trending in the wrong direction. Give one specific recommendation for the next shift. Use metric names and machine names from the data."

### NCR Register

State: `ncrs` initialized from `data.ncrs` (include in the dashboard API response — add to `getDashboardPayload` return).

Table columns: NCR #, Date (relative: "2h ago"), Machine, Defect Type, Qty Affected, Status badge, Assigned To.

**Raise NCR modal:**

```jsx
<form onSubmit={handleRaiseNcr}>
  <select name="machine" required>
    <option value="">Select machine...</option>
    {data.presses.map(p => <option key={p.pressName} value={p.pressName}>{p.pressName}</option>)}
  </select>
  <select name="defectType" required>
    {['Dimensional Variance','Surface Finish','Assembly Tolerance','Material Hardness','Other'].map(d => (
      <option key={d} value={d}>{d}</option>
    ))}
  </select>
  <input type="number" name="qtyAffected" min="1" required placeholder="Qty affected" />
  <textarea name="description" required placeholder="Describe the non-conformance..." />
  <fieldset>
    <legend>Severity</legend>
    {['Minor','Major','Critical'].map(s => (
      <label key={s}><input type="radio" name="severity" value={s} required />{s}</label>
    ))}
  </fieldset>
  <button type="submit">Raise NCR</button>
</form>
```

On submit:
```js
const newNcr = {
  id: `NCR-2024-0${String(ncrs.length + 44).padStart(3, '0')}`,
  date: Date.now(), machine: formData.machine,
  defectType: formData.defectType, qtyAffected: Number(formData.qtyAffected),
  description: formData.description, severity: formData.severity,
  status: 'Open', assignedTo: 'EMP-1055', capaId: null,
};
setNcrs(prev => [newNcr, ...prev]);
```

NCR count badge reads `ncrs.filter(n => n.status !== 'Closed').length`.

**New API routes:**
```
GET /api/ncr?shift=    → returns shift's ncrs array from getDashboardPayload
POST /api/ncr          → creates NCR in DB or returns { mode: 'demo' }
```

### Cross-link: CAPA → NCR close

When CAPA is closed (Task 15), find the linked NCR and update:
```js
setNcrs(prev => prev.map(n => n.id === capa.ncrId ? { ...n, status: 'Closed' } : n));
```

### Acceptance Criteria
- [ ] Quality metrics show different values for Shift A vs Shift B
- [ ] Defect themes show correct ↑/↓/→ trends
- [ ] AI Analysis card streams narrative with real machine names and numbers
- [ ] Graceful fallback if API key not set
- [ ] "Raise NCR" modal validates all fields before enabling submit
- [ ] New NCR appears in register immediately after submit
- [ ] NCR count badge on sidebar tab updates
- [ ] Closing a linked CAPA updates NCR status to Closed

---

## 12. Calibration Tracker

**Files:** `client/src/App.jsx`, `client/src/CalibrationPanel.jsx` (new), `client/src/styles.css`  
**Depends on:** Task 1

### State initialization

```js
const [calibrations, setCalibrations] = useState(() =>
  demoCalibrations.map(c => ({
    ...c,
    status: c.nextDue < Date.now() ? 'Overdue'
           : c.nextDue < Date.now() + 30 * 86400000 ? 'Due Soon'
           : 'Current'
  }))
);
```

(Import `calibrations as demoCalibrations` from `demoData.js`)

### Status Overview cards

```js
const calibrationCounts = {
  total: calibrations.length,
  current: calibrations.filter(c => c.status === 'Current').length,
  dueSoon: calibrations.filter(c => c.status === 'Due Soon').length,
  overdue: calibrations.filter(c => c.status === 'Overdue').length,
};
```

### Calibration Register table

Sort state: `[sortField, setSortField]` = `'nextDue'`, `[sortDir, setSortDir]` = `'asc'`.

```js
const sorted = [...calibrations].sort((a, b) => {
  const va = a[sortField], vb = b[sortField];
  return sortDir === 'asc' ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
});
```

Row class: `row-danger` if Overdue, `row-warning` if Due Soon. Defined in `styles.css`:
```css
tr.row-danger { background: rgba(255, 75, 75, 0.08); }
tr.row-warning { background: rgba(255, 181, 63, 0.08); }
```

### CalibrationPanel.jsx

```jsx
function CalibrationPanel({ instrument, onClose }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);

  return (
    <div className="side-panel">
      <div className="panel-header">
        <h2>{instrument.assetTag} — {instrument.name}</h2>
        <button onClick={onClose}>✕</button>
      </div>

      <section>
        <h3>Instrument Details</h3>
        <dl>
          <dt>Type</dt><dd>{instrument.type}</dd>
          <dt>Location</dt><dd>{instrument.location}</dd>
          <dt>Calibration Interval</dt><dd>{instrument.intervalDays} days</dd>
        </dl>
      </section>

      <section>
        <h3>Last Calibration</h3>
        <dl>
          <dt>Date</dt><dd>{new Date(instrument.lastCalibrated).toLocaleDateString()}</dd>
          <dt>Performed By</dt><dd>{instrument.calibratedBy}</dd>
          <dt>Cert Number</dt><dd className="mono">{instrument.certNumber}</dd>
          <dt>Result</dt><dd>{instrument.results.measured} (tolerance {instrument.results.tolerance})</dd>
          <dt>Outcome</dt><dd><span className={`badge tone-${instrument.results.outcome === 'Pass' ? 'success' : 'danger'}`}>{instrument.results.outcome}</span></dd>
        </dl>
        <button onClick={() => setCertOpen(true)}>View Certificate</button>
      </section>

      <button className="btn-primary" onClick={() => setScheduleOpen(true)}>Schedule Recalibration</button>

      {certOpen && <CertificateModal instrument={instrument} onClose={() => setCertOpen(false)} />}
      {scheduleOpen && <ScheduleModal instrument={instrument} onClose={() => setScheduleOpen(false)} />}
    </div>
  );
}
```

**CertificateModal** — styled card in a modal overlay:
```jsx
<div className="modal-overlay">
  <div className="cert-card">
    <h2>CALIBRATION CERTIFICATE</h2>
    <div className="cert-number">{instrument.certNumber}</div>
    <dl>
      <dt>Instrument</dt><dd>{instrument.name} ({instrument.assetTag})</dd>
      <dt>Calibration Date</dt><dd>{new Date(instrument.lastCalibrated).toLocaleDateString()}</dd>
      <dt>Next Due</dt><dd>{new Date(instrument.nextDue).toLocaleDateString()}</dd>
      <dt>Issued By</dt><dd>{instrument.calibratedBy}</dd>
      <dt>Outcome</dt><dd>{instrument.results.outcome}</dd>
    </dl>
    <button onClick={onClose}>Close</button>
  </div>
</div>
```

**ScheduleModal** — form with date input, provider text, type radio. On submit: toast "Recalibration scheduled for [date]."

### Add Instrument modal

On submit, compute derived fields and add to state:
```js
const nextDue = new Date(lastCalibrated).getTime() + intervalDays * 86400000;
const status = nextDue < Date.now() ? 'Overdue' : nextDue < Date.now() + 30 * 86400000 ? 'Due Soon' : 'Current';
setCalibrations(prev => [...prev, { assetTag, name, type, intervalDays, lastCalibrated: new Date(lastCalibrated).getTime(), nextDue, status, certNumber: '', calibratedBy: '', results: {} }]);
```

### Acceptance Criteria
- [ ] Summary cards derived from state — not hardcoded
- [ ] Overdue badge on sidebar Calibration tab
- [ ] Table sortable by any column header, row colors correct
- [ ] CalibrationPanel opens on row click
- [ ] CertificateModal renders a styled certificate card
- [ ] ScheduleModal shows toast on submit and auto-dismisses
- [ ] "+ Add Instrument" computes status correctly and updates summary cards

---

## 13. Employee Certifications

**Files:** `client/src/App.jsx`, `client/src/CertificationPanel.jsx` (new), `client/src/styles.css`  
**Depends on:** Task 1

### State

`employees` state is lifted to `App.jsx` (shared with Workforce tab):
```js
const [employees, setEmployees] = useState(demoEmployees);
```

### Compliance Overview cards

```js
const certCounts = {
  total: employees.length,
  fullyCertified: employees.filter(e => e.certifications.every(c => c.status === 'Current')).length,
  expiringSoon: employees.filter(e => e.certifications.some(c => {
    const daysToExpiry = (c.expiryDate - Date.now()) / 86400000;
    return daysToExpiry > 0 && daysToExpiry <= 30;
  })).length,
  expired: employees.filter(e => e.certifications.some(c => c.status === 'Expired')).length,
};
```

### Employee Certification matrix

Row status computed:
```js
function getEmployeeStatus(emp) {
  if (emp.certifications.some(c => c.status === 'Expired')) return 'Expired';
  if (emp.certifications.some(c => (c.expiryDate - Date.now()) / 86400000 <= 30 && c.status !== 'Expired')) return 'Expiring Soon';
  return 'Current';
}
```

Row class based on status: `row-danger` for Expired, `row-warning` for Expiring Soon.

### Coverage Gap alert

```jsx
const coverageGaps = employees.filter(emp => {
  const machineCert = emp.certifications.find(c =>
    c.name.toLowerCase().includes(emp.assignedMachine.toLowerCase())
  );
  return machineCert && machineCert.status === 'Expired';
});

{coverageGaps.map(emp => (
  <div className="alert-card tone-danger" key={emp.id}>
    <strong>Coverage gap:</strong> {emp.name} ({emp.id}) is assigned to {emp.assignedMachine} but their Machine Operation certification expired {Math.floor((Date.now() - emp.certifications.find(c => c.name.includes(emp.assignedMachine))?.expiryDate) / 86400000)} days ago.
    <button onClick={() => dismissGap(emp.id)}>Dismiss</button>
  </div>
))}
```

### CertificationPanel.jsx

Props: `employee`, `onClose`, `onLogTraining`.

"Log Training" modal form:
```jsx
<form onSubmit={e => {
  e.preventDefault();
  const { certName, completionDate, expiryDate, issuedBy } = Object.fromEntries(new FormData(e.target));
  onLogTraining(employee.id, {
    name: certName,
    issuedDate: new Date(completionDate).getTime(),
    expiryDate: new Date(expiryDate).getTime(),
    issuedBy,
    status: new Date(expiryDate).getTime() > Date.now() ? 'Current' : 'Expired',
  });
}}>
```

`onLogTraining` in `App.jsx` updates `employees` state:
```js
setEmployees(prev => prev.map(e =>
  e.id === empId
    ? { ...e, certifications: [...e.certifications.filter(c => c.name !== cert.name), cert] }
    : e
));
```

### Acceptance Criteria
- [ ] Overview cards reflect state — not hardcoded
- [ ] Expired badge on Certifications sidebar tab
- [ ] Row colors correct for expired and expiring-soon employees
- [ ] Coverage gap alert fires for Sarah Chen / Press 05
- [ ] Coverage gap consistent with what Workforce tab shows
- [ ] "Log Training" updates the cert record and row color changes reactively
- [ ] Panel opens on row click with all certs listed

---

## 14. Supplier Qualification Tracker

**Files:** `client/src/App.jsx`, `client/src/SupplierPanel.jsx` (new), `client/src/styles.css`  
**Depends on:** Task 1

### State

`suppliers` state lifted to `App.jsx` (shared with Supply Chain tab):
```js
const [suppliers, setSuppliers] = useState(demoSuppliers);
```

### Status Overview cards

```js
const supplierCounts = {
  total: suppliers.length,
  approved: suppliers.filter(s => s.status === 'Approved').length,
  requalDue: suppliers.filter(s => s.status === 'Requalification Due').length,
  onHold: suppliers.filter(s => s.status === 'Suspended').length,
};
```

### Supplier Register table

Audit score colored inline:
```jsx
<td style={{ color: s.auditScore >= 80 ? 'var(--success)' : s.auditScore >= 60 ? 'var(--amber)' : 'var(--danger)', fontWeight: 600 }}>
  {s.auditScore}
</td>
```

### SupplierPanel.jsx

Status toggle buttons:
```jsx
{supplier.status !== 'Suspended'
  ? <button className="btn-danger" onClick={() => onStatusChange(supplier.id, 'Suspended')}>Put On Hold</button>
  : <button className="btn-success" onClick={() => onStatusChange(supplier.id, 'Approved')}>Approve</button>
}
```

`onStatusChange` in `App.jsx`:
```js
setSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
```

Since Supply Chain tab reads the same `suppliers` state, the risk level update is automatic via the `effectiveRiskLevel` derivation in Task 6.

### Acceptance Criteria
- [ ] At least 1 Requalification Due and 1 Suspended in demo state
- [ ] On Hold badge on sidebar tab
- [ ] Audit history shows 3 entries; declining scores trigger "↓ Declining" warning
- [ ] "Put On Hold" immediately updates risk in Supply Chain tab (shared state)
- [ ] "Approve" reverses it
- [ ] Schedule Audit adds pending entry and shows toast

---

## 15. CAPA Tracker

**Files:** `client/src/App.jsx`, `client/src/CapaPanel.jsx` (new), `server/index.js`, `server/aiService.js`, `client/src/styles.css`  
**Depends on:** Tasks 1, 11, 3

### State

```js
const [capas, setCapas] = useState(demoCapas);
```

`capas` is module-level in `App.jsx`. Cross-linked with `ncrs` state.

### Status Overview cards

```js
const capaCounts = {
  total: capas.length,
  open: capas.filter(c => c.status === 'Open').length,
  inProgress: capas.filter(c => ['Root Cause Analysis','Action Pending','Verification'].includes(c.status)).length,
  overdue: capas.filter(c => c.dueDate < Date.now() && c.status !== 'Closed').length,
  closedThisMonth: capas.filter(c => {
    const now = new Date();
    const closed = new Date(c.closedAt ?? 0);
    return c.status === 'Closed' && closed.getMonth() === now.getMonth() && closed.getFullYear() === now.getFullYear();
  }).length,
};
```

### CAPA Register

Due date rendered relative:
```js
function formatDueDate(dueDate) {
  const diffMs = dueDate - Date.now();
  const diffDays = Math.floor(Math.abs(diffMs) / 86400000);
  return diffMs > 0 ? `In ${diffDays}d` : `Overdue ${diffDays}d`;
}
```

### CapaPanel.jsx

**AI Root Cause Assist:**

```js
POST /api/ai/root-cause
Body: { capaId, machine, defectType, issueDescription, previousCapas }
```

Server system prompt:
> "You are a quality engineer performing a 5-Why root cause analysis. Format your response exactly as follows, with each on its own line:
> Why 1: [observation]
> Why 2: [deeper cause]
> Why 3: [deeper cause]
> Why 4: [deeper cause]
> Why 5: [deepest cause]
> Root Cause: [concise statement]
> Use the machine name and defect type from the data. Be specific and technical."

Client renders each `Why N:` line as a styled row:
```jsx
{diagnosisText.split('\n').map((line, i) => {
  const isRootCause = line.startsWith('Root Cause:');
  return (
    <div key={i} className={`why-row ${isRootCause ? 'root-cause-row' : ''}`}>
      {line}
    </div>
  );
})}
```

**Status Workflow stepper:**
```js
const stages = ['Open', 'Root Cause Analysis', 'Action Pending', 'Verification', 'Closed'];
const currentIdx = stages.indexOf(capa.status);
const nextStage = stages[currentIdx + 1];
```

On advance:
```js
const updatedCapa = {
  ...capa,
  status: nextStage,
  stageHistory: [...capa.stageHistory, { stage: nextStage, timestamp: Date.now() }],
  ...(nextStage === 'Closed' ? { closedAt: Date.now() } : {}),
};
setCapas(prev => prev.map(c => c.id === capa.id ? updatedCapa : c));

// Cross-link: close linked NCR
if (nextStage === 'Closed' && capa.ncrId) {
  setNcrs(prev => prev.map(n => n.id === capa.ncrId ? { ...n, status: 'Closed' } : n));
}
```

**Source NCR link:**
```jsx
{capa.ncrId && (
  <button className="link-btn" onClick={() => { setActiveTab('Quality & NCR'); setHighlightedNcr(capa.ncrId); }}>
    {capa.ncrId} →
  </button>
)}
```

In Quality & NCR tab, highlight the NCR row when `highlightedNcr` matches:
```jsx
<tr className={ncr.id === highlightedNcr ? 'row-highlighted' : ''}>
```

**New API routes:**
```
GET /api/capa        → returns capas from demoData or DB
POST /api/capa       → creates CAPA in DB or returns { mode: 'demo' }
PATCH /api/capa/:id  → updates status/actions in DB or returns { mode: 'demo' }
```

### Acceptance Criteria
- [ ] CAPA register shows demo records with at least one in each status stage
- [ ] Overdue badge on sidebar tab
- [ ] Due date is relative and correctly labeled "Overdue Nd" for past-due records
- [ ] "Suggest Root Cause" streams a formatted 5-Why with Why 1–5 and Root Cause lines
- [ ] Root Cause line styled distinctly in the panel
- [ ] Action checkboxes update `percentComplete` on the register row reactively
- [ ] Status advance timestamps the transition in `stageHistory`
- [ ] Closing a CAPA updates the linked NCR to Closed in Quality tab
- [ ] NCR count badge decrements when linked NCR is closed
- [ ] Source NCR link navigates to Quality & NCR tab and highlights the row

---

## 16. Operations AI Assistant

**Files:** `client/src/AssistantPanel.jsx` (new), `client/src/App.jsx`, `server/index.js`, `server/aiService.js`, `client/src/styles.css`  
**Depends on:** Task 3

### AssistantPanel.jsx

Props: `open`, `onClose`, `activeShift`, `data`, `ncrs`, `capas`, `anomalies`, `messages`, `onSendMessage`, `streaming`.

**Toggle button** (rendered in `App.jsx`, always visible):
```jsx
<button className="assistant-toggle" onClick={() => setAssistantOpen(o => !o)}>
  <ChatIcon /> Ask AI
</button>
```

CSS: `position: fixed; bottom: 24px; right: 24px; z-index: 1000;`

**Panel** — conditionally rendered with transition:
```jsx
<div className={`assistant-panel ${open ? 'open' : ''}`}>
```

CSS:
```css
.assistant-panel {
  position: fixed; bottom: 88px; right: 24px;
  width: 380px; height: 480px;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 12px; z-index: 999;
  display: flex; flex-direction: column;
  transform: translateY(20px); opacity: 0;
  transition: transform 0.2s ease, opacity 0.2s ease;
  pointer-events: none;
}
.assistant-panel.open {
  transform: translateY(0); opacity: 1;
  pointer-events: all;
}
```

**ESC key handler:**
```js
useEffect(() => {
  const handler = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [onClose]);
```

**Message thread** — auto-scroll to bottom:
```jsx
const threadRef = useRef(null);
useEffect(() => {
  threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
}, [messages]);
```

**Starter chips:**
```jsx
{messages.length === 0 && (
  <div className="starter-chips">
    {[
      "What's driving production loss this shift?",
      "Which machine needs attention first?",
      "How is quality trending today?",
    ].map(chip => (
      <button key={chip} className="chip" onClick={() => onSendMessage(chip)}>{chip}</button>
    ))}
  </div>
)}
```

**Input bar:**
```jsx
<div className="assistant-input-row">
  <textarea
    rows={1} maxRows={3}
    value={inputValue}
    onChange={e => setInputValue(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
    placeholder="Ask anything about the floor..."
    disabled={streaming}
  />
  <button onClick={handleSend} disabled={!inputValue.trim() || streaming}>Send</button>
</div>
```

### State in App.jsx

```js
const [assistantOpen, setAssistantOpen] = useState(false);
const [assistantMessages, setAssistantMessages] = useState([]);
const [assistantStreaming, setAssistantStreaming] = useState(false);

async function handleAssistantMessage(text) {
  const userMsg = { role: 'user', content: text };
  const updatedMessages = [...assistantMessages, userMsg];
  setAssistantMessages([...updatedMessages, { role: 'assistant', content: '' }]);
  setAssistantStreaming(true);

  const response = await fetch(`${BASE}api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: updatedMessages, shiftName: activeShift }),
  });

  if (!response.ok) {
    setAssistantMessages(prev => [
      ...prev.slice(0, -1),
      { role: 'assistant', content: 'Operations Assistant is not configured. Please set ANTHROPIC_API_KEY on the server.' }
    ]);
    setAssistantStreaming(false);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    setAssistantMessages(prev => [
      ...prev.slice(0, -1),
      { role: 'assistant', content: prev[prev.length - 1].content + chunk }
    ]);
  }
  setAssistantStreaming(false);
}
```

### Server route POST /api/ai/chat

```js
app.post('/api/ai/chat', async (req, res) => {
  const { messages, shiftName } = req.body;
  const dashboard = await getDashboardPayload(shiftName);
  const contextData = {
    shift: shiftName,
    summary: dashboard.summary,
    machines: dashboard.presses,
    downtime: dashboard.downtime,
    orders: dashboard.orders ?? [],
    openNcrs: (dashboard.ncrs ?? []).filter(n => n.status !== 'Closed'),
    overdueCApas: demoCapas.filter(c => c.dueDate < Date.now() && c.status !== 'Closed'),
    activeAlerts: dashboard.alerts,
  };

  const systemPrompt = `You are an operations intelligence assistant for a manufacturing facility.
You have real-time access to the current shift's operational and compliance data provided below.
Refer to production units as 'machines' unless the data labels them otherwise.
Be concise — operators are busy. Answer in 2-4 sentences unless asked for more detail.
Do not mention that you are an AI, do not reference JSON or data structures.`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  try {
    const stream = await aiService.streamCompletion({
      systemPrompt,
      userMessage: messages, // pass full array for multi-turn
      contextData,
    });
    stream.on('text', t => res.write(t));
    stream.on('end', () => res.end());
  } catch (err) {
    if (err.isFallback) return res.status(503).json({ error: 'AI not configured', fallback: true });
    res.status(500).json({ error: err.message });
  }
});
```

### Acceptance Criteria
- [ ] "Ask AI" toggle visible on all tabs — never overlaps sidebar or main content
- [ ] Panel slides up/down with CSS transition (not a jarring appear/disappear)
- [ ] Conversation persists across tab switches — `assistantMessages` not cleared on tab change
- [ ] Responses stream progressively — each word/token appears as it arrives
- [ ] Starter chips auto-send on click and disappear after first message
- [ ] Empty or whitespace-only message blocked — Send button disabled, Enter does nothing
- [ ] Answer to "which machine needs attention?" names real machines with real OEE from current shift
- [ ] Answer to a quality question references open NCRs from `ncrs` state
- [ ] API key missing → assistant message "Operations Assistant is not configured. Please set ANTHROPIC_API_KEY on the server."
- [ ] Works correctly for both Shift A and Shift B
- [ ] Panel does not overflow or cover main content at 1280px viewport

---

*End of specification document.*
