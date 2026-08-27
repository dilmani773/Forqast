import { useState, useEffect } from "react"
import { uploadSales } from "../api/client"
import RestaurantCalendar from "../components/RestaurantCalendar"

const STORAGE_KEY = "forqast_v3"
function save(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({...data, savedAt: new Date().toISOString()})) } catch {} }
function load() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null } catch { return null } }

const DEFAULT_CATEGORIES = ["Rice Bowl","Kottu","Hoppers","String Hoppers","Roti","Devilled","Seafood","Biryani","Soup","Sandwich","Pasta","Pizza","Desserts","Beverages","Short Eats","Salad","Starter"]
const DEFAULT_CUISINES   = ["Sri Lankan","South Indian","Tamil","Muslim / Arabic","Thai","Chinese","Continental","Italian","Fusion","Malay","Mediterranean"]
const EMPTY = { dish_name:"", category:"Rice Bowl", cuisine:"Sri Lankan", checkout_price:"", base_price:"", cost_per_unit:"", current_stock:"0" }

// Unit definition examples shown to owner
const UNIT_EXAMPLES = [
  {label:"1 plate",    desc:"Standard restaurant plate"},
  {label:"1 portion",  desc:"A single serving"},
  {label:"500g",       desc:"Half a kilogram"},
  {label:"1 kg",       desc:"One kilogram"},
  {label:"1 bowl",     desc:"A single bowl"},
  {label:"1 cup",      desc:"A standard cup"},
  {label:"Custom",     desc:"Type your own definition"},
]

