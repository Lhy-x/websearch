'use client'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const COLORS = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--info)', 'var(--danger)']
const axis = { fontSize: 11, fill: 'var(--muted)' }
const tooltipStyle = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--fg)' }

export function TimeSeries({ data, series, height = 240 }: { data: Record<string, string | number>[]; series: { key: string; label: string }[]; height?: number }) {
  if (!data.length) return <p className="py-10 text-center text-xs text-muted">Aucune donnée sur la période.</p>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tick={axis} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
        <YAxis tick={axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.12} strokeWidth={2} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function Bars({ data, xKey, series, height = 260 }: { data: Record<string, string | number>[]; xKey: string; series: { key: string; label: string }[]; height?: number }) {
  if (!data.length) return <p className="py-10 text-center text-xs text-muted">Aucune donnée.</p>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -18, right: 8, top: 8 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 60 : 30} />
        <YAxis tick={axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--panel-2)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
