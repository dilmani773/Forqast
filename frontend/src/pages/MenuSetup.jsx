import { useState, useEffect } from "react"
import { uploadSales } from "../api/client"
import RestaurantCalendar from "../components/RestaurantCalendar"

// ── localStorage helpers ───────────────────────────────────────────────────
const STORAGE_KEY = "forqast_setup"

function saveToStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const DEFAULT_CATEGORIES = ["Rice Bowl","Kottu","Hoppers","String Hoppers","Roti","Devilled","Seafood","Biryani","Soup","Sandwich","Pasta","Pizza","Desserts","Beverages","Short Eats","Salad","Starter"]
const DEFAULT_CUISINES   = ["Sri Lankan","South Indian","Tamil","Muslim / Arabic","Thai","Chinese","Continental","Italian","Fusion","Malay","Mediterranean"]

const EMPTY_DISH = {
  dish_name:"", category:"Rice Bowl", cuisine:"Sri Lankan",
  checkout_price:"", base_price:"", cost_per_unit:"", current_stock:"0"
}

export default function MenuSetup({ onForecast, onDishesUploaded, uploadedDishes }) {
  // ── Fix 2: Load saved state from localStorage on mount ────────────────────
  const saved = loadFromStorage()

  const [dish,         setDish]         = useState(saved?.dish        || EMPTY_DISH)
  const [customCat,    setCustomCat]    = useState("")
  const [customCui,    setCustomCui]    = useState("")
  const [categories,   setCategories]   = useState(saved?.categories  || DEFAULT_CATEGORIES)
  const [cuisines,     setCuisines]     = useState(saved?.cuisines    || DEFAULT_CUISINES)
  const [uploading,    setUploading]    = useState(false)
  const [uploadRes,    setUploadRes]    = useState(saved?.uploadRes   || null)
  const [error,        setError]        = useState(null)
  const [calendarData, setCalendarData] = useState(saved?.calendarData|| { special_days:{}, ramadan_start:null })
  const [tab,          setTab]          = useState("single")

  // Fix 1: Price editor for bulk dishes
  const [priceTable,   setPriceTable]   = useState(saved?.priceTable  || {})
  const [showPrices,   setShowPrices]   = useState(false)

  // ── Fix 2: Save to localStorage whenever key state changes ───────────────
  useEffect(() => {
    saveToStorage({ dish, categories, cuisines, uploadRes, calendarData, priceTable })
  }, [dish, categories, cuisines, uploadRes, calendarData, priceTable])

  // Restore uploaded dishes from storage on mount
  useEffect(() => {
    if (saved?.uploadRes?.dishes_found?.length && onDishesUploaded) {
      buildAndUploadDishes(saved.uploadRes, saved.priceTable || {})
    }
  }, [])

  const upd = (k,v) => setDish(d => ({...d,[k]:v}))

  function addCategory() {
    if (!customCat.trim()) return
    const updated = [...categories, customCat.trim()]
    setCategories(updated); upd("category", customCat.trim()); setCustomCat("")
  }
  function addCuisine() {
    if (!customCui.trim()) return
    const updated = [...cuisines, customCui.trim()]
    setCuisines(updated); upd("cuisine", customCui.trim()); setCustomCui("")
  }

  function clearSaved() {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    setDish(EMPTY_DISH)
    setCategories(DEFAULT_CATEGORIES)
    setCuisines(DEFAULT_CUISINES)
    setUploadRes(null)
    setPriceTable({})
    setCalendarData({ special_days:{}, ramadan_start:null })
    if (onDishesUploaded) onDishesUploaded([])
  }

  function downloadTemplate() {
    const csv = `date,dish_name,units_sold\n2026-01-01,Rice & Curry,85\n2026-01-02,Rice & Curry,92\n2026-01-03,Chicken Kottu,45\n2026-01-03,Rice & Curry,78\n2026-01-04,Chicken Kottu,52\n2026-01-04,Rice & Curry,105\n2026-01-05,Dhal Curry,38\n2026-01-05,Rice & Curry,88`
    const blob = new Blob([csv],{type:"text/csv"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href=url; a.download="forqast_template.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Fix 1+3: Build dish objects with real lag data + custom prices ─────────
  function buildAndUploadDishes(res, prices) {
    if (!res?.dishes_found?.length) return
    const built = res.dishes_found.map(name => {
      const p     = prices[name] || {}
      const sell  = parseFloat(p.checkout_price) || 450
      const base  = parseFloat(p.base_price)     || sell * 1.1
      const cost  = parseFloat(p.cost_per_unit)  || sell * 0.4
      // Fix 3: use real lag data from upload
      const lags  = res.dish_histories?.[name]   || [150,160,145,170,155,165,158,162]
      return {
        dish_name:      name,
        category:       p.category || "Rice Bowl",
        cuisine:        p.cuisine  || "Sri Lankan",
        checkout_price: sell,
        base_price:     base,
        cost_per_unit:  cost,
        recent_orders:  lags,   // ← real weekly totals from CSV
        current_stock:  0,
      }
    })
    if (onDishesUploaded) onDishesUploaded(built)
  }

  function handleForecast() {
    if (!dish.dish_name || !dish.checkout_price) { setError("Please fill in dish name and selling price."); return }
    setError(null)
    onForecast({
      ...dish,
      checkout_price: parseFloat(dish.checkout_price),
      base_price:     parseFloat(dish.base_price)     || parseFloat(dish.checkout_price)*1.1,
      cost_per_unit:  parseFloat(dish.cost_per_unit)  || parseFloat(dish.checkout_price)*0.4,
      current_stock:  parseFloat(dish.current_stock)  || 0,
      recent_orders:  [150,160,145,170,155,165,158,162],
      special_days:   calendarData.special_days,
      ramadan_start:  calendarData.ramadan_start,
    })
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setError(null)
    try {
      const res = await uploadSales(file)
      setUploadRes(res)
      // Init price table with blanks for each dish found
      const initPrices = {}
      res.dishes_found.forEach(name => {
        initPrices[name] = priceTable[name] || {
          checkout_price:"", base_price:"", cost_per_unit:"",
          category:"Rice Bowl", cuisine:"Sri Lankan"
        }
      })
      setPriceTable(initPrices)
      setShowPrices(true)
      buildAndUploadDishes(res, initPrices)
    } catch(err) {
      setError("Upload failed: "+(err.response?.data?.detail||err.message))
    } finally { setUploading(false) }
  }

  function updatePrice(dish, field, value) {
    const updated = { ...priceTable, [dish]: { ...(priceTable[dish]||{}), [field]: value } }
    setPriceTable(updated)
    if (uploadRes) buildAndUploadDishes(uploadRes, updated)
  }

  const tabStyle = (t) => ({
    padding:"10px 22px", borderRadius:"var(--radius-sm)", cursor:"pointer", border:"none",
    fontFamily:"var(--font-body)", fontSize:14,
    background: tab===t ? "var(--accent-dim)" : "transparent",
    color: tab===t ? "var(--accent)" : "var(--text2)",
    fontWeight: tab===t ? 600 : 400, transition:"all 0.15s",
  })

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>

      {/* Header */}
      <div className="card" style={{padding:"24px 28px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <h1 className="page-title" style={{fontSize:24,marginBottom:6}}>Menu Setup</h1>
          <p style={{color:"var(--text2)",lineHeight:1.6,maxWidth:500}}>
            Add your dishes and upload your sales history. Forqast learns your restaurant's unique patterns — Poya days, monsoons, your best weeks.
          </p>
        </div>
        {/* Fix 2: Show saved indicator + clear button */}
        {loadFromStorage() && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
            <span className="badge badge-green">✓ Settings saved</span>
            <button onClick={clearSaved} style={{background:"none",border:"none",color:"var(--text3)",fontSize:12,cursor:"pointer",fontFamily:"var(--font-mono)"}}>
              Clear all saved data
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,background:"rgba(11,17,14,0.75)",padding:4,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",alignSelf:"flex-start",backdropFilter:"blur(8px)"}}>
        <button style={tabStyle("single")} onClick={()=>setTab("single")}>Add Single Dish</button>
        <button style={tabStyle("bulk")}   onClick={()=>setTab("bulk")}>Upload Full Menu (CSV)</button>
      </div>

      {/* ═══ SINGLE DISH ═══ */}
      {tab==="single" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 360px",gap:20,alignItems:"start"}}>
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <div className="card">
              <p className="section-title">Dish Details</p>
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
                    <input className="input" style={{fontSize:12,padding:"7px 10px"}} placeholder="Type your own category..." value={customCat} onChange={e=>setCustomCat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()}/>
                    <button className="btn btn-ghost" style={{padding:"7px 12px",fontSize:12,whiteSpace:"nowrap"}} onClick={addCategory}>+ Add</button>
                  </div>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label className="label">Cuisine Type</label>
                  <select className="input" value={dish.cuisine} onChange={e=>upd("cuisine",e.target.value)}>
                    {cuisines.map(c=><option key={c}>{c}</option>)}
                  </select>
                  <div style={{display:"flex",gap:6}}>
                    <input className="input" style={{fontSize:12,padding:"7px 10px"}} placeholder="Type your own cuisine..." value={customCui} onChange={e=>setCustomCui(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCuisine()}/>
                    <button className="btn btn-ghost" style={{padding:"7px 12px",fontSize:12,whiteSpace:"nowrap"}} onClick={addCuisine}>+ Add</button>
                  </div>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label className="label">Selling Price (LKR) *</label>
                  <input className="input" type="number" placeholder="e.g. 450" value={dish.checkout_price} onChange={e=>upd("checkout_price",e.target.value)}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label className="label">Original Price (LKR)</label>
                  <input className="input" type="number" placeholder="e.g. 500" value={dish.base_price} onChange={e=>upd("base_price",e.target.value)}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label className="label">Ingredient Cost per Dish (LKR)</label>
                  <input className="input" type="number" placeholder="e.g. 180" value={dish.cost_per_unit} onChange={e=>upd("cost_per_unit",e.target.value)}/>
                  <p style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--font-mono)"}}>Used to calculate money saved from less waste</p>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <label className="label">Units Already Prepared</label>
                  <input className="input" type="number" placeholder="0" value={dish.current_stock} onChange={e=>upd("current_stock",e.target.value)}/>
                </div>

                <div style={{gridColumn:"1/-1",background:"rgba(61,220,132,0.06)",border:"1px solid rgba(61,220,132,0.15)",borderRadius:"var(--radius-sm)",padding:"12px 16px"}}>
                  <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.6}}>
                    💡 <b style={{color:"var(--text)"}}>Sales history</b> — Switch to <b>Upload Full Menu</b> tab to upload your past sales CSV. Forqast uses your actual weekly totals for accurate forecasts. Without upload, smart defaults are used.
                  </p>
                </div>
              </div>

              <button className="btn btn-primary" onClick={handleForecast} style={{width:"100%",justifyContent:"center",padding:14,fontSize:15}}>
                Get My 7-Day Forecast →
              </button>
            </div>

            <RestaurantCalendar onCalendarUpdate={setCalendarData} savedData={calendarData}/>
          </div>

          <div className="card">
            <p className="section-title">Built for every Sri Lankan restaurant</p>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[
                {icon:"🌕",text:"Poya days detected every month — automatically. No setup needed."},
                {icon:"🌧",text:"Monsoon seasons affect walk-in traffic. Forqast knows Sri Lanka's weather patterns."},
                {icon:"🕌",text:"Muslim restaurants — Ramadan Mode adjusts your entire month's forecast automatically."},
                {icon:"🪔",text:"Tamil restaurants — mark Deepavali and Pongal in your calendar below."},
                {icon:"✝️",text:"Christmas, Good Friday, Independence Day — all handled automatically."},
                {icon:"💐",text:"Weddings, promotions, school events — add anything to your calendar."},
                {icon:"💾",text:"Your setup is saved automatically — everything is here next time you open the app."},
              ].map((t,i)=>(
                <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  <span style={{fontSize:18,lineHeight:1.4,flexShrink:0}}>{t.icon}</span>
                  <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5}}>{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ BULK UPLOAD ═══ */}
      {tab==="bulk" && (
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 360px",gap:20,alignItems:"start"}}>

            <div className="card">
              <p className="section-title">Upload Your Sales Data</p>
              <p style={{fontSize:14,color:"var(--text2)",marginBottom:20,lineHeight:1.7}}>
                Upload a CSV of your past sales. Forqast reads every dish, calculates your actual weekly demand patterns, and makes everything available in <b style={{color:"var(--text)"}}>Dashboard → Plan All Dishes</b>.
              </p>

              <div style={{background:"rgba(17,26,22,0.7)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:16,marginBottom:16}}>
                <p className="label" style={{marginBottom:10}}>Your CSV needs 3 columns</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                  {[
                    {col:"date",       desc:"Date of sale",         eg:"2026-01-15"},
                    {col:"dish_name",  desc:"Name of the dish",     eg:"Rice & Curry"},
                    {col:"units_sold", desc:"How many you sold",    eg:"85"},
                  ].map(c=>(
                    <div key={c.col} style={{background:"rgba(10,15,13,0.8)",borderRadius:6,padding:"10px 12px"}}>
                      <p style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--accent)",marginBottom:4}}>{c.col}</p>
                      <p style={{fontSize:12,color:"var(--text2)",marginBottom:3}}>{c.desc}</p>
                      <p style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text3)"}}>e.g. {c.eg}</p>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:12,color:"var(--text3)"}}>
                  Column names like "Date", "Product", "Quantity" also work. Multiple dishes in the same file is fine.
                </p>
              </div>

              <div style={{display:"flex",gap:10,marginBottom:16}}>
                <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={downloadTemplate}>
                  ↓ Download Sample Template
                </button>
              </div>

              <label style={{
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                width:"100%",padding:"32px",
                background:"rgba(17,26,22,0.5)",
                border:"2px dashed var(--border)",
                borderRadius:"var(--radius)",
                color:"var(--text2)",cursor:"pointer",gap:8,transition:"all 0.15s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent)";e.currentTarget.style.color="var(--text)"}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text2)"}}>
                <span style={{fontSize:32}}>{uploading?"⏳":"📂"}</span>
                <span style={{fontSize:15,fontWeight:500}}>{uploading?"Reading your file…":"Click to upload your sales CSV"}</span>
                <span style={{fontSize:12,color:"var(--text3)"}}>Supports .csv files of any size</span>
                <input type="file" accept=".csv" onChange={handleUpload} hidden/>
              </label>

              {error && <div style={{marginTop:12,background:"var(--red-dim)",border:"1px solid rgba(255,107,107,0.3)",color:"var(--red)",padding:"12px 16px",borderRadius:"var(--radius-sm)",fontSize:13}}>⚠ {error}</div>}

              {uploadRes && (
                <div style={{marginTop:16,background:"rgba(61,220,132,0.06)",border:"1px solid rgba(61,220,132,0.2)",borderRadius:"var(--radius-sm)",padding:"16px 18px"}}>
                  <p style={{color:"var(--accent)",fontWeight:600,fontSize:14,marginBottom:10}}>✓ File uploaded successfully</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    <div>
                      <p className="label" style={{marginBottom:3}}>Records found</p>
                      <p style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:700,color:"var(--text)"}}>{uploadRes.rows_processed.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="label" style={{marginBottom:3}}>Date range</p>
                      <p style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text2)",marginTop:4}}>{uploadRes.date_range}</p>
                    </div>
                  </div>
                  <div style={{background:"rgba(61,220,132,0.08)",borderRadius:6,padding:"10px 14px",marginBottom:12}}>
                    <p style={{fontSize:13,color:"var(--accent)"}}>
                      ✓ {uploadRes.dishes_found.length} dishes ready. Go to <b>Dashboard → Plan All Dishes</b> to forecast everything at once.
                      Forqast is using your actual weekly sales figures for accurate predictions.
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{width:"100%",justifyContent:"center",fontSize:13}}
                    onClick={()=>setShowPrices(v=>!v)}>
                    {showPrices ? "▲ Hide price editor" : "▼ Set prices for each dish (for accurate savings estimates)"}
                  </button>
                </div>
              )}
            </div>

            {/* Right col */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="card">
                <p className="section-title">What happens after upload?</p>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {[
                    {step:"1",text:"Forqast reads every dish and calculates your actual demand patterns from real sales"},
                    {step:"2",text:"Set prices for each dish so savings estimates are accurate for your menu"},
                    {step:"3",text:"All dishes appear in the Dashboard"},
                    {step:"4",text:"Click \"Plan All Dishes\" — forecast your whole menu at once"},
                    {step:"5",text:"Download full kitchen report or share on WhatsApp"},
                  ].map(s=>(
                    <div key={s.step} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                      <div style={{width:24,height:24,borderRadius:"50%",background:"var(--accent-dim)",border:"1px solid rgba(61,220,132,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--accent)",fontWeight:700}}>{s.step}</span>
                      </div>
                      <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5,paddingTop:3}}>{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {uploadedDishes.length>0 && (
                <div className="card" style={{background:"linear-gradient(135deg,rgba(61,220,132,0.1) 0%,rgba(11,17,14,0.85) 70%)",border:"1px solid rgba(61,220,132,0.25)"}}>
                  <p style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:15,marginBottom:6}}>Menu loaded</p>
                  <p style={{fontFamily:"var(--font-display)",fontSize:28,fontWeight:800,color:"var(--accent)",lineHeight:1,marginBottom:8}}>{uploadedDishes.length} dishes</p>
                  <p style={{fontSize:13,color:"var(--text2)"}}>With real sales data. Go to Dashboard → Plan All Dishes.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Fix 1: Price editor table ─────────────────────────────────────── */}
          {uploadRes && showPrices && uploadRes.dishes_found.length>0 && (
            <div className="card">
              <p className="section-title">Set Prices for Each Dish</p>
              <p style={{fontSize:13,color:"var(--text2)",marginBottom:16,lineHeight:1.6}}>
                Fill in the prices for your dishes so Forqast can calculate accurate savings estimates.
                Leave blank to use smart defaults (LKR 450 selling, LKR 180 ingredient cost).
                <b style={{color:"var(--accent)",marginLeft:4}}>Your prices are saved automatically.</b>
              </p>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid var(--border)"}}>
                      {["Dish","Category","Cuisine","Selling Price (LKR)","Ingredient Cost (LKR)","Avg Weekly Sales"].map(h=>(
                        <th key={h} style={{padding:"10px 14px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text3)",fontWeight:400,background:"rgba(17,26,22,0.6)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadRes.dishes_found.map((name,i)=>(
                      <tr key={name} style={{borderBottom:"1px solid rgba(46,64,53,0.5)"}}>
                        <td style={{padding:"10px 14px",fontWeight:600,color:"var(--text)",whiteSpace:"nowrap"}}>{name}</td>
                        <td style={{padding:"10px 14px"}}>
                          <select
                            value={priceTable[name]?.category||"Rice Bowl"}
                            onChange={e=>updatePrice(name,"category",e.target.value)}
                            style={{background:"rgba(17,26,22,0.7)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"6px 8px",fontSize:12,width:"100%",outline:"none"}}>
                            {DEFAULT_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <select
                            value={priceTable[name]?.cuisine||"Sri Lankan"}
                            onChange={e=>updatePrice(name,"cuisine",e.target.value)}
                            style={{background:"rgba(17,26,22,0.7)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"6px 8px",fontSize:12,width:"100%",outline:"none"}}>
                            {DEFAULT_CUISINES.map(c=><option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <input
                            type="number" placeholder="450"
                            value={priceTable[name]?.checkout_price||""}
                            onChange={e=>updatePrice(name,"checkout_price",e.target.value)}
                            style={{background:"rgba(17,26,22,0.7)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"7px 10px",fontSize:13,width:"90px",outline:"none"}}/>
                        </td>
                        <td style={{padding:"10px 14px"}}>
                          <input
                            type="number" placeholder="180"
                            value={priceTable[name]?.cost_per_unit||""}
                            onChange={e=>updatePrice(name,"cost_per_unit",e.target.value)}
                            style={{background:"rgba(17,26,22,0.7)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"7px 10px",fontSize:13,width:"90px",outline:"none"}}/>
                        </td>
                        <td style={{padding:"10px 14px",fontFamily:"var(--font-mono)",fontSize:12,color:"var(--accent)"}}>
                          {uploadRes.avg_weekly_units?.[name]?.toFixed(0)||"—"} units/week
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{marginTop:12,fontSize:12,color:"var(--text3)",fontFamily:"var(--font-mono)"}}>
                Changes apply immediately to all forecasts. ✓ Auto-saved to your browser.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}