export default function MenuSetup({ onForecast, onDishesUploaded, uploadedDishes }) {
  const saved = load()

  const [dish,         setDish]         = useState(saved?.dish        || EMPTY)
  const [unitDef,      setUnitDef]      = useState(saved?.unitDef     || "1 plate")
  const [customUnit,   setCustomUnit]   = useState(saved?.customUnit  || "")
  const [customCat,    setCustomCat]    = useState("")
  const [customCui,    setCustomCui]    = useState("")
  const [categories,   setCategories]   = useState(saved?.categories  || DEFAULT_CATEGORIES)
  const [cuisines,     setCuisines]     = useState(saved?.cuisines    || DEFAULT_CUISINES)
  const [uploading,    setUploading]    = useState(false)
  const [uploadRes,    setUploadRes]    = useState(saved?.uploadRes   || null)
  const [error,        setError]        = useState(null)
  const [calendarData, setCalendarData] = useState(saved?.calendarData|| { special_days:{}, ramadan_start:null })
  const [tab,          setTab]          = useState("bulk")
  const [prices,       setPrices]       = useState(saved?.prices      || {})
  const [showPrices,   setShowPrices]   = useState(false)
  const [savedAt,      setSavedAt]      = useState(saved?.savedAt     || null)
  const [soldOut,      setSoldOut]      = useState(saved?.soldOut     || {}) // {date: [dishName]}

  // #1 — Save with timestamp, show confirmation
  function persist(updates) {
    const newState = { dish, unitDef, customUnit, categories, cuisines, uploadRes, calendarData, prices, soldOut, ...updates }
    save(newState)
    setSavedAt(new Date().toISOString())
  }

  useEffect(() => { persist({}) }, [dish, unitDef, customUnit, categories, cuisines, uploadRes, calendarData, prices, soldOut])

  useEffect(() => {
    if (saved?.uploadRes?.dishes_found?.length) {
      pushDishes(saved.uploadRes, saved.prices || {})
    }
  }, [])

  const upd = (k,v) => setDish(d=>({...d,[k]:v}))

  const effectiveUnit = unitDef === "Custom" ? customUnit : unitDef

  function addCategory() {
    if (!customCat.trim()) return
    setCategories(c=>[...c,customCat.trim()]); upd("category",customCat.trim()); setCustomCat("")
  }
  function addCuisine() {
    if (!customCui.trim()) return
    setCuisines(c=>[...c,customCui.trim()]); upd("cuisine",customCui.trim()); setCustomCui("")
  }
  function clearAll() {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    setDish(EMPTY); setCategories(DEFAULT_CATEGORIES); setCuisines(DEFAULT_CUISINES)
    setUploadRes(null); setPrices({}); setCalendarData({ special_days:{}, ramadan_start:null })
    setSoldOut({}); setSavedAt(null)
    if (onDishesUploaded) onDishesUploaded([])
  }

  function pushDishes(res, priceMap) {
    if (!res?.dishes_found?.length || !onDishesUploaded) return
    const built = res.dishes_found.map(name => {
      const p    = priceMap[name] || {}
      const sell = parseFloat(p.checkout_price) || 450
      const cost = parseFloat(p.cost_per_unit)  || sell * 0.4
      const lags = res.dish_histories?.[name]   || [150,160,145,170,155,165,158,162]
      return {
        dish_name:      name,
        category:       "Rice Bowl",
        cuisine:        "Sri Lankan",
        checkout_price: sell,
        base_price:     sell * 1.1,
        cost_per_unit:  cost,
        recent_orders:  lags,
        current_stock:  0,
        special_days:   calendarData.special_days,
        unit_definition: effectiveUnit,
      }
    })
    onDishesUploaded(built)
  }

  function updatePrice(name, field, value) {
    const updated = { ...prices, [name]: { ...(prices[name]||{}), [field]: value } }
    setPrices(updated)
    if (uploadRes) pushDishes(uploadRes, updated)
  }

  function handleForecast() {
    if (!dish.dish_name || !dish.checkout_price) { setError("Please fill in dish name and selling price."); return }
    setError(null)
    onForecast({
      ...dish,
      checkout_price:  parseFloat(dish.checkout_price),
      base_price:      parseFloat(dish.base_price) || parseFloat(dish.checkout_price)*1.1,
      cost_per_unit:   parseFloat(dish.cost_per_unit) || parseFloat(dish.checkout_price)*0.4,
      current_stock:   parseFloat(dish.current_stock) || 0,
      recent_orders:   [150,160,145,170,155,165,158,162],
      special_days:    calendarData.special_days,
      unit_definition: effectiveUnit,
    })
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setError(null)
    try {
      const res = await uploadSales(file)
      setUploadRes(res)
      const init = { ...prices }
      res.dishes_found.forEach(name => { if (!init[name]) init[name] = { checkout_price:"", cost_per_unit:"" } })
      setPrices(init)
      setShowPrices(true)
      pushDishes(res, init)
    } catch(err) {
      setError("Upload failed: "+(err.response?.data?.detail||err.message))
    } finally { setUploading(false) }
  }

  function downloadTemplate() {
    const csv = `date,dish_name,units_sold\n2026-01-01,Rice & Curry,85\n2026-01-02,Rice & Curry,92\n2026-01-03,Chicken Kottu,45\n2026-01-03,Rice & Curry,78\n2026-01-04,Chicken Kottu,52`
    const blob = new Blob([csv],{type:"text/csv"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href=url; a.download="forqast_template.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  // #6 — Sold out log
  function toggleSoldOut(dishName) {
    const today = new Date().toISOString().split("T")[0]
    const current = soldOut[today] || []
    const updated = current.includes(dishName)
      ? { ...soldOut, [today]: current.filter(d=>d!==dishName) }
      : { ...soldOut, [today]: [...current, dishName] }
    setSoldOut(updated)
  }
  const todaySoldOut = soldOut[new Date().toISOString().split("T")[0]] || []

  function formatSavedAt(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleTimeString("en-LK",{hour:"2-digit",minute:"2-digit"})
  }

  const tabStyle = t => ({
    padding:"10px 18px", borderRadius:"var(--radius-sm)", cursor:"pointer",
    border: tab===t ? "1px solid rgba(61,220,132,0.4)" : "1px solid transparent",
    fontFamily:"var(--font-body)", fontSize:13,
    background: tab===t ? "var(--accent-dim)" : "rgba(28,43,34,0.5)",
    color: tab===t ? "var(--accent)" : "var(--text2)",
    fontWeight: tab===t ? 600 : 400, transition:"all 0.15s",
  })

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>

      {/* Header */}
      <div className="card" style={{padding:"20px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <h1 className="page-title" style={{fontSize:22,marginBottom:4}}>Menu Setup</h1>
          <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.5,maxWidth:520}}>
            Upload your sales history. Forqast learns your actual demand patterns — Poya days, monsoons, your best and worst weeks.
          </p>
        </div>
        {/* #1 — Save confirmation */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          {savedAt && (
            <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(61,220,132,0.08)",border:"1px solid rgba(61,220,132,0.2)",borderRadius:99,padding:"5px 12px"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)"}}/>
              <span style={{fontSize:12,color:"var(--accent)",fontFamily:"var(--font-mono)"}}>
                Saved at {formatSavedAt(savedAt)}
              </span>
            </div>
          )}
          {load() && (
            <button onClick={clearAll} style={{background:"none",border:"none",color:"var(--text3)",fontSize:11,cursor:"pointer",fontFamily:"var(--font-mono)"}}>
              Clear all & start over
            </button>
          )}
        </div>
      </div>

      {/* #2 — Unit definition — always visible at top */}
      <div className="card" style={{padding:"18px 24px"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:20,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:280}}>
            <p style={{fontWeight:600,fontSize:14,color:"var(--text)",marginBottom:4}}>What does "1 unit" mean in your kitchen?</p>
            <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5,marginBottom:12}}>
              Forqast forecasts in units. Tell us what a unit means so the numbers make sense to you and your kitchen staff.
            </p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
              {UNIT_EXAMPLES.map(u=>(
                <button key={u.label} onClick={()=>setUnitDef(u.label)} style={{
                  padding:"7px 14px",borderRadius:99,fontSize:12,cursor:"pointer",
                  border:`1px solid ${unitDef===u.label?"var(--accent)":"var(--border)"}`,
                  background: unitDef===u.label?"var(--accent-dim)":"rgba(28,43,34,0.5)",
                  color: unitDef===u.label?"var(--accent)":"var(--text2)",
                  fontFamily:"var(--font-body)", transition:"all 0.15s",
                }}>{u.label}</button>
              ))}
            </div>
            {unitDef==="Custom" && (
              <input className="input" style={{maxWidth:300}} placeholder="e.g. 250g portion, 1 family rice packet..."
                value={customUnit} onChange={e=>setCustomUnit(e.target.value)}/>
            )}
          </div>
          <div style={{background:"rgba(61,220,132,0.06)",border:"1px solid rgba(61,220,132,0.15)",borderRadius:"var(--radius-sm)",padding:"14px 18px",minWidth:220}}>
            <p style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Currently set to</p>
            <p style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:800,color:"var(--accent)",lineHeight:1,marginBottom:4}}>{effectiveUnit||"Not set"}</p>
            <p style={{fontSize:12,color:"var(--text2)"}}>Forecasts will show as<br/><b style={{color:"var(--text)"}}>142 {effectiveUnit||"units"}</b> instead of just 142</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,background:"rgba(17,26,22,0.9)",padding:6,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",alignSelf:"flex-start",backdropFilter:"blur(8px)",flexWrap:"wrap"}}>
        <button style={tabStyle("bulk")}     onClick={()=>setTab("bulk")}>📂 Upload My Sales</button>
        <button style={tabStyle("single")}   onClick={()=>setTab("single")}>➕ Add Single Dish</button>
        <button style={tabStyle("soldout")}  onClick={()=>setTab("soldout")}>🚫 Today's Sold Out</button>
        <button style={tabStyle("calendar")} onClick={()=>setTab("calendar")}>📅 Special Days</button>
      </div>

      {/* ═══ BULK UPLOAD ═══ */}
      {tab==="bulk" && (
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:20,alignItems:"start"}}>
            <div className="card">
              <p className="section-title">Upload Your Sales Data</p>
              <p style={{fontSize:14,color:"var(--text2)",marginBottom:20,lineHeight:1.6}}>
                Upload a CSV of your past sales. Forqast reads every dish, calculates your actual weekly demand,
                and makes everything available in <b style={{color:"var(--text)"}}>Dashboard → Plan All Dishes</b>.
              </p>

              <div style={{background:"rgba(17,26,22,0.7)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:16,marginBottom:14}}>
                <p className="label" style={{marginBottom:10}}>Your CSV needs 3 columns</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                  {[{col:"date",eg:"2026-01-15"},{col:"dish_name",eg:"Rice & Curry"},{col:"units_sold",eg:"85"}].map(c=>(
                    <div key={c.col} style={{background:"rgba(10,15,13,0.8)",borderRadius:6,padding:"8px 12px"}}>
                      <p style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--accent)",marginBottom:3}}>{c.col}</p>
                      <p style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text3)"}}>e.g. {c.eg}</p>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:12,color:"var(--text3)"}}>"Date", "Product", "Quantity" column names also work. Multiple dishes in one file is fine.</p>
              </div>

              <button className="btn btn-ghost" style={{width:"100%",justifyContent:"center",marginBottom:12}} onClick={downloadTemplate}>↓ Download Sample Template</button>

              <label style={{
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                width:"100%",padding:"28px",background:"rgba(17,26,22,0.5)",
                border:"2px dashed var(--border)",borderRadius:"var(--radius)",
                color:"var(--text2)",cursor:"pointer",gap:8,transition:"all 0.15s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent)";e.currentTarget.style.color="var(--text)"}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text2)"}}>
                <span style={{fontSize:32}}>{uploading?"⏳":"📂"}</span>
                <span style={{fontSize:15,fontWeight:500}}>{uploading?"Reading your file…":"Click to upload your sales CSV"}</span>
                <input type="file" accept=".csv" onChange={handleUpload} hidden/>
              </label>

              {error && <div style={{marginTop:12,background:"var(--red-dim)",border:"1px solid rgba(255,107,107,0.3)",color:"var(--red)",padding:"12px 16px",borderRadius:"var(--radius-sm)",fontSize:13}}>⚠ {error}</div>}

              {uploadRes && (
                <div style={{marginTop:16,background:"rgba(61,220,132,0.06)",border:"1px solid rgba(61,220,132,0.2)",borderRadius:"var(--radius-sm)",padding:18}}>
                  <p style={{color:"var(--accent)",fontWeight:600,fontSize:14,marginBottom:12}}>✓ Upload successful</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                    <div><p className="label" style={{marginBottom:3}}>Records</p><p style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:800,color:"var(--text)"}}>{uploadRes.rows_processed.toLocaleString()}</p></div>
                    <div><p className="label" style={{marginBottom:3}}>Dishes found</p><p style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:800,color:"var(--accent)"}}>{uploadRes.dishes_found.length}</p></div>
                    <div><p className="label" style={{marginBottom:3}}>Date range</p><p style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text2)",marginTop:4,lineHeight:1.6}}>{uploadRes.date_range}</p></div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                    {uploadRes.dishes_found.map(d=>(
                      <span key={d} style={{background:"rgba(28,43,34,0.8)",border:"1px solid var(--border)",color:"var(--text)",padding:"5px 14px",borderRadius:99,fontSize:13}}>{d}</span>
                    ))}
                  </div>
                  <div style={{background:"rgba(61,220,132,0.08)",borderRadius:8,padding:"12px 16px",marginBottom:12}}>
                    <p style={{fontSize:13,color:"var(--accent)",lineHeight:1.6}}>
                      ✓ All {uploadRes.dishes_found.length} dishes ready. Go to <b>Dashboard → Plan All Dishes</b>.
                      Forqast is using your actual weekly sales — not guesses.
                    </p>
                  </div>
                  <button className="btn btn-ghost" style={{width:"100%",justifyContent:"center",fontSize:13}} onClick={()=>setShowPrices(v=>!v)}>
                    {showPrices?"▲ Hide price editor":"▼ Set selling prices for accurate savings estimates"}
                  </button>
                </div>
              )}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div className="card">
                <p className="section-title">How it works</p>
                {[
                  {n:"1",t:"Upload your sales CSV — one file, all your dishes"},
                  {n:"2",t:"Set prices so savings estimates are accurate for your menu"},
                  {n:"3",t:"Go to Dashboard → Plan All Dishes"},
                  {n:"4",t:"Forqast forecasts all dishes using your real demand patterns"},
                  {n:"5",t:"Download kitchen report or send to WhatsApp"},
                ].map(s=>(
                  <div key={s.n} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:12}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent-dim)",border:"1px solid rgba(61,220,132,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--accent)",fontWeight:700}}>{s.n}</span>
                    </div>
                    <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5,paddingTop:2}}>{s.t}</p>
                  </div>
                ))}
              </div>
              {uploadedDishes?.length>0 && (
                <div className="card" style={{background:"linear-gradient(135deg,rgba(61,220,132,0.1) 0%,rgba(11,17,14,0.85) 70%)",border:"1px solid rgba(61,220,132,0.25)"}}>
                  <p className="label" style={{marginBottom:6}}>Ready to forecast</p>
                  <p style={{fontFamily:"var(--font-display)",fontSize:30,fontWeight:800,color:"var(--accent)",lineHeight:1}}>{uploadedDishes.length}</p>
                  <p style={{fontFamily:"var(--font-display)",fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:6}}>dishes loaded</p>
                  <p style={{fontSize:12,color:"var(--text2)"}}>Go to Dashboard → Plan All Dishes</p>
                </div>
              )}
            </div>
          </div>

          {/* Price editor */}
          {uploadRes && showPrices && (
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <p className="section-title" style={{marginBottom:4}}>Set Prices for Each Dish</p>
                  <p style={{fontSize:13,color:"var(--text2)"}}>Leave blank to use defaults. <span style={{color:"var(--accent)"}}>Auto-saved.</span></p>
                </div>
                {savedAt && <span style={{fontSize:12,color:"var(--accent)",fontFamily:"var(--font-mono)"}}>✓ Saved {formatSavedAt(savedAt)}</span>}
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:"1px solid var(--border)"}}>
                    {["Dish","Selling Price (LKR)","Ingredient Cost (LKR)",`Avg Weekly Sales (${effectiveUnit}s)`].map(h=>(
                      <th key={h} style={{padding:"10px 16px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text3)",fontWeight:400,background:"rgba(17,26,22,0.6)",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadRes.dishes_found.map(name=>(
                    <tr key={name} style={{borderBottom:"1px solid rgba(46,64,53,0.5)"}}>
                      <td style={{padding:"12px 16px",fontWeight:600,color:"var(--text)",fontSize:14}}>{name}</td>
                      <td style={{padding:"12px 16px"}}>
                        <input type="number" placeholder="450" value={prices[name]?.checkout_price||""}
                          onChange={e=>updatePrice(name,"checkout_price",e.target.value)}
                          style={{background:"rgba(17,26,22,0.8)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"8px 12px",fontSize:13,width:100,outline:"none"}}/>
                      </td>
                      <td style={{padding:"12px 16px"}}>
                        <input type="number" placeholder="180" value={prices[name]?.cost_per_unit||""}
                          onChange={e=>updatePrice(name,"cost_per_unit",e.target.value)}
                          style={{background:"rgba(17,26,22,0.8)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"8px 12px",fontSize:13,width:100,outline:"none"}}/>
                      </td>
                      <td style={{padding:"12px 16px"}}>
                        <span style={{color:"var(--accent)",fontWeight:600,fontFamily:"var(--font-mono)",fontSize:13}}>
                          {uploadRes.avg_weekly_units?.[name] ? `~${Math.round(uploadRes.avg_weekly_units[name])} ${effectiveUnit}s/week` : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ SINGLE DISH ═══ */}
      {tab==="single" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:20,alignItems:"start"}}>
          <div className="card">
            <p className="section-title">Add a Single Dish</p>
            {error && <div style={{background:"var(--red-dim)",border:"1px solid rgba(255,107,107,0.3)",color:"var(--red)",padding:"12px 16px",borderRadius:"var(--radius-sm)",marginBottom:16,fontSize:13}}>⚠ {error}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              <div style={{gridColumn:"1/-1",display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Dish Name *</label>
                <input className="input" placeholder="e.g. Rice & Curry, Chicken Kottu..." value={dish.dish_name} onChange={e=>upd("dish_name",e.target.value)}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Category</label>
                <select className="input" value={dish.category} onChange={e=>upd("category",e.target.value)}>
                  {categories.map(c=><option key={c}>{c}</option>)}
                </select>
                <div style={{display:"flex",gap:6}}>
                  <input className="input" style={{fontSize:12,padding:"7px 10px"}} placeholder="Type your own..." value={customCat} onChange={e=>setCustomCat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()}/>
                  <button className="btn btn-ghost" style={{padding:"7px 12px",fontSize:12,whiteSpace:"nowrap"}} onClick={addCategory}>+ Add</button>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Cuisine Type</label>
                <select className="input" value={dish.cuisine} onChange={e=>upd("cuisine",e.target.value)}>
                  {cuisines.map(c=><option key={c}>{c}</option>)}
                </select>
                <div style={{display:"flex",gap:6}}>
                  <input className="input" style={{fontSize:12,padding:"7px 10px"}} placeholder="Type your own..." value={customCui} onChange={e=>setCustomCui(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCuisine()}/>
                  <button className="btn btn-ghost" style={{padding:"7px 12px",fontSize:12,whiteSpace:"nowrap"}} onClick={addCuisine}>+ Add</button>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Selling Price (LKR) *</label>
                <input className="input" type="number" placeholder="450" value={dish.checkout_price} onChange={e=>upd("checkout_price",e.target.value)}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Ingredient Cost per {effectiveUnit} (LKR)</label>
                <input className="input" type="number" placeholder="180" value={dish.cost_per_unit} onChange={e=>upd("cost_per_unit",e.target.value)}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Already prepared today ({effectiveUnit}s)</label>
                <input className="input" type="number" placeholder="0" value={dish.current_stock} onChange={e=>upd("current_stock",e.target.value)}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Original / Base Price (LKR)</label>
                <input className="input" type="number" placeholder="500" value={dish.base_price} onChange={e=>upd("base_price",e.target.value)}/>
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleForecast} style={{width:"100%",justifyContent:"center",padding:14,fontSize:15}}>
              Get My 7-Day Forecast →
            </button>
          </div>
          <div className="card">
            <p className="section-title">When to use this</p>
            {[
              "Testing a new dish before adding to your menu",
              "Exact savings estimate for one high-value dish",
              "Applying your Special Days calendar to a specific item",
            ].map((t,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:12}}>
                <span style={{color:"var(--accent)",fontSize:13,flexShrink:0}}>→</span>
                <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5}}>{t}</p>
              </div>
            ))}
            <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)"}}>
              <p style={{fontSize:12,color:"var(--text3)"}}>For your full menu, use <b style={{color:"var(--text2)"}}>Upload My Sales</b> — it's faster and more accurate.</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SOLD OUT LOG — Fix #6 ═══ */}
      {tab==="soldout" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:20,alignItems:"start"}}>
          <div className="card">
            <p className="section-title">Mark Today's Sold Out Dishes</p>
            <p style={{fontSize:13,color:"var(--text2)",marginBottom:20,lineHeight:1.6}}>
              Did you run out of something today? Mark it here. Forqast notes this so it doesn't penalise your
              forecast accuracy for days when you simply ran out — not because demand was low.
            </p>

            <p style={{fontSize:12,color:"var(--text3)",fontFamily:"var(--font-mono)",marginBottom:12}}>
              TODAY — {new Date().toLocaleDateString("en-LK",{weekday:"long",month:"long",day:"numeric"})}
            </p>

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(uploadRes?.dishes_found || (dish.dish_name ? [dish.dish_name] : [])).map(name=>(
                <div key={name} style={{
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"12px 16px",
                  background: todaySoldOut.includes(name) ? "rgba(255,107,107,0.08)" : "rgba(28,43,34,0.4)",
                  border: `1px solid ${todaySoldOut.includes(name) ? "rgba(255,107,107,0.3)" : "var(--border)"}`,
                  borderRadius:"var(--radius-sm)",transition:"all 0.15s",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:16}}>{todaySoldOut.includes(name) ? "🚫" : "✅"}</span>
                    <div>
                      <p style={{fontWeight:600,fontSize:14,color:"var(--text)"}}>{name}</p>
                      <p style={{fontSize:11,color: todaySoldOut.includes(name) ? "var(--red)" : "var(--text3)"}}>
                        {todaySoldOut.includes(name) ? "Marked as sold out today" : "Available today"}
                      </p>
                    </div>
                  </div>
                  <button onClick={()=>toggleSoldOut(name)} style={{
                    padding:"7px 14px",borderRadius:"var(--radius-sm)",fontSize:12,cursor:"pointer",
                    border:`1px solid ${todaySoldOut.includes(name) ? "rgba(255,107,107,0.4)" : "var(--border)"}`,
                    background: todaySoldOut.includes(name) ? "rgba(255,107,107,0.1)" : "rgba(28,43,34,0.6)",
                    color: todaySoldOut.includes(name) ? "var(--red)" : "var(--text2)",
                    fontFamily:"var(--font-body)",
                  }}>
                    {todaySoldOut.includes(name) ? "Undo" : "Mark sold out"}
                  </button>
                </div>
              ))}
            </div>

            {todaySoldOut.length>0 && (
              <div style={{marginTop:16,background:"rgba(255,107,107,0.06)",border:"1px solid rgba(255,107,107,0.2)",borderRadius:"var(--radius-sm)",padding:"12px 16px"}}>
                <p style={{fontSize:13,color:"var(--red)",lineHeight:1.6}}>
                  <b>{todaySoldOut.length} dish{todaySoldOut.length>1?"es":""} sold out today.</b> Forqast has noted this.
                  These dishes will not be penalised in tomorrow's accuracy calculation.
                </p>
              </div>
            )}
          </div>

          <div className="card">
            <p className="section-title">Why this matters</p>
            <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.6,marginBottom:14}}>
              When you sell out of a dish, the real demand was higher than what was recorded. If Forqast doesn't know this, it learns the wrong pattern.
            </p>
            <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.6,marginBottom:14}}>
              Marking sold-out dishes tells the model: <i style={{color:"var(--text)"}}>"demand was actually higher — I just ran out."</i>
            </p>
            <div style={{background:"rgba(61,220,132,0.06)",border:"1px solid rgba(61,220,132,0.15)",borderRadius:"var(--radius-sm)",padding:"12px 14px"}}>
              <p style={{fontSize:12,color:"var(--text2)",lineHeight:1.6}}>
                💡 <b style={{color:"var(--text)"}}>Coming soon:</b> Sold-out data will automatically increase tomorrow's forecast for that dish so you never run out two days in a row.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CALENDAR ═══ */}
      {tab==="calendar" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:20,alignItems:"start"}}>
          <RestaurantCalendar onCalendarUpdate={d=>{setCalendarData(d)}} savedData={calendarData}/>
          <div className="card">
            <p className="section-title">How the calendar affects your forecast</p>
            {[
              {icon:"🌙",text:"Ramadan Mode — 30 days. Less lunch, much more Iftar demand."},
              {icon:"🌙",text:"Eid — highest demand day of the year for Muslim restaurants."},
              {icon:"🪔",text:"Deepavali — sweets and vegetarian sell much more."},
              {icon:"🎉",text:"Avurudu — very high demand across all dishes."},
              {icon:"💐",text:"Weddings and events — upload last year's catering sales for accuracy."},
              {icon:"🏷️",text:"Promotions — mark offer days so the model expects higher volume."},
            ].map((t,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:12}}>
                <span style={{fontSize:16,flexShrink:0}}>{t.icon}</span>
                <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5}}>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}