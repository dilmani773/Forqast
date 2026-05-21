import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts"
import "./ForecastChart.css"

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">{d?.target_date}</p>
      <p className="tooltip-val">{d?.predicted_demand?.toFixed(0)} <span>units predicted</span></p>
      <p className="tooltip-prep">Prepare: <b>{d?.units_to_prepare?.toFixed(0)}</b></p>
      <p className="tooltip-score">Waste score: <b>{d?.waste_score?.toFixed(1)}</b></p>
    </div>
  )
}

export default function ForecastChart({ forecast, activeDay, onDayClick }) {
  if (!forecast?.length) return null

  const data = forecast.map((d, i) => ({
    ...d,
    day:  new Date(d.target_date).toLocaleDateString("en", { weekday: "short" }),
    date: d.target_date,
  }))

  return (
    <div className="forecast-chart">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#3ddc84" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3ddc84" stopOpacity={0}    />
            </linearGradient>
            <linearGradient id="prepGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#5b9cf6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#5b9cf6" stopOpacity={0}    />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />

          <XAxis
            dataKey="day"
            tick={{ fill: "#566b5e", fontSize: 11, fontFamily: "DM Mono" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#566b5e", fontSize: 11, fontFamily: "DM Mono" }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(61,220,132,0.2)", strokeWidth: 1 }} />

          {/* Active day reference line */}
          <ReferenceLine
            x={data[activeDay]?.day}
            stroke="rgba(61,220,132,0.4)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          <Area
            type="monotone"
            dataKey="units_to_prepare"
            stroke="#5b9cf6"
            strokeWidth={1.5}
            fill="url(#prepGrad)"
            strokeDasharray="4 4"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="predicted_demand"
            stroke="#3ddc84"
            strokeWidth={2}
            fill="url(#demandGrad)"
            dot={(props) => {
              const { cx, cy, index } = props
              return (
                <circle
                  key={index}
                  cx={cx} cy={cy} r={index === activeDay ? 6 : 4}
                  fill={index === activeDay ? "#3ddc84" : "#0a0f0d"}
                  stroke="#3ddc84"
                  strokeWidth={2}
                  style={{ cursor: "pointer" }}
                  onClick={() => onDayClick(index)}
                />
              )
            }}
            activeDot={{ r: 6, fill: "#3ddc84", stroke: "#0a0f0d", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="chart-legend">
        <span className="legend-item green">Predicted demand</span>
        <span className="legend-item blue">Units to prepare</span>
        <span className="legend-hint">Click a point to inspect that day</span>
      </div>

      {/* Day selector */}
      <div className="day-selector">
        {data.map((d, i) => (
          <button
            key={i}
            className={`day-btn ${i === activeDay ? "active" : ""} ${d.alerts?.length ? "has-alert" : ""}`}
            onClick={() => onDayClick(i)}
          >
            <span className="day-btn-label">{d.day}</span>
            <span className="day-btn-val">{d.predicted_demand?.toFixed(0)}</span>
            {d.alerts?.length > 0 && <span className="day-alert-dot" />}
          </button>
        ))}
      </div>
    </div>
  )
}