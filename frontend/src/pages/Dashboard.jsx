import { useState, useEffect } from "react"
import { getSampleDishes, getForecast } from "../api/client"
import { ForecastChart, OrderCards, WasteGauge, ContextBadges, StatsBar } from "../components/Components"

export default function Dashboard({ selectedDish, setSelectedDish }) {
  const [dishes,    setDishes]    = useState([])
  const [dish,      setDish]      = useState(null)
  const [forecast,  setForecast]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [activeDay, setActiveDay] = useState(0)

  useEffect(() => { getSampleDishes().then(setDishes).catch(() => {}) }, [])

  useEffect(() => {
    if (selectedDish) { setDish(selectedDish); runForecast(selectedDish) }
  }, [selectedDish])

  async function runForecast(d = dish) {
    if (!d) return
    setLoading(true); setError(null); setForecast(null); setActiveDay(0)
    try {
      const result = await getForecast({
        dish_name: d.dish_name, category: d.category, cuisine: d.cuisine,
        checkout_price: d.checkout_price, base_price: d.base_price,
        cost_per_unit: d.cost_per_unit,
        recent_orders: d.recent_orders || [150,160,145,170,155,165,158,162],
        current_stock: d.current_stock || 0,
      })
      setForecast(result)
    } catch (e) {
      setError("Forecast failed — is the API running at localhost:8000?")
    } finally { setLoading(false) }
  }

  function selectDish(d) { setDish(d); setForecast(null); setSelectedDish(null) }
  const today = forecast?.forecast?.[activeDay]

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
        <div>
          <h1 className="page-title">Demand Forecast</h1>
          <p style={{ color:"var(--text2)", marginTop:4 }}>AI-powered 7-day order intelligence for your kitchen</p>
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <select className="input" style={{ width:220 }} value={dish?.dish_name || ""} onChange={e => {
            const d = dishes.find(x => x.dish_name === e.target.value)
            if (d) selectDish(d)
          }}>
            <option value="">Select a dish…</option>
            {dishes.map(d => <option key={d.dish_name} value={d.dish_name}>{d.dish_name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => runForecast()} disabled={!dish || loading}>
            {loading ? "Forecasting…" : "Run Forecast"}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!dish && !loading && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:"80px 32px", textAlign:"center", border:"1px dashed var(--border)", borderRadius:"var(--radius)" }}>
          <div style={{ fontSize:48, color:"var(--accent)", opacity:0.5, lineHeight:1, marginBottom:8 }}>⑁</div>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:20, fontWeight:700 }}>Select a dish to begin</h2>
          <p style={{ color:"var(--text2)", maxWidth:360 }}>Choose from the sample menu above or set up your own dishes in Menu Setup.</p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center", marginTop:8 }}>
            {dishes.slice(0,4).map(d => (
              <button key={d.dish_name} onClick={() => selectDish(d)} style={{
                background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text2)",
                padding:"8px 16px", borderRadius:"var(--radius-sm)", fontSize:13, cursor:"pointer",
              }}>{d.dish_name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="loading-wrap"><div className="spinner" /><span>Running forecast model…</span></div>}

      {/* Error */}
      {error && <div style={{ background:"var(--red-dim)", border:"1px solid rgba(255,95,95,0.3)", color:"var(--red)", padding:"14px 20px", borderRadius:"var(--radius-sm)" }}>⚠ {error}</div>}

      {/* Results */}
      {forecast && !loading && (
        <>
          <StatsBar forecast={forecast} />

          <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20, alignItems:"start" }}>

            {/* Left col */}
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <div className="card">
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                  <span className="section-title" style={{ marginBottom:0 }}>7-Day Demand Forecast</span>
                  <span className="badge badge-green">{dish.dish_name}</span>
                </div>
                <ForecastChart forecast={forecast.forecast} activeDay={activeDay} onDayClick={setActiveDay} />
              </div>
              <OrderCards forecast={forecast.forecast} activeDay={activeDay} />
            </div>

            {/* Right col */}
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              <WasteGauge score={forecast.avg_waste_score} />

              {today && (
                <div className="card">
                  <p className="section-title">Context — <span style={{ color:"var(--text2)", fontWeight:400 }}>{today.target_date}</span></p>
                  <ContextBadges alerts={today.alerts} modifier={today.demand_modifier} />
                </div>
              )}

              <div className="card" style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <p className="label" style={{ marginBottom:4 }}>Week Summary</p>
                <p style={{ color:"var(--text2)", fontSize:13, lineHeight:1.6 }}>{forecast.week_summary}</p>
                <div style={{ paddingTop:12, borderTop:"1px solid var(--border)" }}>
                  <p className="label">Est. weekly savings</p>
                  <p style={{ fontFamily:"var(--font-display)", fontSize:24, fontWeight:800, color:"var(--accent)", marginTop:4 }}>
                    LKR {forecast.total_savings_lkr?.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}