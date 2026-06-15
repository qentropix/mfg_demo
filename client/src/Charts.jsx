import {
  AreaChart,
  Area,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const TOOLTIP_STYLE = {
  background: '#0d1117',
  border: '1px solid rgba(163,189,255,0.15)',
  borderRadius: '8px',
  color: '#cdd9f5',
  fontSize: '12px'
};

const TICK_STYLE = { fill: '#6875a8', fontSize: 11 };

export function OeeTrendChart({ data }) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>OEE Trend (Last 7 Days)</h3>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="oeeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#29d3ff" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#29d3ff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(163,189,255,0.08)" />
          <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis
            domain={[60, 100]}
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            unit="%"
            width={38}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [`${Number(v).toFixed(1)}%`, 'OEE']}
            cursor={{ stroke: 'rgba(163,189,255,0.2)' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#29d3ff"
            strokeWidth={2.5}
            fill="url(#oeeGrad)"
            dot={{ fill: '#29d3ff', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#29d3ff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DowntimeParetoChart({ data }) {
  const total = data.reduce((s, d) => s + d.minutes, 0) || 1;
  let running = 0;
  const enriched = data.map((d) => {
    running += d.minutes;
    return { ...d, cumulative: parseFloat(((running / total) * 100).toFixed(1)) };
  });

  return (
    <div className="chart-card">
      <div className="chart-header">
        <h3>Downtime Pareto (Today)</h3>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={enriched} margin={{ top: 10, right: 38, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7d63ff" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#9c44ff" stopOpacity={0.9} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(163,189,255,0.08)" />
          <XAxis dataKey="reason" tick={TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="left"
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            unit="m"
            width={38}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            unit="%"
            width={38}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(163,189,255,0.05)' }}
          />
          <Bar
            yAxisId="left"
            dataKey="minutes"
            fill="url(#barGrad)"
            radius={[4, 4, 0, 0]}
            maxBarSize={60}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative"
            stroke="#ffb53f"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
