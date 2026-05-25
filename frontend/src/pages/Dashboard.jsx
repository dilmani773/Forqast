import { useState, useEffect } from "react"
import { getSampleDishes, getForecast } from "../api/client"
import { ForecastChart, OrderCards, WasteGauge, ContextBadges, StatsBar } from "../components/Components"

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}
function getDate() {
  return new Date().toLocaleDateString("en-LK",{weekday:"long",year:"numeric",month:"long",day:"numeric"})
}

export default function Dashboard({ selectedDish, setSelectedDish, uploadedDishes }) {
  const [sampleDishes, setSampleDishes] = useState([])
  const [dish,         setDish]         = useState(null)
  const [forecast,     setForecast]     = useState(null)
  const [allForecasts, setAllForecasts] = useState([])
  const [loading,      setLoading]      = useState(false)
  const [loadingAll,   setLoadingAll]   = useState(false)
  const [error,        setError]        = useState(null)
  const [activeDay,    setActiveDay]    = useState(0)
  const [view,         setView]         = useState("home") // home | single | all

  // All available dishes = uploaded + sample
  const allDishes = uploadedDishes.length > 0 ? uploadedDishes : sampleDishes

  useEffect(()=>{ getSampleDishes().then(setSampleDishes).catch(()=>{}) },[])

  useEffect(()=>{
    if (selectedDish) { setDish(selectedDish); runForecast(selectedDish) }
  },[selectedDish])

  async function runForecast(d = dish) {
    if (!d) return
    setLoading(true); setError(null); setForecast(null); setActiveDay(0); setView("single")
    try {
      const result = await getForecast({
        dish_name:      d.dish_name,
        category:       d.category   || "Rice Bowl",
        cuisine:        d.cuisine    || "Sri Lankan",
        checkout_price: d.checkout_price || 450,
        base_price:     d.base_price     || 500,
        cost_per_unit:  d.cost_per_unit  || 180,
        recent_orders:  d.recent_orders  || [150,160,145,170,155,165,158,162],
        current_stock:  d.current_stock  || 0,
        custom_events:  d.special_days   || {},
      })
      setForecast(result)
    } catch(e) {
      setError("Could not reach the API. Make sure the backend is running at localhost:8000.")
    } finally { setLoading(false) }
  }

  async function runAllDishes() {
    if (!allDishes.length) return
    setLoadingAll(true); setAllForecasts([]); setView("all"); setForecast(null)
    const results = []
    for (const d of allDishes) {
      try {
        const r = await getForecast({
          dish_name:      d.dish_name,
          category:       d.category   || "Rice Bowl",
          cuisine:        d.cuisine    || "Sri Lankan",
          checkout_price: d.checkout_price || 450,
          base_price:     d.base_price     || 500,
          cost_per_unit:  d.cost_per_unit  || 180,
          recent_orders:  d.recent_orders  || [150,160,145,170,155,165,158,162],
          current_stock:  0,
        })
        results.push({ dish: d, forecast: r })
      } catch {}
    }
    setAllForecasts(results)
    setLoadingAll(false)
  }

  function exportAll() {
    if (!allForecasts.length) return
    const lines = [
      `FORQAST — Full Kitchen Plan`,
      `Generated: ${new Date().toLocaleString("en-LK")}`,
      `Dishes: ${allForecasts.length}`,
      ``,
      `═══════════════════════════════════════`,
      `TOMORROW'S PREPARATION ORDER`,
      `═══════════════════════════════════════`,
      ...allForecasts.map(r => {
        const t = r.forecast?.forecast?.[0]
        return `${r.dish.dish_name.padEnd(25)} → Prepare: ${String(t?.units_to_prepare?.toFixed(0)||0).padStart(4)} units   (predicted demand: ${t?.predicted_demand?.toFixed(0)||0})`
      }),
      ``,
      `═══════════════════════════════════════`,
      `7-DAY FORECAST PER DISH`,
      `═══════════════════════════════════════`,
      ...allForecasts.map(r => [
        ``,
        `${r.dish.dish_name}`,
        `Weekly savings: LKR ${r.forecast?.total_savings_lkr?.toLocaleString()}   Waste score: ${r.forecast?.avg_waste_score?.toFixed(0)}/100`,
        ...r.forecast?.forecast?.map(d =>
          `  ${d.target_date}   Prepare ${String(d.units_to_prepare?.toFixed(0)).padStart(4)} units   Predicted: ${d.predicted_demand?.toFixed(0)}`
        ),
      ]).flat(),
      ``,
      `═══════════════════════════════════════`,
      `SUMMARY`,
      `Total units tomorrow: ${allForecasts.reduce((s,r)=>s+(r.forecast?.forecast?.[0]?.units_to_prepare||0),0).toFixed(0)}`,
      `Total weekly savings: LKR ${allForecasts.reduce((s,r)=>s+(r.forecast?.total_savings_lkr||0),0).toLocaleString()}`,
    ]
    const blob = new Blob([lines.join("\n")],{type:"text/plain"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href=url; a.download=`forqast-all-dishes-${new Date().toISOString().split("T")[0]}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  function whatsappAll() {
    if (!allForecasts.length) return
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1)
    const dateStr  = tomorrow.toLocaleDateString("en-LK",{weekday:"short",month:"short",day:"numeric"})
    const lines = [
      `*Forqast Kitchen Plan — ${dateStr}*`,
      ``,
      `*Tomorrow's prep list:*`,
      ...allForecasts.map(r => {
        const t = r.forecast?.forecast?.[0]
        return `• ${r.dish.dish_name}: *${t?.units_to_prepare?.toFixed(0)} units*`
      }),
      ``,
      `Est. weekly savings: *LKR ${allForecasts.reduce((s,r)=>s+(r.forecast?.total_savings_lkr||0),0).toLocaleString()}*`,
      `_Generated by Forqast_`,
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank")
  }

  function whatsappSingle() {
    if (!forecast) return
    const t = forecast.forecast?.[0]
    const lines = [
      `*Forqast — ${dish?.dish_name}*`,
      ``,
      `*Tomorrow (${t?.target_date})*`,
      `Prepare: *${t?.units_to_prepare?.toFixed(0)} units*`,
      `Order now: ${t?.units_to_order?.toFixed(0)} units`,
      ``,
      `*7-day plan:*`,
      ...forecast.forecast.map(d=>`• ${d.target_date}: ${d.units_to_prepare?.toFixed(0)} units`),
      ``,
      `Weekly savings: *LKR ${forecast.total_savings_lkr?.toLocaleString()}*`,
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank")
  }

  function exportSingle() {
    if (!forecast) return
    const t = forecast.forecast?.[0]
    const lines = [
      `FORQAST — ${dish?.dish_name}`,
      `Generated: ${new Date().toLocaleString("en-LK")}`,
      ``,
      `TOMORROW (${t?.target_date})`,
      `  Predicted demand : ${t?.predicted_demand?.toFixed(0)} units`,
      `  Prepare          : ${t?.units_to_prepare?.toFixed(0)} units`,
      `  Order now        : ${t?.units_to_order?.toFixed(0)} units`,
      ``,
      `7-DAY PLAN`,
      ...forecast.forecast.map(d=>`  ${d.target_date}  Prepare ${d.units_to_prepare?.toFixed(0)} units`),
      ``,
      `Weekly savings: LKR ${forecast.total_savings_lkr?.toLocaleString()}`,
      `Waste score: ${forecast.avg_waste_score?.toFixed(0)}/100`,
    ]
    const blob = new Blob([lines.join("\n")],{type:"text/plain"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href=url; a.download=`forqast-${dish?.dish_name?.replace(/\s+/g,"-")}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  function selectDish(d) { setDish(d); setForecast(null); setSelectedDish(null) }
  const today = forecast?.forecast?.[activeDay]
  const totalSavings = allForecasts.reduce((s,r)=>s+(r.forecast?.total_savings_lkr||0),0)
  const totalUnits   = allForecasts.reduce((s,r)=>s+(r.forecast?.forecast?.[0]?.units_to_prepare||0),0)

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>

      {/* ── Header ── */}
      <div className="card" style={{padding:"28px 32px"}}>
        <p style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>{getDate()}</p>
        <h1 className="page-title" style={{fontSize:26,marginBottom:6}}>
          {getGreeting()}. {view==="all" ? "Full kitchen plan" : view==="single" && dish ? `Forecast for ${dish.dish_name}` : "What would you like to forecast today?"}
        </h1>
        <p style={{color:"var(--text2)",fontSize:14,marginBottom:20,lineHeight:1.6,maxWidth:600}}>
          {view==="home"
            ? "Forqast checks Poya days, monsoons, holidays, and your restaurant's history to tell you exactly how much to prepare."
            : view==="all"
            ? `Showing forecasts for all ${allForecasts.length || allDishes.length} dishes.`
            : `7-day demand forecast with Sri Lankan context alerts.`
          }
        </p>

        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          {/* Dish selector */}
          <select className="input" style={{width:200}}
            value={dish?.dish_name||""}
            onChange={e=>{const d=allDishes.find(x=>x.dish_name===e.target.value);if(d)selectDish(d)}}>
            <option value="">Choose a dish…</option>
            {allDishes.map(d=><option key={d.dish_name} value={d.dish_name}>{d.dish_name}</option>)}
          </select>

          <button className="btn btn-primary" onClick={()=>runForecast()} disabled={!dish||loading}>
            {loading?"Forecasting…":"Get Forecast →"}
          </button>

          <button className="btn btn-ghost" onClick={runAllDishes} disabled={loadingAll||!allDishes.length}>
            {loadingAll?"Running all dishes…":`Plan All ${allDishes.length} Dishes`}
          </button>

          {/* Export/share buttons — show when results exist */}
          {view==="all" && allForecasts.length>0 && (
            <>
              <button className="btn btn-ghost" onClick={exportAll}>↓ Download Full Report</button>
              <button onClick={whatsappAll} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:"var(--radius-sm)",border:"1px solid rgba(37,211,102,0.4)",background:"rgba(37,211,102,0.1)",color:"#4cd964",fontSize:14,cursor:"pointer",fontFamily:"var(--font-body)"}}>
                📱 WhatsApp All
              </button>
            </>
          )}
          {view==="single" && forecast && (
            <>
              <button className="btn btn-ghost" onClick={exportSingle}>↓ Export</button>
              <button onClick={whatsappSingle} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:"var(--radius-sm)",border:"1px solid rgba(37,211,102,0.4)",background:"rgba(37,211,102,0.1)",color:"#4cd964",fontSize:14,cursor:"pointer",fontFamily:"var(--font-body)"}}>
                📱 WhatsApp
              </button>
            </>
          )}
          {(view==="single"||view==="all") && (
            <button className="btn btn-ghost" onClick={()=>{setView("home");setForecast(null);setAllForecasts([])}}>← Back</button>
          )}
        </div>

        {uploadedDishes.length>0 && (
          <p style={{marginTop:12,fontSize:12,color:"var(--accent)",fontFamily:"var(--font-mono)"}}>
            ✓ Using your uploaded menu — {uploadedDishes.length} dishes
          </p>
        )}
      </div>

      {/* Loading */}
      {(loading||loadingAll) && (
        <div className="loading-wrap">
          <div className="spinner"/>
          <span>{loadingAll?`Forecasting ${allDishes.length} dishes — please wait…`:"Checking Poya days, monsoon, holidays…"}</span>
        </div>
      )}

      {error && (
        <div style={{background:"var(--red-dim)",border:"1px solid rgba(255,107,107,0.3)",color:"var(--red)",padding:"14px 20px",borderRadius:"var(--radius-sm)"}}>⚠ {error}</div>
      )}

      {/* ── HOME — quick dish buttons ── */}
      {view==="home" && !loading && (
        <div className="card">
          <p className="section-title">Quick forecast</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {allDishes.map(d=>(
              <button key={d.dish_name} onClick={()=>{selectDish(d);setTimeout(()=>runForecast(d),50)}} style={{
                background:"rgba(28,43,34,0.6)",border:"1px solid var(--border)",color:"var(--text2)",
                padding:"9px 18px",borderRadius:"var(--radius-sm)",fontSize:13,cursor:"pointer",
                transition:"all 0.15s",fontFamily:"var(--font-body)",
              }}
              onMouseEnter={e=>{e.target.style.color="var(--accent)";e.target.style.borderColor="var(--accent)"}}
              onMouseLeave={e=>{e.target.style.color="var(--text2)";e.target.style.borderColor="var(--border)"}}>
                {d.dish_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ ALL DISHES VIEW ══ */}
      {view==="all" && !loadingAll && allForecasts.length>0 && (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Summary */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[
              {label:"Total units to prepare tomorrow",value:Math.round(totalUnits).toLocaleString(),unit:"units across all dishes",color:"var(--accent)"},
              {label:"Dishes forecasted",value:allForecasts.length,unit:"on your menu",color:"var(--text)"},
              {label:"Total estimated weekly savings",value:`LKR ${Math.round(totalSavings).toLocaleString()}`,unit:"from smarter ordering",color:"var(--accent)"},
            ].map(s=>(
              <div key={s.label} className="card" style={{padding:"20px 24px"}}>
                <p className="label" style={{marginBottom:8}}>{s.label}</p>
                <p style={{fontFamily:"var(--font-display)",fontSize:26,fontWeight:800,color:s.color,lineHeight:1}}>{s.value}</p>
                <p style={{fontSize:12,color:"var(--text3)",marginTop:4}}>{s.unit}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1px solid var(--border)"}}>
                  {["Dish","Category","Prepare Tomorrow","7-Day Total","Waste Score","Weekly Savings","Alerts"].map(h=>(
                    <th key={h} style={{padding:"14px 18px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text3)",fontWeight:400,background:"rgba(17,26,22,0.6)"}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allForecasts.map((r,i)=>{
                  const tomorrow = r.forecast?.forecast?.[0]
                  const weekTotal = r.forecast?.forecast?.reduce((s,d)=>s+d.predicted_demand,0)
                  const alerts = tomorrow?.alerts?.length||0
                  const score = r.forecast?.avg_waste_score||0
                  return (
                    <tr key={r.dish.dish_name}
                      style={{borderBottom:"1px solid rgba(46,64,53,0.5)",cursor:"pointer",transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(28,43,34,0.4)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                      onClick={()=>{selectDish(r.dish);setForecast(r.forecast);setView("single")}}>
                      <td style={{padding:"14px 18px",fontWeight:600,color:"var(--text)"}}>{r.dish.dish_name}</td>
                      <td style={{padding:"14px 18px",color:"var(--text2)"}}>{r.dish.category||"—"}</td>
                      <td style={{padding:"14px 18px"}}>
                        <span style={{fontFamily:"var(--font-display)",fontSize:18,fontWeight:800,color:"var(--accent)"}}>{tomorrow?.units_to_prepare?.toFixed(0)}</span>
                        <span style={{color:"var(--text3)",fontSize:11,marginLeft:5}}>units</span>
                      </td>
                      <td style={{padding:"14px 18px",color:"var(--text2)"}}>{weekTotal?.toFixed(0)} units</td>
                      <td style={{padding:"14px 18px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:48,height:5,borderRadius:3,background:"rgba(46,64,53,0.8)",overflow:"hidden"}}>
                            <div style={{width:`${score}%`,height:"100%",background:score>=75?"var(--accent)":score>=55?"var(--amber)":"var(--red)",borderRadius:3}}/>
                          </div>
                          <span style={{color:"var(--text2)",fontSize:13,fontWeight:500}}>{score.toFixed(0)}</span>
                        </div>
                      </td>
                      <td style={{padding:"14px 18px",color:"var(--accent)",fontFamily:"var(--font-mono)",fontSize:12,fontWeight:500}}>LKR {r.forecast?.total_savings_lkr?.toLocaleString()}</td>
                      <td style={{padding:"14px 18px"}}>
                        {alerts>0
                          ?<span style={{background:"var(--amber-dim)",color:"var(--amber)",border:"1px solid rgba(245,166,35,0.25)",padding:"3px 10px",borderRadius:99,fontSize:11}}>{alerts} alert{alerts>1?"s":""}</span>
                          :<span style={{color:"var(--text3)",fontSize:12}}>Clear</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{fontSize:12,color:"var(--text3)",textAlign:"center",fontFamily:"var(--font-mono)"}}>Click any dish for its full 7-day breakdown</p>
        </div>
      )}

      {/* ══ SINGLE DISH VIEW ══ */}
      {view==="single" && forecast && !loading && (
        <>
          <StatsBar forecast={forecast}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20,alignItems:"start"}}>
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <div className="card">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                  <div>
                    <span className="section-title" style={{marginBottom:0}}>7-Day Demand Forecast</span>
                    <p style={{color:"var(--text3)",fontSize:11,marginTop:3,fontFamily:"var(--font-mono)"}}>Click any day to see order details</p>
                  </div>
                  <span className="badge badge-green">{dish?.dish_name}</span>
                </div>
                <ForecastChart forecast={forecast.forecast} activeDay={activeDay} onDayClick={setActiveDay}/>
              </div>
              <OrderCards forecast={forecast.forecast} activeDay={activeDay}/>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <WasteGauge score={forecast.avg_waste_score}/>
              {today && (
                <div className="card">
                  <p style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:15,marginBottom:10}}>{today.target_date} — what to expect</p>
                  {today.demand_label && (
                    <div style={{background:"var(--accent-dim)",border:"1px solid rgba(61,220,132,0.2)",borderRadius:"var(--radius-sm)",padding:"10px 14px",marginBottom:12,fontSize:13,color:"var(--accent)",lineHeight:1.5}}>
                      {today.demand_label}
                    </div>
                  )}
                  <ContextBadges alerts={today.alerts} modifier={today.demand_modifier}/>
                </div>
              )}
              <div className="card" style={{background:"linear-gradient(135deg,rgba(61,220,132,0.1) 0%,rgba(11,17,14,0.85) 70%)",border:"1px solid rgba(61,220,132,0.25)"}}>
                <p className="label" style={{marginBottom:8}}>This week you could save</p>
                <p style={{fontFamily:"var(--font-display)",fontSize:30,fontWeight:800,color:"var(--accent)",lineHeight:1,marginBottom:6}}>LKR {forecast.total_savings_lkr?.toLocaleString()}</p>
                <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.6,marginBottom:14}}>{forecast.week_summary}</p>
                <div style={{display:"flex",gap:20,paddingTop:12,borderTop:"1px solid rgba(61,220,132,0.15)"}}>
                  <div><p className="label">Waste Score</p><p style={{fontFamily:"var(--font-display)",fontSize:20,fontWeight:700,color:"var(--accent)",marginTop:3}}>{forecast.avg_waste_score?.toFixed(0)}/100</p></div>
                  <div><p className="label">Confidence</p><p style={{fontFamily:"var(--font-display)",fontSize:20,fontWeight:700,color:"var(--text)",marginTop:3,textTransform:"capitalize"}}>{forecast.forecast?.[0]?.confidence}</p></div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}