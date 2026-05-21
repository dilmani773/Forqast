"""
Forqast — Predict Route
========================
POST /api/predict          → 7-day demand forecast for one dish
GET  /api/context/{date}   → Sri Lankan context for any date
GET  /api/dishes/sample    → Sample dishes for demo mode
"""

import sys
import pandas as pd
from pathlib  import Path
from datetime import datetime, timedelta, date
from fastapi  import APIRouter, HTTPException

from backend.models.schemas import (
    DishForecastRequest, ForecastResponse,
    DayForecast, ContextAlert, SLContextResponse,
)

# ── Import model layer ────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "data"))
sys.path.insert(0, str(ROOT / "model"))

from predict import forecast_week, load_model
from sl_context import enrich

router = APIRouter()

# Load model once at startup — not on every request
print("[Forqast] Loading model...")
_model, _features = load_model()
print("[Forqast] Model ready.")


# ════════════════════════════════════════════════════════════════════════════
# POST /api/predict
# ════════════════════════════════════════════════════════════════════════════

@router.post("/predict", response_model=ForecastResponse)
def predict(req: DishForecastRequest):
    """
    Generate a 7-day demand forecast for a dish.

    The restaurant owner provides their dish details and recent sales history.
    Returns daily predicted demand, order recommendations, waste scores,
    cost savings estimates, and Sri Lankan context alerts.
    """
    try:
        # Parse custom events from UI calendar
        custom_events = None
        if req.custom_events:
            custom_events = {
                pd.Timestamp(k): v
                for k, v in req.custom_events.items()
            }

        # Start date
        start_date = (
            pd.Timestamp(req.start_date)
            if req.start_date
            else pd.Timestamp(datetime.today().date() + timedelta(days=1))
        )

        results = forecast_week(
            meal_id        = req.meal_id,
            center_id      = req.center_id,
            dish_name      = req.dish_name,
            checkout_price = req.checkout_price,
            base_price     = req.base_price,
            cost_per_unit  = req.cost_per_unit,
            category       = req.category,
            cuisine        = req.cuisine,
            center_type    = req.center_type,
            op_area        = req.op_area,
            city_code      = req.city_code,
            region_code    = req.region_code,
            recent_orders  = req.recent_orders,
            current_stock  = req.current_stock,
            custom_events  = custom_events,
            start_date     = start_date,
        )

        # Build response
        forecast = []
        for r in results:
            alerts = [
                ContextAlert(
                    type    = a["type"],
                    level   = a["level"],
                    message = a["message"],
                )
                for a in r["alerts"]
            ]
            forecast.append(DayForecast(
                target_date       = r["target_date"],
                predicted_demand  = r["predicted_demand"],
                units_to_prepare  = r["units_to_prepare"],
                units_to_order    = r["units_to_order"],
                current_stock     = r["current_stock"],
                waste_score       = r["waste_score"],
                cost_saved_lkr    = r["cost_saved_lkr"],
                stockout_risk_pct = r["stockout_risk_pct"],
                demand_modifier   = r["demand_modifier"],
                confidence        = r["confidence"],
                alerts            = alerts,
            ))

        total_savings  = sum(r["cost_saved_lkr"] for r in results)
        avg_waste      = sum(r["waste_score"] for r in results) / len(results)
        peak_day       = max(results, key=lambda x: x["predicted_demand"])

        summary = (
            f"Peak demand expected on {peak_day['target_date']} "
            f"({peak_day['predicted_demand']:.0f} units). "
            f"Estimated weekly savings: LKR {total_savings:,.0f}."
        )

        return ForecastResponse(
            dish_name         = req.dish_name,
            forecast          = forecast,
            total_savings_lkr = round(total_savings, 2),
            avg_waste_score   = round(avg_waste, 1),
            week_summary      = summary,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# GET /api/context/{date}
# ════════════════════════════════════════════════════════════════════════════

@router.get("/context/{target_date}", response_model=SLContextResponse)
def get_context(target_date: str):
    """
    Get Sri Lankan context for any date.
    Used by the frontend to show alerts on the calendar.
    """
    try:
        dt  = pd.Timestamp(target_date)
        df  = pd.DataFrame({"date": [dt]})
        enriched = enrich(df).iloc[0]

        return SLContextResponse(
            date              = target_date,
            day_of_week       = int(enriched["day_of_week"]),
            is_weekend        = bool(enriched["is_weekend"]),
            is_poya           = bool(enriched["is_poya"]),
            is_public_holiday = bool(enriched["is_public_holiday"]),
            holiday_name      = str(enriched["holiday_name"]),
            monsoon_type      = str(enriched["monsoon_type"]),
            monsoon_intensity = float(enriched["monsoon_intensity"]),
            is_school_term    = bool(enriched["is_school_term"]),
            local_event       = str(enriched["local_event"]),
            demand_modifier   = float(enriched["demand_modifier"]),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid date: {e}")


# ════════════════════════════════════════════════════════════════════════════
# GET /api/dishes/sample
# ════════════════════════════════════════════════════════════════════════════

SAMPLE_DISHES = [
    {"dish_name": "Rice & Curry",      "category": "Rice Bowl",  "cuisine": "Indian",      "checkout_price": 450,  "base_price": 500,  "cost_per_unit": 180},
    {"dish_name": "Chicken Kottu",     "category": "Rice Bowl",  "cuisine": "Indian",      "checkout_price": 650,  "base_price": 700,  "cost_per_unit": 280},
    {"dish_name": "Devilled Chicken",  "category": "Seafood",    "cuisine": "Continental", "checkout_price": 750,  "base_price": 800,  "cost_per_unit": 300},
    {"dish_name": "Dhal Curry",        "category": "Rice Bowl",  "cuisine": "Indian",      "checkout_price": 350,  "base_price": 380,  "cost_per_unit": 100},
    {"dish_name": "Fish Ambul Thiyal", "category": "Seafood",    "cuisine": "Indian",      "checkout_price": 700,  "base_price": 750,  "cost_per_unit": 320},
    {"dish_name": "Watalappan",        "category": "Desserts",   "cuisine": "Indian",      "checkout_price": 280,  "base_price": 300,  "cost_per_unit": 90},
    {"dish_name": "Chicken Soup",      "category": "Soup",       "cuisine": "Continental", "checkout_price": 380,  "base_price": 400,  "cost_per_unit": 150},
]

@router.get("/dishes/sample")
def get_sample_dishes():
    """Return sample Sri Lankan dishes for demo mode."""
    return {"dishes": SAMPLE_DISHES}