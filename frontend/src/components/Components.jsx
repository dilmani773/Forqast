import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts"

// ════════════════════════════════════════════════════════
// FORECAST CHART
// ════════════════════════════════════════════════════════

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, padding:"12px 14px", fontSize:13 }}>
      <p style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text3)", marginBottom:6 }}>{d?.target_date}</p>
      <p style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700, color:"var(--accent)" }}>
        {d?.predicted_demand?.toFixed(0)} <span style={{ fontSize:12, color:"var(--text2)", fontWeight:400 }}>units</span>
      </p>
      <p style={{ color:"var(--text2)", fontSize:12, marginTop:4 }}>Prepare: <b>{d?.units_to_prepare?.toFixed(0)}</b></p>
      <p style={{ color:"var(--text2)", fontSize:12 }}>Waste score: <b>{d?.waste_score?.toFixed(1)}</b></p>
    </div>
  )
}

export function ForecastChart({ forecast, activeDay, onDayClick }) {
  if (!forecast?.length) return null
  const data = forecast.map(d => ({
    ...d,
    day: new Date(d.target_date).toLocaleDateString("en", { weekday: "short" }),
  }))

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top:8, right:8, bottom:0, left:-16 }}>
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3ddc84" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3ddc84" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#5b9cf6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#5b9cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="day" tick={{ fill:"#566b5e", fontSize:11, fontFamily:"DM Mono" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill:"#566b5e", fontSize:11, fontFamily:"DM Mono" }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke:"rgba(61,220,132,0.2)", strokeWidth:1 }} />
          <ReferenceLine x={data[activeDay]?.day} stroke="rgba(61,220,132,0.4)" strokeWidth={1} strokeDasharray="4 4" />
          <Area type="monotone" dataKey="units_to_prepare" stroke="#5b9cf6" strokeWidth={1.5} fill="url(#g2)" strokeDasharray="4 4" dot={false} />
          <Area
            type="monotone" dataKey="predicted_demand" stroke="#3ddc84" strokeWidth={2} fill="url(#g1)"
            dot={(props) => {
              const { cx, cy, index } = props
              return <circle key={index} cx={cx} cy={cy} r={index === activeDay ? 6 : 4}
                fill={index === activeDay ? "#3ddc84" : "#0a0f0d"} stroke="#3ddc84" strokeWidth={2}
                style={{ cursor:"pointer" }} onClick={() => onDayClick(index)} />
            }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ display:"flex", gap:16, fontSize:12, color:"var(--text3)", alignItems:"center" }}>
        <span style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:20, height:2, background:"var(--accent)", display:"inline-block", borderRadius:1 }} />
          Predicted demand
        </span>
        <span style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:20, height:0, borderTop:"2px dashed var(--blue)", display:"inline-block" }} />
          Units to prepare
        </span>
        <span style={{ marginLeft:"auto", fontFamily:"var(--font-mono)", fontSize:10 }}>Click a point to inspect</span>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6 }}>
        {data.map((d, i) => (
          <button key={i} onClick={() => onDayClick(i)} style={{
            background: i === activeDay ? "var(--accent-dim)" : "var(--surface)",
            border: `1px solid ${i === activeDay ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)", padding:"10px 4px 8px",
            cursor:"pointer", display:"flex", flexDirection:"column",
            alignItems:"center", gap:4, position:"relative", transition:"all 0.15s",
          }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color: i === activeDay ? "var(--accent)" : "var(--text3)", textTransform:"uppercase" }}>{d.day}</span>
            <span style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:700, color:"var(--text)" }}>{d.predicted_demand?.toFixed(0)}</span>
            {d.alerts?.length > 0 && (
              <span style={{ position:"absolute", top:6, right:6, width:5, height:5, background:"var(--amber)", borderRadius:"50%" }} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════
// ORDER CARDS
// ════════════════════════════════════════════════════════

export function OrderCards({ forecast, activeDay }) {
  if (!forecast?.length) return null
  const d = forecast[activeDay]
  if (!d) return null

  const cards = [
    { label:"Predicted Demand", value:d.predicted_demand?.toFixed(0), unit:"units",           color:"var(--accent)", border:"var(--accent)" },
    { label:"Prepare Today",    value:d.units_to_prepare?.toFixed(0),  unit:"units",           color:"var(--blue)",   border:"var(--blue)"   },
    { label:"Order Now",        value:d.units_to_order?.toFixed(0),    unit:"units",           color:"var(--amber)",  border:"var(--amber)"  },
    { label:"Cost Saved",       value:`LKR ${d.cost_saved_lkr?.toLocaleString()}`, unit:"vs naive ordering", color:"var(--accent)", border:"var(--accent)" },
  ]

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background:"var(--bg2)", border:`1px solid var(--border)`,
          borderLeft:`3px solid ${c.border}`, borderRadius:"var(--radius)",
          padding:"18px 16px", display:"flex", flexDirection:"column", gap:8,
        }}>
          <p style={{ fontFamily:"var(--font-mono)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--text3)" }}>{c.label}</p>
          <p style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, color:"var(--text)", lineHeight:1 }}>{c.value}</p>
          <p style={{ fontSize:11, color:"var(--text3)" }}>{c.unit}</p>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// WASTE GAUGE
// ════════════════════════════════════════════════════════

export function WasteGauge({ score }) {
  const r     = 52
  const circ  = 2 * Math.PI * r
  const fill  = (score / 100) * circ * 0.75
  const color = score >= 75 ? "#3ddc84" : score >= 55 ? "#f5a623" : "#ff5f5f"

  return (
    <div className="card" style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <p className="section-title">Waste Reduction Score</p>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
        <svg width="140" height="100" viewBox="0 0 140 100">
          <path d="M 14 90 A 56 56 0 1 1 126 90" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
          <path d="M 14 90 A 56 56 0 1 1 126 90" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${fill} ${circ}`} style={{ transition:"stroke-dasharray 1s ease" }} />
          <text x="70" y="82" textAnchor="middle" fill={color} fontSize="26" fontFamily="Syne" fontWeight="800">{score?.toFixed(0)}</text>
          <text x="70" y="96" textAnchor="middle" fill="#566b5e" fontSize="10" fontFamily="DM Mono">out of 100</text>
        </svg>
        <div style={{ display:"flex", justifyContent:"space-between", width:130, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text3)", marginTop:-8 }}>
          <span>0</span><span>100</span>
        </div>
      </div>
      <p style={{ fontSize:12, color:"var(--text2)", lineHeight:1.5 }}>
        {score >= 75 ? "High confidence — very little waste expected."
         : score >= 55 ? "Moderate confidence — review context alerts."
         : "Lower confidence — add more sales history."}
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════
// CONTEXT BADGES
// ════════════════════════════════════════════════════════

export function ContextBadges({ alerts, modifier }) {
  const modColor = modifier >= 1.1 ? "green" : modifier <= 0.9 ? "red" : "blue"
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div className={`badge badge-${modColor}`} style={{ marginBottom:4, alignSelf:"flex-start" }}>
        Demand modifier: {modifier?.toFixed(2)}×
      </div>
      {alerts?.length === 0 && (
        <p style={{ color:"var(--text3)", fontSize:13 }}>No special context for this day.</p>
      )}
      {alerts?.map((a, i) => (
        <div key={i} style={{
          display:"flex", alignItems:"flex-start", gap:10,
          padding:"10px 12px", borderRadius:"var(--radius-sm)",
          fontSize:12, lineHeight:1.4,
          background: a.level==="warning" ? "var(--amber-dim)" : a.level==="success" ? "var(--accent-dim)" : "var(--blue-dim)",
          border: `1px solid ${a.level==="warning" ? "rgba(245,166,35,0.2)" : a.level==="success" ? "rgba(61,220,132,0.2)" : "rgba(91,156,246,0.2)"}`,
          color: a.level==="warning" ? "var(--amber)" : a.level==="success" ? "var(--accent)" : "var(--blue)",
        }}>
          <span style={{ fontSize:14, flexShrink:0 }}>
            {a.type==="poya" ? "🌕" : a.type==="monsoon" ? "🌧" : a.type==="holiday" ? "🎌" : "🎉"}
          </span>
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════
// STATS BAR
// ════════════════════════════════════════════════════════

export function StatsBar({ forecast }) {
  if (!forecast?.forecast?.length) return null
  const days   = forecast.forecast
  const total  = days.reduce((s, d) => s + d.predicted_demand, 0)
  const peak   = days.reduce((a, b) => a.predicted_demand > b.predicted_demand ? a : b)
  const lowest = days.reduce((a, b) => a.predicted_demand < b.predicted_demand ? a : b)

  const stats = [
    { label:"Total week demand",  value:total?.toFixed(0),                             unit:"units" },
    { label:"Peak day",           value:peak?.target_date,                             unit:`${peak?.predicted_demand?.toFixed(0)} units` },
    { label:"Lowest day",         value:lowest?.target_date,                           unit:`${lowest?.predicted_demand?.toFixed(0)} units` },
    { label:"Avg waste score",    value:forecast.avg_waste_score?.toFixed(1),          unit:"/ 100" },
    { label:"Weekly savings",     value:`LKR ${forecast.total_savings_lkr?.toLocaleString()}`, unit:"estimated" },
  ]

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:1, background:"var(--border)", border:"1px solid var(--border)", borderRadius:"var(--radius)", overflow:"hidden", marginBottom:4 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background:"var(--bg2)", padding:"16px 20px" }}>
          <p className="label">{s.label}</p>
          <p style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:700, color:"var(--text)", marginTop:4 }}>{s.value}</p>
          <p style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>{s.unit}</p>
        </div>
      ))}
    </div>
  )
}