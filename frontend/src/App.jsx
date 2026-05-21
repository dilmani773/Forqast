import { useState } from "react"
import Dashboard from "./pages/Dashboard"
import MenuSetup from "./pages/MenuSetup"
import "./App.css"

console.log("HMR test: App.jsx loaded")

export default function App() {
  const [page, setPage] = useState("dashboard")
  const [selectedDish, setSelectedDish] = useState(null)

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand">
          <span className="nav-logo">⑁</span>
          <span className="nav-name">Forqast</span>
          <span className="nav-tagline">demand intelligence</span>
        </div>
        <div className="nav-links">
          <button className={`nav-link ${page === "dashboard" ? "active" : ""}`} onClick={() => setPage("dashboard")}>
            Dashboard
          </button>
          <button className={`nav-link ${page === "menu" ? "active" : ""}`} onClick={() => setPage("menu")}>
            Menu Setup
          </button>
          <div className="nav-status">
            <span className="status-dot" />
            API Live
          </div>
        </div>
      </nav>
      <main className="main">
        {page === "dashboard" && <Dashboard selectedDish={selectedDish} setSelectedDish={setSelectedDish} />}
        {page === "menu"      && <MenuSetup onForecast={(dish) => { setSelectedDish(dish); setPage("dashboard") }} />}
      </main>
    </div>
  )
}