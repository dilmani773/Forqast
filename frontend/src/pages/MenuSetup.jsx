import { useState, useEffect, useRef } from "react"
import { uploadSales } from "../api/client"
import RestaurantCalendar from "../components/RestaurantCalendar"

const STORAGE_KEY = "forqast_v2"
function save(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {} }
function load() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null } catch { return null } }

const DEFAULT_CATEGORIES = ["Rice Bowl","Kottu","Hoppers","String Hoppers","Roti","Devilled","Seafood","Biryani","Soup","Sandwich","Pasta","Pizza","Desserts","Beverages","Short Eats","Salad","Starter"]
const DEFAULT_CUISINES   = ["Sri Lankan","South Indian","Tamil","Muslim / Arabic","Thai","Chinese","Continental","Italian","Fusion","Malay","Mediterranean"]
const EMPTY = { dish_name:"", category:"Rice Bowl", cuisine:"Sri Lankan", checkout_price:"", base_price:"", cost_per_unit:"", current_stock:"0" }

export default function MenuSetup({ onForecast, onDishesUploaded, uploadedDishes }) {
  const saved = load()
  const [hasSaved, setHasSaved] = useState(!!saved)
  const suppressSaveRef = useRef(false)

  const [dish,         setDish]         = useState(saved?.dish        || EMPTY)
  const [customCat,    setCustomCat]    = useState("")
  const [customCui,    setCustomCui]    = useState("")
  const [categories,   setCategories]   = useState(saved?.categories  || DEFAULT_CATEGORIES)
  const [cuisines,     setCuisines]     = useState(saved?.cuisines    || DEFAULT_CUISINES)
  const [uploading,    setUploading]    = useState(false)
  const [uploadRes,    setUploadRes]    = useState(saved?.uploadRes   || null)
  const [error,        setError]        = useState(null)
  const [calendarData, setCalendarData] = useState(saved?.calendarData|| { special_days:{}, ramadan_start:null })
  const [tab,          setTab]          = useState("bulk")
  // Price table: {dishName: {checkout_price, cost_per_unit}}
  const [prices,       setPrices]       = useState(saved?.prices      || {})
  const [showPrices,   setShowPrices]   = useState(false)

  // Persist everything
  useEffect(() => {
    if (suppressSaveRef.current) {
      // Clearing was requested — skip this save and reset the flag so future changes persist
      suppressSaveRef.current = false
      setHasSaved(false)
      return
    }
    save({ dish, categories, cuisines, uploadRes, calendarData, prices })
    setHasSaved(true)
  }, [dish, categories, cuisines, uploadRes, calendarData, prices])

  // On mount — restore uploaded dishes
  useEffect(() => {
    if (saved?.uploadRes?.dishes_found?.length) {
      pushDishes(saved.uploadRes, saved.prices || {})
    }
  }, [])

  const upd = (k,v) => setDish(d=>({...d,[k]:v}))

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
    // Prevent the auto-save effect from immediately re-writing defaults
    suppressSaveRef.current = true
    setDish(EMPTY); setCategories(DEFAULT_CATEGORIES); setCuisines(DEFAULT_CUISINES)
    setUploadRes(null); setPrices({}); setCalendarData({ special_days:{}, ramadan_start:null })
    if (onDishesUploaded) onDishesUploaded([])
    setHasSaved(false)
  }

  // Build dish objects from upload result + prices → push to Dashboard
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
        ramadan_start:  calendarData.ramadan_start,
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
      checkout_price: parseFloat(dish.checkout_price),
      base_price:     parseFloat(dish.base_price) || parseFloat(dish.checkout_price)*1.1,
      cost_per_unit:  parseFloat(dish.cost_per_unit) || parseFloat(dish.checkout_price)*0.4,
      current_stock:  parseFloat(dish.current_stock) || 0,
      recent_orders:  [150,160,145,170,155,165,158,162],
      special_days:   calendarData.special_days,
    })
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setError(null)
    try {
      const res = await uploadSales(file)
      setUploadRes(res)
      // Init blank prices for new dishes
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
    const csv = `date,dish_name,units_sold\n2026-01-01,Rice & Curry,85\n2026-01-02,Rice & Curry,92\n2026-01-03,Chicken Kottu,45\n2026-01-03,Rice & Curry,78\n2026-01-04,Chicken Kottu,52\n2026-01-04,Rice & Curry,105`
    const blob = new Blob([csv],{type:"text/csv"})
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href=url; a.download="forqast_template.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  const tabStyle = t => ({
    padding:"10px 22px", borderRadius:"var(--radius-sm)", cursor:"pointer", border:"none",
    fontFamily:"var(--font-body)", fontSize:14,
    background: tab===t ? "var(--accent-dim)" : "transparent",
    color: tab===t ? "var(--accent)" : "var(--text2)",
    fontWeight: tab===t ? 600 : 400, transition:"all 0.15s",
  })

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24}}>

      {/* Header */}
      <div className="card" style={{padding:"24px 28px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
        <div>
          <h1 className="page-title" style={{fontSize:24,marginBottom:6}}>Menu Setup</h1>
          <p style={{color:"var(--text2)",lineHeight:1.6,maxWidth:560}}>
            Upload your sales history and Forqast learns your restaurant's actual demand patterns.
            Or add a single dish with exact prices for a detailed forecast.
          </p>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          {hasSaved && <span className="badge badge-green">✓ Your settings are saved</span>}
          {hasSaved && (
            <button type="button" onClick={clearAll} className="badge badge-green" style={{marginTop:6, cursor: "pointer"}}>
              Clear all & start over
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,background:"rgba(11,17,14,0.75)",padding:4,borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",alignSelf:"flex-start",backdropFilter:"blur(8px)"}}>
        <button style={tabStyle("bulk")}   onClick={()=>setTab("bulk")}>Upload Your Sales (Recommended)</button>
        <button style={tabStyle("single")} onClick={()=>setTab("single")}>Add a Single Dish</button>
        <button style={tabStyle("calendar")} onClick={()=>setTab("calendar")}>Special Days Calendar</button>
      </div>

      {/* ═══ BULK UPLOAD ═══ */}
      {tab==="bulk" && (
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20,alignItems:"start"}}>

            <div className="card">
              <p className="section-title">Upload Your Sales Data</p>
              <p style={{fontSize:14,color:"var(--text2)",marginBottom:20,lineHeight:1.7}}>
                Upload a CSV of your past sales. Forqast reads every dish, uses your real weekly demand patterns,
                and makes everything available in <b style={{color:"var(--text)"}}>Dashboard → Plan All Dishes</b>.
                No need to add dishes one by one.
              </p>

              {/* Format */}
              <div style={{background:"rgba(17,26,22,0.7)",border:"1px solid var(--border)",borderRadius:"var(--radius-sm)",padding:16,marginBottom:16}}>
                <p className="label" style={{marginBottom:10}}>Your CSV needs 3 columns</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                  {[
                    {col:"date",eg:"2026-01-15"},
                    {col:"dish_name",eg:"Rice & Curry"},
                    {col:"units_sold",eg:"85"},
                  ].map(c=>(
                    <div key={c.col} style={{background:"rgba(10,15,13,0.8)",borderRadius:6,padding:"8px 12px"}}>
                      <p style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--accent)",marginBottom:2}}>{c.col}</p>
                      <p style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text3)"}}>e.g. {c.eg}</p>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:12,color:"var(--text3)"}}>Multiple dishes in the same file is fine. "Date", "Product", "Quantity" column names also work.</p>
              </div>

              <div style={{display:"flex",gap:10,marginBottom:14}}>
                <button className="btn btn-ghost" style={{flex:1,justifyContent:"center"}} onClick={downloadTemplate}>↓ Download Sample Template</button>
              </div>

              {/* Upload zone */}
              <label style={{
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                width:"100%",padding:"32px",background:"rgba(17,26,22,0.5)",
                border:"2px dashed var(--border)",borderRadius:"var(--radius)",
                color:"var(--text2)",cursor:"pointer",gap:8,transition:"all 0.15s",
              }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--accent)";e.currentTarget.style.color="var(--text)"}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text2)"}}>
                <span style={{fontSize:36}}>{uploading?"⏳":"📂"}</span>
                <span style={{fontSize:15,fontWeight:500}}>{uploading?"Reading your file…":"Click to upload your sales CSV"}</span>
                <span style={{fontSize:12,color:"var(--text3)"}}>Any .csv file works</span>
                <input type="file" accept=".csv" onChange={handleUpload} hidden/>
              </label>

              {error && <div style={{marginTop:12,background:"var(--red-dim)",border:"1px solid rgba(255,107,107,0.3)",color:"var(--red)",padding:"12px 16px",borderRadius:"var(--radius-sm)",fontSize:13}}>⚠ {error}</div>}

              {/* Upload result */}
              {uploadRes && (
                <div style={{marginTop:16,background:"rgba(61,220,132,0.06)",border:"1px solid rgba(61,220,132,0.2)",borderRadius:"var(--radius-sm)",padding:18}}>
                  <p style={{color:"var(--accent)",fontWeight:600,fontSize:14,marginBottom:12}}>✓ Upload successful</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
                    <div><p className="label" style={{marginBottom:3}}>Records</p><p style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:800,color:"var(--text)"}}>{uploadRes.rows_processed.toLocaleString()}</p></div>
                    <div><p className="label" style={{marginBottom:3}}>Dishes found</p><p style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:800,color:"var(--accent)"}}>{uploadRes.dishes_found.length}</p></div>
                    <div><p className="label" style={{marginBottom:3}}>Date range</p><p style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text2)",marginTop:4,lineHeight:1.6}}>{uploadRes.date_range}</p></div>
                  </div>

                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                    {uploadRes.dishes_found.map(d=>(
                      <span key={d} style={{background:"rgba(28,43,34,0.8)",border:"1px solid var(--border)",color:"var(--text)",padding:"5px 14px",borderRadius:99,fontSize:13,fontWeight:500}}>{d}</span>
                    ))}
                  </div>

                  <div style={{background:"rgba(61,220,132,0.1)",borderRadius:8,padding:"12px 16px",marginBottom:14}}>
                    <p style={{fontSize:13,color:"var(--accent)",lineHeight:1.6}}>
                      ✓ All {uploadRes.dishes_found.length} dishes are ready in the Dashboard.
                      <b> Go to Dashboard → Plan All Dishes</b> to forecast your entire menu at once.
                      Forqast is using your actual weekly sales figures — not guesses.
                    </p>
                  </div>

                  <button className="btn btn-ghost" style={{width:"100%",justifyContent:"center",fontSize:13}} onClick={()=>setShowPrices(v=>!v)}>
                    {showPrices ? "▲ Hide price editor" : "▼ Set selling prices for accurate savings estimates"}
                  </button>
                </div>
              )}
            </div>

            {/* Right */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="card">
                <p className="section-title">How it works</p>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  {[
                    {n:"1",t:"Upload your sales CSV — one file, all your dishes"},
                    {n:"2",t:"Optionally set prices so savings estimates are accurate"},
                    {n:"3",t:"Go to Dashboard → Plan All Dishes"},
                    {n:"4",t:"Forqast forecasts every dish using your real demand patterns"},
                    {n:"5",t:"Download a full kitchen report or send to WhatsApp"},
                  ].map(s=>(
                    <div key={s.n} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                      <div style={{width:24,height:24,borderRadius:"50%",background:"var(--accent-dim)",border:"1px solid rgba(61,220,132,0.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--accent)",fontWeight:700}}>{s.n}</span>
                      </div>
                      <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5,paddingTop:3}}>{s.t}</p>
                    </div>
                  ))}
                </div>
              </div>

              {uploadedDishes.length>0 && (
                <div className="card" style={{background:"linear-gradient(135deg,rgba(61,220,132,0.1) 0%,rgba(11,17,14,0.85) 70%)",border:"1px solid rgba(61,220,132,0.25)"}}>
                  <p className="label" style={{marginBottom:6}}>Ready to forecast</p>
                  <p style={{fontFamily:"var(--font-display)",fontSize:32,fontWeight:800,color:"var(--accent)",lineHeight:1}}>{uploadedDishes.length}</p>
                  <p style={{fontFamily:"var(--font-display)",fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:8}}>dishes loaded</p>
                  <p style={{fontSize:13,color:"var(--text2)"}}>Go to Dashboard and click "Plan All Dishes"</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Price editor ── */}
          {uploadRes && showPrices && (
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div>
                  <p className="section-title" style={{marginBottom:4}}>Set Prices for Each Dish</p>
                  <p style={{fontSize:13,color:"var(--text2)"}}>
                    Leave blank to use defaults (LKR 450 selling, LKR 180 ingredient cost).
                    <span style={{color:"var(--accent)",marginLeft:6}}>Saved automatically.</span>
                  </p>
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid var(--border)"}}>
                      {["Dish","Selling Price (LKR)","Ingredient Cost (LKR)","Avg Weekly Sales from your data"].map(h=>(
                        <th key={h} style={{padding:"10px 16px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text3)",fontWeight:400,background:"rgba(17,26,22,0.6)",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadRes.dishes_found.map(name=>(
                      <tr key={name} style={{borderBottom:"1px solid rgba(46,64,53,0.5)"}}>
                        <td style={{padding:"12px 16px",fontWeight:600,color:"var(--text)",fontSize:14}}>{name}</td>
                        <td style={{padding:"12px 16px"}}>
                          <input type="number" placeholder="450"
                            value={prices[name]?.checkout_price||""}
                            onChange={e=>updatePrice(name,"checkout_price",e.target.value)}
                            style={{background:"rgba(17,26,22,0.8)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"8px 12px",fontSize:13,width:100,outline:"none"}}/>
                        </td>
                        <td style={{padding:"12px 16px"}}>
                          <input type="number" placeholder="180"
                            value={prices[name]?.cost_per_unit||""}
                            onChange={e=>updatePrice(name,"cost_per_unit",e.target.value)}
                            style={{background:"rgba(17,26,22,0.8)",border:"1px solid var(--border)",borderRadius:6,color:"var(--text)",padding:"8px 12px",fontSize:13,width:100,outline:"none"}}/>
                        </td>
                        <td style={{padding:"12px 16px",fontFamily:"var(--font-mono)",fontSize:13}}>
                          <span style={{color:"var(--accent)",fontWeight:600}}>
                            {uploadRes.avg_weekly_units?.[name]
                              ? `~${Math.round(uploadRes.avg_weekly_units[name])} units/week`
                              : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{marginTop:10,fontSize:11,color:"var(--text3)",fontFamily:"var(--font-mono)"}}>
                ✓ Changes apply immediately. ✓ Auto-saved to your browser.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ SINGLE DISH ═══ */}
      {tab==="single" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20,alignItems:"start"}}>
          <div className="card">
            <p className="section-title">Add a Single Dish</p>
            <p style={{fontSize:13,color:"var(--text2)",marginBottom:20,lineHeight:1.6}}>
              Use this when you want a detailed forecast for one specific dish — with exact prices, your own category, and the calendar applied.
            </p>
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
                <label className="label">Ingredient Cost per Dish (LKR)</label>
                <input className="input" type="number" placeholder="180" value={dish.cost_per_unit} onChange={e=>upd("cost_per_unit",e.target.value)}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <label className="label">Units Already Prepared</label>
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
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[
                "You want to test a new dish before adding it to your menu",
                "You need exact savings estimates for one high-value dish",
                "You want to apply your Special Days Calendar to a specific item",
              ].map((t,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{color:"var(--accent)",fontSize:14,flexShrink:0,marginTop:1}}>→</span>
                  <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5}}>{t}</p>
                </div>
              ))}
            </div>
            <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid var(--border)"}}>
              <p style={{fontSize:13,color:"var(--text3)"}}>
                For your full menu, use <b style={{color:"var(--text2)"}}>Upload Your Sales</b> tab instead — it's faster and more accurate.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CALENDAR ═══ */}
      {tab==="calendar" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20,alignItems:"start"}}>
          <RestaurantCalendar onCalendarUpdate={setCalendarData} savedData={calendarData}/>
          <div className="card">
            <p className="section-title">How the calendar affects forecasts</p>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[
                {icon:"🌙",text:"Ramadan Mode — marks 30 days. Less lunch demand, higher Iftar demand throughout the month."},
                {icon:"🌙",text:"Eid — one of the highest-demand days of the year for Muslim restaurants."},
                {icon:"🪔",text:"Deepavali — sweet dishes and vegetarian food sell significantly more."},
                {icon:"🎉",text:"Avurudu season — very high demand across all dish types."},
                {icon:"💐",text:"Weddings and events — large spike. Upload last year's catering sales for accuracy."},
                {icon:"🏷️",text:"Promotions — mark your offer days so the model expects higher volume."},
              ].map((t,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:16,flexShrink:0}}>{t.icon}</span>
                  <p style={{fontSize:13,color:"var(--text2)",lineHeight:1.5}}>{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}