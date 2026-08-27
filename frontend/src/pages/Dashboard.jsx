import { useState, useEffect } from "react"
import { getSampleDishes, getForecast } from "../api/client"
import { ForecastChart, OrderCards, WasteGauge, ContextBadges, StatsBar } from "../components/Components"

const HISTORY_KEY = "forqast_forecast_history"
function saveHistory(dishName, weekTotal) {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY)||"{}")
    h[dishName] = weekTotal
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
  } catch {}
}
function loadHistory(dishName) {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY)||"{}")
    return h[dishName] || null
  } catch { return null }
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}
function getDate() {
  return new Date().toLocaleDateString("en-LK",{weekday:"long",year:"numeric",month:"long",day:"numeric"})
}

// ── Fix 2: Generate human-readable explanation of forecast change ────────────
function getForecastExplanation(forecast, dishName) {
  if (!forecast?.forecast?.length) return null

  const days        = forecast.forecast
  const peakDay     = days.reduce((a,b)=>a.predicted_demand>b.predicted_demand?a:b)
  const lowestDay   = days.reduce((a,b)=>a.predicted_demand<b.predicted_demand?a:b)
  const weekTotal   = days.reduce((s,d)=>s+d.predicted_demand,0)
  const prevWeek    = loadHistory(dishName)
  const alerts      = days.flatMap(d=>d.alerts||[])
  const hasMonster  = alerts.some(a=>a.type==="monsoon")
  const hasPoya     = alerts.some(a=>a.type==="poya")
  const hasHoliday  = alerts.some(a=>a.type==="holiday")
  const hasEvent    = alerts.some(a=>a.type==="event")

  const reasons = []

  if (prevWeek) {
    const diff    = weekTotal - prevWeek
    const diffPct = Math.round(Math.abs(diff/prevWeek)*100)
    if (Math.abs(diffPct) >= 5) {
      reasons.push(
        diff > 0
          ? `This week's total is ${diffPct}% higher than last week (${Math.round(prevWeek)} → ${Math.round(weekTotal)} units).`
          : `This week's total is ${diffPct}% lower than last week (${Math.round(prevWeek)} → ${Math.round(weekTotal)} units).`
      )
    } else {
      reasons.push(`Demand is similar to last week — within 5%.`)
    }
  }

  if (hasPoya)    reasons.push(`A Poya day this week will reduce meat dish demand — prepare less on that day.`)
  if (hasMonster) reasons.push(`Heavy monsoon season means fewer walk-in customers. Delivery orders may compensate.`)
  if (hasHoliday) reasons.push(`A public holiday this week — some days will be busier than usual.`)
  if (hasEvent)   reasons.push(`A local event nearby will drive extra customers on that day.`)

  const weekend = days.filter(d=>d.target_date && new Date(d.target_date).getDay()>=5)
  if (weekend.length && weekend[0].predicted_demand > days[0].predicted_demand * 1.1) {
    reasons.push(`Weekend days are forecast higher — expect your busiest day on ${peakDay.target_date}.`)
  }

  if (!reasons.length) {
    reasons.push(`Normal week ahead — demand follows your usual pattern. Peak expected on ${peakDay.target_date}.`)
  }

  // Save this week's total for next week's comparison
  saveHistory(dishName, weekTotal)

  return reasons
}

