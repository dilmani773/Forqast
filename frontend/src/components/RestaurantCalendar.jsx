import { useState } from "react"
import { uploadSales } from "../api/client"

const SPECIAL_DAY_TYPES = [
  { value:"eid",       label:"Eid ul-Fitr",           boost:0.5,  icon:"🌙", desc:"End of Ramadan — very high demand all day" },
  { value:"eid_adha",  label:"Eid ul-Adha",            boost:0.5,  icon:"🌙", desc:"Feast of Sacrifice — big family gatherings" },
  { value:"deepavali", label:"Deepavali",              boost:0.4,  icon:"🪔", desc:"Festival of Lights — sweets and family dining" },
  { value:"milad",     label:"Milad un-Nabi",          boost:0.3,  icon:"🌙", desc:"Prophet's Birthday — community events" },
  { value:"avurudu",   label:"Avurudu / Sinhala New Year", boost:0.4, icon:"🎉", desc:"New Year season — one of the busiest periods" },
  { value:"pongal",    label:"Thai Pongal",            boost:0.35, icon:"🌾", desc:"Tamil harvest festival — family meals" },
  { value:"promotion", label:"Special Promotion / Offer", boost:0.35, icon:"🏷️", desc:"Discount or special offer day" },
  { value:"wedding",   label:"Wedding / Event Catering", boost:0.8, icon:"💐", desc:"Private event — large order expected" },
  { value:"school",    label:"School Event Nearby",    boost:0.3,  icon:"🏫", desc:"School prize giving / sports — family lunch rush" },
  { value:"custom",    label:"Other Special Day",      boost:0.3,  icon:"⭐", desc:"Mark any important day for your restaurant" },
]

