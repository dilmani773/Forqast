// ── OrderCards ───────────────────────────────────────────────────────────────
import "./Components.css"

export function OrderCards({ forecast, activeDay }) {
  if (!forecast?.length) return null
  const d = forecast[activeDay]
  if (!d) return null

  const cards = [
    {
      label:   "Predicted Demand",
      value:   d.predicted_demand?.toFixed(0),
      unit:    "units",
      color:   "green",
      icon:    "◈",
    },
    {
      label:   "Prepare Today",
      value:   d.units_to_prepare?.toFixed(0),
      unit:    "units",
      color:   "blue",
      icon:    "◎",
    },
    {
      label:   "Order Now",
      value:   d.units_to_order?.toFixed(0),
      unit:    "units",
      color:   d.units_to_order > 0 ? "amber" : "green",
      icon:    "◇",
    },
    {
      label:   "Cost Saved",
      value:   `LKR ${d.cost_saved_lkr?.toLocaleString()}`,
      unit:    "vs naive ordering",
      color:   "green",
      icon:    "◉",
    },
  ]

  return (
    <div className="order-cards">
      {cards.map((c) => (
        <div key={c.label} className={`order-card order-card-${c.color}`}>
          <div className="order-card-icon">{c.icon}</div>
          <div className="order-card-body">
            <p className="order-card-label">{c.label}</p>
            <p className="order-card-value">{c.value}</p>
            <p className="order-card-unit">{c.unit}</p>
          </div>
          <div className={`order-card-conf badge-${c.color === "green" ? "green" : c.color === "blue" ? "blue" : c.color === "amber" ? "amber" : "green"}`}>
            {d.confidence}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── WasteGauge ───────────────────────────────────────────────────────────────
export function WasteGauge({ score }) {
  const r     = 52
  const circ  = 2 * Math.PI * r
  const fill  = (score / 100) * circ * 0.75
  const color = score >= 75 ? "#3ddc84" : score >= 55 ? "#f5a623" : "#ff5f5f"

  return (
    <div className="card waste-gauge-card">
      <p className="section-title">Waste Reduction Score</p>
      <div className="gauge-wrap">
        <svg width="140" height="100" viewBox="0 0 140 100">
          {/* Track */}
          <path
            d="M 14 90 A 56 56 0 1 1 126 90"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Fill */}
          <path
            d="M 14 90 A 56 56 0 1 1 126 90"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${fill} ${circ}`}
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
          <text x="70" y="82" textAnchor="middle" fill={color} fontSize="26" fontFamily="Syne" fontWeight="800">
            {score?.toFixed(0)}
          </text>
          <text x="70" y="96" textAnchor="middle" fill="#566b5e" fontSize="10" fontFamily="DM Mono">
            out of 100
          </text>
        </svg>
        <div className="gauge-labels">
          <span>0</span>
          <span>100</span>
        </div>
      </div>
      <p className="gauge-desc">
        {score >= 75
          ? "High confidence — very little waste expected this week."
          : score >= 55
          ? "Moderate confidence — review context alerts for accuracy."
          : "Lower confidence — consider adding more sales history."
        }
      </p>
    </div>
  )
}

// ── ContextBadges ────────────────────────────────────────────────────────────
export function ContextBadges({ alerts, modifier }) {
  const modColor = modifier >= 1.1 ? "green" : modifier <= 0.9 ? "red" : "blue"

  return (
    <div className="context-badges">
      <div className={`badge badge-${modColor}`} style={{ marginBottom: 12 }}>
        Demand modifier: {modifier?.toFixed(2)}×
      </div>

      {alerts?.length === 0 && (
        <p style={{ color: "var(--text3)", fontSize: 13 }}>No special context for this day.</p>
      )}

      {alerts?.map((a, i) => (
        <div
          key={i}
          className={`context-alert context-alert-${
            a.level === "warning" ? "amber" :
            a.level === "success" ? "green" : "blue"
          }`}
        >
          <span className="alert-icon">
            {a.type === "poya"    ? "🌕" :
             a.type === "monsoon" ? "🌧" :
             a.type === "holiday" ? "🎌" :
             a.type === "event"   ? "🎉" : "•"}
          </span>
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  )
}

// ── StatsBar ─────────────────────────────────────────────────────────────────
export function StatsBar({ forecast, dish }) {
  if (!forecast) return null

  const total    = forecast.forecast?.reduce((s, d) => s + d.predicted_demand, 0)
  const maxDay   = forecast.forecast?.reduce((a, b) => a.predicted_demand > b.predicted_demand ? a : b)
  const minDay   = forecast.forecast?.reduce((a, b) => a.predicted_demand < b.predicted_demand ? a : b)
  const hasAlert = forecast.forecast?.some(d => d.alerts?.length > 0)

  const stats = [
    { label: "Total week demand",   value: total?.toFixed(0),                        unit: "units" },
    { label: "Peak day",            value: maxDay?.target_date,                      unit: `${maxDay?.predicted_demand?.toFixed(0)} units` },
    { label: "Lowest day",          value: minDay?.target_date,                      unit: `${minDay?.predicted_demand?.toFixed(0)} units` },
    { label: "Avg waste score",     value: forecast.avg_waste_score?.toFixed(1),     unit: "/ 100" },
    { label: "Weekly savings",      value: `LKR ${forecast.total_savings_lkr?.toLocaleString()}`, unit: "estimated" },
  ]

  return (
    <div className="stats-bar">
      {stats.map(s => (
        <div key={s.label} className="stat-item">
          <p className="label">{s.label}</p>
          <p className="stat-val">{s.value}</p>
          <p className="stat-unit">{s.unit}</p>
        </div>
      ))}
      {hasAlert && (
        <div className="stat-item stat-alert">
          <p className="label">Alerts</p>
          <p className="stat-val" style={{ color: "var(--amber)" }}>Active</p>
          <p className="stat-unit">check calendar</p>
        </div>
      )}
    </div>
  )
}