// ── Fix 3: Waste score tooltip content ──────────────────────────────────────
function WasteScoreTooltip({ score }) {
  const [show, setShow] = useState(false)

  const explanation =
    score >= 85 ? "Your demand for this dish is very stable and predictable. Very little over-ordering expected this week." :
    score >= 75 ? "Good confidence. The model has a clear pattern for this dish. Minor over-ordering possible on unpredictable days." :
    score >= 60 ? "Moderate confidence. This dish has some demand variation week to week. Consider a small buffer stock." :
    "Lower confidence. Demand for this dish is irregular. Upload more sales history to improve accuracy."

  const improve =
    score >= 85 ? "Keep uploading sales data weekly to maintain this score." :
    score >= 60 ? "Upload at least 8 weeks of past sales for this dish to improve the score." :
    "Upload 12+ weeks of past sales data. The more history, the more accurate the forecast."

  return (
    <div style={{position:"relative",display:"inline-block"}}>
      <button
        onMouseEnter={()=>setShow(true)}
        onMouseLeave={()=>setShow(false)}
        onClick={()=>setShow(v=>!v)}
        style={{
          background:"rgba(61,220,132,0.1)",border:"1px solid rgba(61,220,132,0.25)",
          borderRadius:"50%",width:20,height:20,cursor:"pointer",
          color:"var(--accent)",fontSize:11,fontWeight:700,
          display:"flex",alignItems:"center",justifyContent:"center",
          flexShrink:0,
        }}>?</button>
      {show && (
        <div style={{
          position:"absolute",right:0,top:28,zIndex:100,
          background:"rgba(11,17,14,0.98)",border:"1px solid var(--border)",
          borderRadius:"var(--radius-sm)",padding:"14px 16px",
          width:280,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <p style={{fontWeight:600,fontSize:13,color:"var(--text)",marginBottom:8}}>
            What does {score?.toFixed(0)}/100 mean?
          </p>
          <p style={{fontSize:12,color:"var(--text2)",lineHeight:1.6,marginBottom:10}}>{explanation}</p>
          <div style={{borderTop:"1px solid var(--border)",paddingTop:10}}>
            <p style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--font-mono)",marginBottom:4}}>HOW TO IMPROVE</p>
            <p style={{fontSize:12,color:"var(--text2)",lineHeight:1.6}}>{improve}</p>
          </div>
          <div style={{borderTop:"1px solid var(--border)",paddingTop:10,marginTop:10}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {[{r:"85-100",l:"Excellent",c:"var(--accent)"},{r:"75-84",l:"Good",c:"var(--blue)"},{r:"60-74",l:"Fair",c:"var(--amber)"},{r:"0-59",l:"Low",c:"var(--red)"}].map(s=>(
                <div key={s.r} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:s.c}}/>
                  <p style={{fontSize:9,color:"var(--text3)",fontFamily:"var(--font-mono)",textAlign:"center",lineHeight:1.3}}>{s.l}<br/>{s.r}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ selectedDish, setSelectedDish, uploadedDishes }) {
  const [sampleDishes, setSampleDishes] = useState([])
  const [dish,         setDish]         = useState(null)
  const [forecast,     setForecast]     = useState(null)
  const [allForecasts, setAllForecasts] = useState([])
  const [loading,      setLoading]      = useState(false)
  const [loadingAll,   setLoadingAll]   = useState(false)
  const [loadingMsg,   setLoadingMsg]   = useState("")
  const [error,        setError]        = useState(null)
  const [activeDay,    setActiveDay]    = useState(0)
  const [view,         setView]         = useState("home")
  const [explanation,  setExplanation]  = useState(null)

  const allDishes = uploadedDishes?.length > 0 ? uploadedDishes : sampleDishes

  useEffect(()=>{ getSampleDishes().then(setSampleDishes).catch(()=>{}) },[])

  useEffect(()=>{
    if (selectedDish) { setDish(selectedDish); runForecast(selectedDish) }
  },[selectedDish])

  async function runForecast(d = dish) {
    if (!d) return
    setLoading(true); setError(null); setForecast(null)
    setActiveDay(0); setView("single"); setExplanation(null)
    try {
      const result = await getForecast({
        dish_name:      d.dish_name,
        category:       d.category      || "Rice Bowl",
        cuisine:        d.cuisine       || "Sri Lankan",
        checkout_price: d.checkout_price|| 450,
        base_price:     d.base_price    || 500,
        cost_per_unit:  d.cost_per_unit || 180,
        recent_orders:  d.recent_orders || [150,160,145,170,155,165,158,162],
        current_stock:  d.current_stock || 0,
        custom_events:  d.special_days  || {},
      })
      setForecast(result)
      // Fix 2: Generate explanation
      setExplanation(getForecastExplanation(result, d.dish_name))
    } catch(e) {
      setError("Could not reach the API. Make sure the backend is running at localhost:8000.")
    } finally { setLoading(false) }
  }

  async function runAllDishes() {
    if (!allDishes.length) return
    setLoadingAll(true); setAllForecasts([])
    setView("all"); setForecast(null)
    setLoadingMsg(`Forecasting ${allDishes.length} dishes in parallel…`)

    // Fix 1: All in parallel — not sequential
    const results = await Promise.all(
      allDishes.map(async (d) => {
        try {
          const r = await getForecast({
            dish_name:      d.dish_name,
            category:       d.category      || "Rice Bowl",
            cuisine:        d.cuisine       || "Sri Lankan",
            checkout_price: d.checkout_price|| 450,
            base_price:     d.base_price    || 500,
            cost_per_unit:  d.cost_per_unit || 180,
            recent_orders:  d.recent_orders || [150,160,145,170,155,165,158,162],
            current_stock:  0,
          })
          return { dish: d, forecast: r }
        } catch { return null }
      })
    )
    setAllForecasts(results.filter(Boolean))
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
        return `${r.dish.dish_name.padEnd(25)} → Prepare: ${String(t?.units_to_prepare?.toFixed(0)||0).padStart(4)} units   (predicted: ${t?.predicted_demand?.toFixed(0)||0})`
      }),
      ``,
      `═══════════════════════════════════════`,
      `7-DAY FORECAST PER DISH`,
      `═══════════════════════════════════════`,
      ...allForecasts.map(r=>[
        ``,`${r.dish.dish_name}`,
        `Weekly savings: LKR ${r.forecast?.total_savings_lkr?.toLocaleString()}   Waste score: ${r.forecast?.avg_waste_score?.toFixed(0)}/100`,
        ...r.forecast?.forecast?.map(d=>`  ${d.target_date}   Prepare ${String(d.units_to_prepare?.toFixed(0)).padStart(4)} units`),
      ]).flat(),
      ``,`═══════════════════════════════════════`,`SUMMARY`,
      `Total units tomorrow: ${allForecasts.reduce((s,r)=>s+(r.forecast?.forecast?.[0]?.units_to_prepare||0),0).toFixed(0)}`,
      `Total weekly savings: LKR ${allForecasts.reduce((s,r)=>s+(r.forecast?.total_savings_lkr||0),0).toLocaleString()}`,
    ]
    const blob = new Blob([lines.join("\n")],{type:"text/plain"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href=url; a.download=`forqast-kitchen-plan-${new Date().toISOString().split("T")[0]}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  function whatsappAll() {
    if (!allForecasts.length) return
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1)
    const dateStr  = tomorrow.toLocaleDateString("en-LK",{weekday:"short",month:"short",day:"numeric"})
    const lines = [
      `*Forqast Kitchen Plan — ${dateStr}*`,``,`*Tomorrow's prep list:*`,
      ...allForecasts.map(r=>{
        const t = r.forecast?.forecast?.[0]
        return `• ${r.dish.dish_name}: *${t?.units_to_prepare?.toFixed(0)} units*`
      }),``,
      `Total: *${allForecasts.reduce((s,r)=>s+(r.forecast?.forecast?.[0]?.units_to_prepare||0),0).toFixed(0)} units*`,
      `Est. weekly savings: *LKR ${allForecasts.reduce((s,r)=>s+(r.forecast?.total_savings_lkr||0),0).toLocaleString()}*`,
      `_Forqast AI Forecast_`,
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank")
  }

  function whatsappSingle() {
    if (!forecast) return
    const t = forecast.forecast?.[0]
    const lines = [
      `*Forqast — ${dish?.dish_name}*`,``,
      `*Tomorrow (${t?.target_date})*`,
      `Prepare: *${t?.units_to_prepare?.toFixed(0)} units*`,
      `Order now: ${t?.units_to_order?.toFixed(0)} units`,``,
      `*7-day plan:*`,
      ...forecast.forecast.map(d=>`• ${d.target_date}: ${d.units_to_prepare?.toFixed(0)} units`),``,
      `Weekly savings: *LKR ${forecast.total_savings_lkr?.toLocaleString()}*`,
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank")
  }

  function exportSingle() {
    if (!forecast) return
    const t = forecast.forecast?.[0]
    const lines = [
      `FORQAST — ${dish?.dish_name}`,`Generated: ${new Date().toLocaleString("en-LK")}`,``,
      `TOMORROW (${t?.target_date})`,
      `  Prepare : ${t?.units_to_prepare?.toFixed(0)} units`,
      `  Order   : ${t?.units_to_order?.toFixed(0)} units`,``,
      `7-DAY PLAN`,
      ...forecast.forecast.map(d=>`  ${d.target_date}  Prepare ${d.units_to_prepare?.toFixed(0)} units`),``,
      `Weekly savings : LKR ${forecast.total_savings_lkr?.toLocaleString()}`,
      `Waste score    : ${forecast.avg_waste_score?.toFixed(0)}/100`,
      ...(explanation||[]).map(e=>`Note: ${e}`),
    ]
    const blob = new Blob([lines.join("\n")],{type:"text/plain"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href=url; a.download=`forqast-${dish?.dish_name?.replace(/\s+/g,"-")}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  function selectDish(d) { setDish(d); setForecast(null); setSelectedDish(null); setExplanation(null) }
  const today        = forecast?.forecast?.[activeDay]
  const totalSavings = allForecasts.reduce((s,r)=>s+(r.forecast?.total_savings_lkr||0),0)
  const totalUnits   = allForecasts.reduce((s,r)=>s+(r.forecast?.forecast?.[0]?.units_to_prepare||0),0)

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>

      {/* Header card */}
      <div className="card" style={{padding:"24px 28px"}}>
        <p style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text3)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>{getDate()}</p>
        <h1 className="page-title" style={{fontSize:24,marginBottom:6}}>
          {getGreeting()}. {view==="all"?"Full kitchen plan" : view==="single"&&dish?`Forecast for ${dish.dish_name}` : "What should you cook tomorrow?"}
        </h1>
        <p style={{color:"var(--text2)",fontSize:14,marginBottom:20,lineHeight:1.6,maxWidth:580}}>
          {view==="home"
            ? "Forqast checks Poya days, monsoons, holidays, and your restaurant's actual sales history to tell you exactly how much to prepare."
            : view==="all"
            ? `Showing forecasts for all ${allForecasts.length||allDishes.length} dishes — all run in parallel.`
            : `7-day demand forecast with Sri Lankan context alerts.`
          }
        </p>

        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
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
            {loadingAll?`Forecasting all ${allDishes.length} dishes…`:`Plan All ${allDishes.length} Dishes`}
          </button>

          {view==="all" && allForecasts.length>0 && <>
            <button className="btn btn-ghost" onClick={exportAll}>↓ Download Report</button>
            <button onClick={whatsappAll} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:"var(--radius-sm)",border:"1px solid rgba(37,211,102,0.4)",background:"rgba(37,211,102,0.08)",color:"#4cd964",fontSize:14,cursor:"pointer",fontFamily:"var(--font-body)"}}>📱 WhatsApp All</button>
          </>}
          {view==="single" && forecast && <>
            <button className="btn btn-ghost" onClick={exportSingle}>↓ Export</button>
            <button onClick={whatsappSingle} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:"var(--radius-sm)",border:"1px solid rgba(37,211,102,0.4)",background:"rgba(37,211,102,0.08)",color:"#4cd964",fontSize:14,cursor:"pointer",fontFamily:"var(--font-body)"}}>📱 WhatsApp</button>
          </>}
          {(view==="single"||view==="all") && (
            <button className="btn btn-ghost" onClick={()=>{setView("home");setForecast(null);setAllForecasts([]);setExplanation(null)}}>← Back</button>
          )}
        </div>
        {uploadedDishes?.length>0 && (
          <p style={{marginTop:10,fontSize:12,color:"var(--accent)",fontFamily:"var(--font-mono)"}}>✓ Using your uploaded menu — {uploadedDishes.length} dishes with real sales data</p>
        )}
      </div>

      {/* Loading */}
      {(loading||loadingAll) && (
        <div className="loading-wrap">
          <div className="spinner"/>
          <span>{loadingAll ? loadingMsg : "Checking Poya days, monsoon, your sales history…"}</span>
          {loadingAll && <p style={{fontSize:12,color:"var(--text3)",fontFamily:"var(--font-mono)"}}>All dishes run simultaneously — should take just a few seconds</p>}
        </div>
      )}

      {error && (
        <div style={{background:"var(--red-dim)",border:"1px solid rgba(255,107,107,0.3)",color:"var(--red)",padding:"14px 20px",borderRadius:"var(--radius-sm)"}}>⚠ {error}</div>
      )}

      {/* Home quick picks */}
      {view==="home" && !loading && (
        <div className="card">
          <p className="section-title">Quick forecast</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {allDishes.map(d=>(
              <button key={d.dish_name}
                onClick={()=>{selectDish(d);setTimeout(()=>runForecast(d),50)}}
                style={{background:"rgba(28,43,34,0.6)",border:"1px solid var(--border)",color:"var(--text2)",padding:"9px 18px",borderRadius:"var(--radius-sm)",fontSize:13,cursor:"pointer",transition:"all 0.15s",fontFamily:"var(--font-body)"}}
                onMouseEnter={e=>{e.target.style.color="var(--accent)";e.target.style.borderColor="var(--accent)"}}
                onMouseLeave={e=>{e.target.style.color="var(--text2)";e.target.style.borderColor="var(--border)"}}>
                {d.dish_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ ALL DISHES ══ */}
      {view==="all" && !loadingAll && allForecasts.length>0 && (
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[
              {label:"Total units to prepare tomorrow",value:Math.round(totalUnits).toLocaleString(),unit:"units across all dishes",color:"var(--accent)"},
              {label:"Dishes forecasted",value:allForecasts.length,unit:"run in parallel",color:"var(--text)"},
              {label:"Total estimated weekly savings",value:`LKR ${Math.round(totalSavings).toLocaleString()}`,unit:"from smarter ordering",color:"var(--accent)"},
            ].map(s=>(
              <div key={s.label} className="card" style={{padding:"20px 24px"}}>
                <p className="label" style={{marginBottom:8}}>{s.label}</p>
                <p style={{fontFamily:"var(--font-display)",fontSize:26,fontWeight:800,color:s.color,lineHeight:1}}>{s.value}</p>
                <p style={{fontSize:12,color:"var(--text3)",marginTop:4}}>{s.unit}</p>
              </div>
            ))}
          </div>

          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1px solid var(--border)"}}>
                  {["Dish","Prepare Tomorrow","This Week Total","Waste Score","Weekly Savings","Alerts"].map(h=>(
                    <th key={h} style={{padding:"14px 18px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text3)",fontWeight:400,background:"rgba(17,26,22,0.6)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allForecasts.map(r=>{
                  const t      = r.forecast?.forecast?.[0]
                  const wTotal = r.forecast?.forecast?.reduce((s,d)=>s+d.predicted_demand,0)
                  const alerts = t?.alerts?.length||0
                  const score  = r.forecast?.avg_waste_score||0
                  return (
                    <tr key={r.dish.dish_name}
                      style={{borderBottom:"1px solid rgba(46,64,53,0.5)",cursor:"pointer",transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(28,43,34,0.4)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                      onClick={()=>{selectDish(r.dish);setForecast(r.forecast);setView("single");setExplanation(getForecastExplanation(r.forecast,r.dish.dish_name))}}>
                      <td style={{padding:"14px 18px",fontWeight:600,color:"var(--text)",fontSize:14}}>{r.dish.dish_name}</td>
                      <td style={{padding:"14px 18px"}}>
                        <span style={{fontFamily:"var(--font-display)",fontSize:20,fontWeight:800,color:"var(--accent)"}}>{t?.units_to_prepare?.toFixed(0)}</span>
                        <span style={{color:"var(--text3)",fontSize:11,marginLeft:5}}>units</span>
                      </td>
                      <td style={{padding:"14px 18px",color:"var(--text2)"}}>{wTotal?.toFixed(0)} units</td>
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

      {/* ══ SINGLE DISH ══ */}
      {view==="single" && forecast && !loading && (
        <>
          {/* Fix 2: Forecast explanation */}
          {explanation?.length>0 && (
            <div className="card" style={{background:"rgba(17,26,22,0.75)",borderLeft:"3px solid var(--accent)",padding:"16px 20px"}}>
              <p style={{fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--text3)",marginBottom:8}}>Why this forecast</p>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {explanation.map((e,i)=>(
                  <p key={i} style={{fontSize:13,color:"var(--text2)",lineHeight:1.6}}>
                    <span style={{color:"var(--accent)",marginRight:8}}>→</span>{e}
                  </p>
                ))}
              </div>
            </div>
          )}

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
              {/* Fix 3: Waste gauge with tooltip */}
              <div className="card" style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <p className="section-title" style={{marginBottom:0}}>Waste Reduction Score</p>
                  <WasteScoreTooltip score={forecast.avg_waste_score}/>
                </div>
                <WasteGauge score={forecast.avg_waste_score}/>
              </div>

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