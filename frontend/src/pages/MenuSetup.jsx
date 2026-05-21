import { useState } from "react"
import { uploadSales } from "../api/client"

const CATEGORIES = ["Rice Bowl","Beverages","Seafood","Biryani","Pasta","Pizza","Sandwich","Soup","Desserts","Salad","Starter"]
const CUISINES   = ["Indian","Thai","Continental","Italian","Chinese","Sri Lankan","Mediterranean"]

export default function MenuSetup({ onForecast }) {
  const [dish,      setDish]      = useState({ dish_name:"", category:"Rice Bowl", cuisine:"Indian", checkout_price:"", base_price:"", cost_per_unit:"", recent_orders:"150,160,145,170,155,165,158,162", current_stock:"0" })
  const [uploading, setUploading] = useState(false)
  const [uploadRes, setUploadRes] = useState(null)
  const [error,     setError]     = useState(null)

  const upd = (k, v) => setDish(d => ({ ...d, [k]: v }))

  function handleForecast() {
    if (!dish.dish_name || !dish.checkout_price) { setError("Please fill in dish name and selling price."); return }
    setError(null)
    onForecast({
      ...dish,
      checkout_price: parseFloat(dish.checkout_price),
      base_price:     parseFloat(dish.base_price) || parseFloat(dish.checkout_price) * 1.1,
      cost_per_unit:  parseFloat(dish.cost_per_unit) || parseFloat(dish.checkout_price) * 0.4,
      current_stock:  parseFloat(dish.current_stock) || 0,
      recent_orders:  dish.recent_orders.split(",").map(Number).filter(Boolean),
    })
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setUploadRes(null); setError(null)
    try { setUploadRes(await uploadSales(file)) }
    catch (err) { setError("Upload failed: " + (err.response?.data?.detail || err.message)) }
    finally { setUploading(false) }
  }

  const field = (label, key, type="text", placeholder="") => (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <label className="label">{label}</label>
      <input className="input" type={type} placeholder={placeholder} value={dish[key]} onChange={e => upd(key, e.target.value)} />
    </div>
  )

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      <div>
        <h1 className="page-title">Menu Setup</h1>
        <p style={{ color:"var(--text2)", marginTop:4 }}>Configure a dish and run a custom forecast</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:20, alignItems:"start" }}>

        {/* Form */}
        <div className="card">
          <p className="section-title">Dish Details</p>
          {error && <div style={{ background:"var(--red-dim)", border:"1px solid rgba(255,95,95,0.3)", color:"var(--red)", padding:"12px 16px", borderRadius:"var(--radius-sm)", marginBottom:16 }}>⚠ {error}</div>}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
            <div style={{ gridColumn:"1/-1", display:"flex", flexDirection:"column", gap:6 }}>
              <label className="label">Dish Name *</label>
              <input className="input" placeholder="e.g. Rice & Curry" value={dish.dish_name} onChange={e => upd("dish_name", e.target.value)} />
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label className="label">Category</label>
              <select className="input" value={dish.category} onChange={e => upd("category", e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label className="label">Cuisine</label>
              <select className="input" value={dish.cuisine} onChange={e => upd("cuisine", e.target.value)}>
                {CUISINES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            {field("Selling Price (LKR) *", "checkout_price", "number", "450")}
            {field("Original Price (LKR)",  "base_price",     "number", "500")}
            {field("Ingredient Cost (LKR)", "cost_per_unit",  "number", "180")}
            {field("Current Stock (units)", "current_stock",  "number", "0")}

            <div style={{ gridColumn:"1/-1", display:"flex", flexDirection:"column", gap:6 }}>
              <label className="label">Recent Orders — last 8 weeks, comma separated</label>
              <input className="input" placeholder="150,160,145,170,155,165,158,162" value={dish.recent_orders} onChange={e => upd("recent_orders", e.target.value)} />
              <p style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)" }}>Oldest → newest. Used as lag features by the model.</p>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleForecast}>Run 7-Day Forecast →</button>
        </div>

        {/* Upload + Tips */}
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          <div className="card">
            <p className="section-title">Upload Sales CSV</p>
            <p style={{ fontSize:13, color:"var(--text2)", marginBottom:16, lineHeight:1.5 }}>Upload past sales and we'll extract order history automatically.</p>

            <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--radius-sm)", padding:"12px 14px", marginBottom:16 }}>
              <p className="label" style={{ marginBottom:8 }}>Expected columns</p>
              <code style={{ display:"block", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--accent)", background:"var(--bg)", padding:"8px 10px", borderRadius:6 }}>date, dish_name, units_sold</code>
              <p style={{ fontSize:11, color:"var(--text3)", fontFamily:"var(--font-mono)", marginTop:6 }}>Variations like "Date", "Product", "Quantity" also work.</p>
            </div>

            <label style={{ display:"flex", alignItems:"center", justifyContent:"center", width:"100%", padding:10, background:"var(--surface)", border:"1px dashed var(--border)", borderRadius:"var(--radius-sm)", color:"var(--text2)", fontSize:14, cursor:"pointer" }}>
              {uploading ? "Uploading…" : "Choose CSV File"}
              <input type="file" accept=".csv" onChange={handleUpload} hidden />
            </label>

            {uploadRes && (
              <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid var(--border)", fontSize:13, color:"var(--text2)", display:"flex", flexDirection:"column", gap:6 }}>
                <span className="badge badge-green" style={{ alignSelf:"flex-start", marginBottom:4 }}>✓ Upload successful</span>
                <p><b>{uploadRes.rows_processed.toLocaleString()}</b> rows processed</p>
                <p>Date range: <span style={{ fontFamily:"var(--font-mono)" }}>{uploadRes.date_range}</span></p>
                <p className="label" style={{ marginTop:6 }}>Dishes found</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                  {uploadRes.dishes_found.map(d => (
                    <span key={d} style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--text2)", padding:"3px 10px", borderRadius:99, fontSize:12 }}>{d}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <p className="section-title">Tips</p>
            <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:10 }}>
              {[
                "Provide at least 8 weeks of history for accurate predictions",
                "Set ingredient cost accurately — this drives your savings estimate",
                "Poya day effects are automatic — no manual input needed",
                "Use Menu Setup for custom dishes not in the sample list",
              ].map((tip, i) => (
                <li key={i} style={{ fontSize:13, color:"var(--text2)", paddingLeft:16, position:"relative", lineHeight:1.5 }}>
                  <span style={{ position:"absolute", left:0, color:"var(--accent)", fontSize:11 }}>→</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}