export default function RestaurantCalendar({ onCalendarUpdate }) {
  const [ramadanStart,   setRamadanStart]   = useState("")
  const [ramadanActive,  setRamadanActive]  = useState(false)
  const [specialDays,    setSpecialDays]    = useState([])
  const [newDay,         setNewDay]         = useState({ date:"", type:"eid", customLabel:"" })
  const [uploadingFor,   setUploadingFor]   = useState(null) // which special day we're uploading for
  const [uploadResults,  setUploadResults]  = useState({}) // date → upload result
  const [ramadanUpload,  setRamadanUpload]  = useState(null)

  function addSpecialDay() {
    if (!newDay.date) return
    const typeInfo = SPECIAL_DAY_TYPES.find(t => t.value === newDay.type)
    const entry = {
      date:  newDay.date,
      label: newDay.customLabel.trim() || typeInfo?.label || "Special Day",
      boost: typeInfo?.boost || 0.3,
      icon:  typeInfo?.icon || "⭐",
      type:  newDay.type,
    }
    const updated = [...specialDays.filter(d => d.date !== newDay.date), entry]
      .sort((a,b) => a.date.localeCompare(b.date))
    setSpecialDays(updated)
    setNewDay({ date:"", type:"eid", customLabel:"" })
    fireUpdate(updated, ramadanActive ? ramadanStart : null)
  }

  function removeDay(date) {
    const updated = specialDays.filter(d => d.date !== date)
    setSpecialDays(updated)
    const newResults = { ...uploadResults }
    delete newResults[date]
    setUploadResults(newResults)
    fireUpdate(updated, ramadanActive ? ramadanStart : null)
  }

  function handleRamadanToggle(checked) {
    setRamadanActive(checked)
    fireUpdate(specialDays, checked ? ramadanStart : null)
  }

  function handleRamadanDate(date) {
    setRamadanStart(date)
    if (ramadanActive) fireUpdate(specialDays, date)
  }

  async function handleEventUpload(e, date) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingFor(date)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("http://localhost:8000/api/upload-sales", { method:"POST", body:form })
      const data = await res.json()
      setUploadResults(prev => ({ ...prev, [date]: data }))
    } catch (err) {
      console.error("Upload failed", err)
    } finally { setUploadingFor(null) }
  }

  async function handleRamadanUpload(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingFor("ramadan")
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("http://localhost:8000/api/upload-sales", { method:"POST", body:form })
      const data = await res.json()
      setRamadanUpload(data)
    } catch (err) { console.error(err) }
    finally { setUploadingFor(null) }
  }

  function fireUpdate(days, ramadan) {
    if (onCalendarUpdate) {
      const specialObj = {}
      days.forEach(d => { specialObj[d.date] = { label:d.label, boost:d.boost } })
      onCalendarUpdate({ special_days:specialObj, ramadan_start:ramadan||null })
    }
  }

  const typeInfo = SPECIAL_DAY_TYPES.find(t => t.value === newDay.type)

  return (
    <div className="card" style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div>
        <p className="section-title">Your Restaurant Calendar</p>
        <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.6 }}>
          Mark your important days. Every Sri Lankan restaurant is different —
          your Eid, your Deepavali, your promotions. You know your customers.
          Forqast learns from your calendar.
        </p>
      </div>

      {/* ── Ramadan Section ── */}
      <div style={{ background:"rgba(61,220,132,0.04)", border:"1px solid rgba(61,220,132,0.15)", borderRadius:"var(--radius-sm)", padding:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: ramadanActive ? 16 : 0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:22 }}>🌙</span>
            <div>
              <p style={{ fontWeight:600, fontSize:14, color:"var(--text)" }}>Ramadan Mode</p>
              <p style={{ fontSize:12, color:"var(--text2)", marginTop:2 }}>
                For Muslim restaurants — marks the full 30-day fasting period with adjusted demand patterns
              </p>
            </div>
          </div>
          {/* Toggle */}
          <div onClick={() => handleRamadanToggle(!ramadanActive)} style={{ cursor:"pointer" }}>
            <div style={{
              width:44, height:24, borderRadius:99,
              background: ramadanActive ? "var(--accent)" : "var(--border)",
              position:"relative", transition:"background 0.2s",
            }}>
              <div style={{
                width:18, height:18, borderRadius:50, background:"white",
                position:"absolute", top:3,
                left: ramadanActive ? 23 : 3,
                transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.3)",
              }}/>
            </div>
          </div>
        </div>

        {ramadanActive && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label className="label">When does Ramadan start this year?</label>
                <input type="date" className="input" value={ramadanStart} onChange={e=>handleRamadanDate(e.target.value)}/>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label className="label">Upload last year's Ramadan sales (optional)</label>
                <label style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"9px", background:"var(--surface)", border:"1px dashed var(--border)", borderRadius:"var(--radius-sm)", color:"var(--text2)", fontSize:12, cursor:"pointer" }}>
                  {uploadingFor==="ramadan" ? "Reading…" : ramadanUpload ? `✓ ${ramadanUpload.rows_processed} rows` : "Choose CSV"}
                  <input type="file" accept=".csv" onChange={handleRamadanUpload} hidden/>
                </label>
              </div>
            </div>

            {ramadanStart && (
              <div style={{ background:"rgba(61,220,132,0.08)", border:"1px solid rgba(61,220,132,0.2)", borderRadius:"var(--radius-sm)", padding:"12px 14px", fontSize:12 }}>
                <p style={{ color:"var(--accent)", fontWeight:500, marginBottom:4 }}>
                  🌙 Ramadan: {ramadanStart} → {
                    new Date(new Date(ramadanStart).getTime()+29*24*60*60*1000).toISOString().split("T")[0]
                  } (30 days)
                </p>
                <p style={{ color:"var(--text2)", lineHeight:1.6 }}>
                  Forqast will reduce lunch demand forecasts and increase evening (Iftar) demand during this period.
                  The last 10 days get an extra boost for the Eid preparation rush.
                </p>
                {ramadanUpload && (
                  <p style={{ color:"var(--accent)", marginTop:8 }}>
                    ✓ Last year's Ramadan data loaded — {ramadanUpload.rows_processed} records across {ramadanUpload.dishes_found?.length} dishes. Forqast will use this to personalise your Ramadan forecast.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Special Day ── */}
      <div>
        <p style={{ fontWeight:600, fontSize:14, marginBottom:12, color:"var(--text)" }}>Add a Special Day</p>
        <div style={{ display:"grid", gridTemplateColumns:"150px 1fr 1fr auto", gap:10, alignItems:"end" }}>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <label className="label">Date</label>
            <input type="date" className="input" value={newDay.date} onChange={e=>setNewDay(d=>({...d,date:e.target.value}))}/>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <label className="label">What kind of day?</label>
            <select className="input" value={newDay.type} onChange={e=>{
              setNewDay(d=>({...d,type:e.target.value,customLabel:""}))
            }}>
              {SPECIAL_DAY_TYPES.map(t=>(
                <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <label className="label">Your name for this day (optional)</label>
            <input className="input" placeholder={typeInfo?.label}
              value={newDay.customLabel} onChange={e=>setNewDay(d=>({...d,customLabel:e.target.value}))}/>
          </div>
          <button className="btn btn-primary" onClick={addSpecialDay} style={{ height:42 }}>+ Add</button>
        </div>
        {typeInfo && (
          <p style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", marginTop:8 }}>
            {typeInfo.icon} {typeInfo.desc}
          </p>
        )}
      </div>

      {/* ── Special Days List ── */}
      {specialDays.length > 0 && (
        <div>
          <p style={{ fontWeight:600, fontSize:14, marginBottom:10, color:"var(--text)" }}>Your Special Days</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {specialDays.map(d => (
              <div key={d.date} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:"14px 16px" }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom: uploadResults[d.date] ? 10 : 0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:20 }}>{d.icon}</span>
                    <div>
                      <p style={{ fontSize:14, fontWeight:500, color:"var(--text)" }}>{d.label}</p>
                      <p style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", marginTop:2 }}>
                        {d.date} · Expect more customers than usual
                      </p>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {/* Upload for this specific event */}
                    <label style={{
                      display:"flex", alignItems:"center", gap:5,
                      padding:"5px 10px", background:"var(--bg2)", border:"1px dashed var(--border)",
                      borderRadius:"var(--radius-sm)", color:"var(--text3)", fontSize:11, cursor:"pointer",
                    }}>
                      {uploadingFor===d.date ? "Reading…" :
                       uploadResults[d.date] ? `✓ ${uploadResults[d.date].rows_processed} rows` :
                       "Upload last year's sales"}
                      <input type="file" accept=".csv" onChange={e=>handleEventUpload(e,d.date)} hidden/>
                    </label>
                    <button onClick={()=>removeDay(d.date)} style={{ background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:18, padding:"2px 6px" }}>×</button>
                  </div>
                </div>
                {uploadResults[d.date] && (
                  <div style={{ background:"rgba(61,220,132,0.06)", border:"1px solid rgba(61,220,132,0.15)", borderRadius:6, padding:"8px 12px", fontSize:12, color:"var(--accent)" }}>
                    ✓ {uploadResults[d.date].rows_processed} sales records loaded for {d.label}.
                    Dishes: {uploadResults[d.date].dishes_found?.join(", ")}.
                    Forqast will use this data to personalise your {d.label} forecast.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {specialDays.length===0 && !ramadanActive && (
        <p style={{ fontSize:13, color:"var(--text3)", textAlign:"center", padding:"16px 0", fontStyle:"italic" }}>
          No special days added yet. Every restaurant has days that matter more than others — mark them here.
        </p>
      )}
    </div>
  )
}