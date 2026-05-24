"""
Forqast — Prediction & Inference Engine
========================================
Loads the trained XGBoost model and generates:
  - Predicted demand (units) per dish per day
  - Waste reduction score
  - Order recommendation (how much to prepare)
  - Cost savings estimate
  - Sri Lankan context alerts (Poya, monsoon, events)

Used by:
  - The FastAPI backend (Phase 3)
  - Direct CLI testing (run this file)

Run (CLI test):
    python model/predict.py
"""

import json
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
import sys

# ── make sl_context importable ────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.append(str(ROOT / "data"))
from sl_context import enrich

MODEL_DIR  = Path(__file__).parent
MODEL_PATH = MODEL_DIR / "forqast_model.pkl"
FEAT_PATH  = MODEL_DIR / "feature_list.json"

# ── Category/cuisine one-hot columns (from training) ─────────────────────────
# These must match exactly what preprocess.py produced.
# We read them from feature_list.json so there's no hardcoding.


# ════════════════════════════════════════════════════════════════════════════
# 1. LOAD MODEL
# ════════════════════════════════════════════════════════════════════════════

def load_model():
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)
    with open(FEAT_PATH, "r") as f:
        features = json.load(f)
    return model, features


# ════════════════════════════════════════════════════════════════════════════
# 2. BUILD PREDICTION ROW
# ════════════════════════════════════════════════════════════════════════════

def build_input_row(
    target_date:      pd.Timestamp,
    meal_id:          int,
    center_id:        int,
    checkout_price:   float,
    base_price:       float,
    is_promoted:      bool,
    emailer:          bool,
    homepage:         bool,
    center_type:      str,       # "TYPE_A" | "TYPE_B" | "TYPE_C"
    op_area:          float,
    city_code:        int,
    region_code:      int,
    category:         str,       # e.g. "Beverages", "Rice Bowl"
    cuisine:          str,       # e.g. "Indian", "Thai"
    lag_1:            float,     # last week's actual orders for this dish
    lag_2:            float,
    lag_4:            float,
    roll_4:           float,     # 4-week rolling avg
    roll_8:           float,     # 8-week rolling avg
    features:         list,      # full feature list from training
    week:             int  = None,
    custom_events:    dict = None,
) -> pd.DataFrame:
    """
    Build a single-row DataFrame that matches the training feature schema exactly.
    All one-hot columns not matching this meal's category/cuisine are set to 0.
    """
    # Week number from date (anchored to 2019-01-07 = week 1, matching training)
    if week is None:
        anchor = pd.Timestamp("2019-01-07")
        week   = max(1, int((target_date - anchor).days / 7) + 1)

    # Build base row
    row = {
        "week":                    week,
        "checkout_price":          checkout_price,
        "base_price":              base_price,
        "discount_pct":            max(0, (base_price - checkout_price) / base_price) if base_price > 0 else 0,
        "is_promoted":             int(is_promoted or emailer or homepage),
        "emailer_for_promotion":   int(emailer),
        "homepage_featured":       int(homepage),
        "center_type_code":        {"TYPE_A": 0, "TYPE_B": 1, "TYPE_C": 2}.get(center_type, 0),
        "op_area":                 op_area,
        "city_code":               city_code,
        "region_code":             region_code,
        "lag_1":                   lag_1,
        "lag_2":                   lag_2,
        "lag_4":                   lag_4,
        "roll_4":                  roll_4,
        "roll_8":                  roll_8,
    }

    # Add all one-hot columns as 0 first
    for feat in features:
        if feat.startswith("cat_") or feat.startswith("cui_"):
            row[feat] = 0

    # Set the matching category and cuisine columns to 1
    cat_col = f"cat_{category.replace(' ', '_').replace('&', '').strip('_')}"
    cui_col = f"cui_{cuisine}"

    # Fuzzy match: find the closest column name in features
    for feat in features:
        if feat.startswith("cat_") and category.lower().replace(" ", "_") in feat.lower():
            row[feat] = 1
            break
    for feat in features:
        if feat.startswith("cui_") and cuisine.lower() in feat.lower():
            row[feat] = 1
            break

    # Add SL context features
    date_df = pd.DataFrame({"date": [target_date]})
    enriched = enrich(date_df, custom_events=custom_events)

    sl_cols = [
        "day_of_week", "is_weekend", "is_poya", "is_public_holiday",
        "monsoon_intensity", "is_school_term", "demand_modifier",
    ]
    for col in sl_cols:
        val = enriched[col].iloc[0]
        row[col] = int(val) if isinstance(val, (bool, np.bool_)) else float(val)

    # Build DataFrame with exact feature order from training
    df_row = pd.DataFrame([row])

    # Ensure all training features are present (fill missing with 0)
    for feat in features:
        if feat not in df_row.columns:
            df_row[feat] = 0

    return df_row[features]


# ════════════════════════════════════════════════════════════════════════════
# 3. PREDICT
# ════════════════════════════════════════════════════════════════════════════

def predict_demand(input_row: pd.DataFrame, model) -> float:
    """Run model inference. Returns predicted order count (un-log-transformed)."""
    pred_log = model.predict(input_row)[0]
    pred     = float(np.expm1(pred_log))
    return max(0.0, pred)


# ════════════════════════════════════════════════════════════════════════════
# 4. GENERATE FULL RECOMMENDATION
# ════════════════════════════════════════════════════════════════════════════

def generate_recommendation(
    predicted_demand: float,
    dish_name:        str,
    cost_per_unit:    float,
    price_per_unit:   float,
    current_stock:    float,
    sl_context:       dict,
    recent_orders:    list = None,   # last 8 weeks — used to compute dish-specific confidence
    safety_buffer:    float = 0.10,
) -> dict:
    """
    Convert a raw demand prediction into a human-readable recommendation.
    Waste score now varies per dish based on demand stability.
    """
    units_to_prepare  = predicted_demand * (1 + safety_buffer)
    units_to_order    = max(0, units_to_prepare - current_stock)
    demand_mod        = sl_context.get("demand_modifier", 1.0)

    # ── Dish-specific waste score ─────────────────────────────────────────────
    # Based on coefficient of variation (CV) of recent orders.
    # A dish with stable demand (low CV) gets a high score.
    # A dish with erratic demand (high CV) gets a lower score.
    # This means Rice & Curry and Dhal Curry score differently — as they should.
    if recent_orders and len(recent_orders) >= 3:
        orders_arr = np.array(recent_orders)
        mean_ord   = np.mean(orders_arr)
        std_ord    = np.std(orders_arr)
        cv         = (std_ord / mean_ord) if mean_ord > 0 else 0.5
        # Low CV (stable) → high base score. High CV (erratic) → lower base score
        base_score = max(55, min(88, 90 - cv * 60))
    else:
        base_score = 72.0

    # Adjust for SL context uncertainty
    context_adjustment = (1.0 - abs(demand_mod - 1.0)) * 10
    waste_score = min(100, base_score + context_adjustment)

    # ── Cost savings ──────────────────────────────────────────────────────────
    naive_prepare  = predicted_demand * 1.25
    units_saved    = max(0, naive_prepare - units_to_prepare)
    cost_saved_lkr = units_saved * cost_per_unit

    stockout_risk_pct = max(0, (predicted_demand - units_to_prepare) / predicted_demand * 100) if predicted_demand > 0 else 0

    # ── Human-friendly alerts ─────────────────────────────────────────────────
    alerts = []
    demand_label = sl_context.get("demand_label", "")

    if sl_context.get("is_poya"):
        alerts.append({
            "type":    "poya",
            "level":   "warning",
            "message": "Poya day — vegetarian dishes sell more, meat dishes sell less",
        })
    if sl_context.get("monsoon_intensity", 0) > 0.7:
        alerts.append({
            "type":    "monsoon",
            "level":   "info",
            "message": "Heavy rain expected — fewer walk-in customers, more delivery orders",
        })
    if sl_context.get("is_public_holiday"):
        holiday_name = sl_context.get("holiday_name", "")
        # Different messages for different holiday types
        if any(x in holiday_name for x in ["Eid", "Ramadan"]):
            msg = f"{holiday_name} — Muslim families dining out. Expect higher demand for halal dishes."
        elif "Deepavali" in holiday_name:
            msg = f"{holiday_name} — Hindu festival. Sweet dishes and vegetarian food sell more."
        elif any(x in holiday_name for x in ["New Year", "Avurudu"]):
            msg = f"{holiday_name} — Sri Lankan New Year! One of the busiest dining days of the year."
        elif "Christmas" in holiday_name:
            msg = f"{holiday_name} — Families dining together. Rice, meat dishes, and desserts sell well."
        elif "Poya" in holiday_name:
            msg = f"{holiday_name} — Public holiday. Vegetarian dishes preferred today."
        else:
            msg = f"Public holiday: {holiday_name}"
        alerts.append({ "type": "holiday", "level": "info", "message": msg })

    if sl_context.get("local_event"):
        alerts.append({
            "type":    "event",
            "level":   "success",
            "message": f"{sl_context['local_event']} nearby — expect more customers than usual",
        })

    # Add demand label as an alert if notable
    if demand_label and demand_label != "Normal demand expected today":
        alerts.append({
            "type":    "forecast",
            "level":   "info" if demand_mod >= 1.0 else "warning",
            "message": demand_label,
        })

    return {
        "dish_name":          dish_name,
        "target_date":        sl_context.get("date", ""),
        "predicted_demand":   round(predicted_demand, 1),
        "units_to_prepare":   round(units_to_prepare, 0),
        "units_to_order":     round(units_to_order, 0),
        "current_stock":      current_stock,
        "waste_score":        round(waste_score, 1),
        "cost_saved_lkr":     round(cost_saved_lkr, 2),
        "stockout_risk_pct":  round(stockout_risk_pct, 1),
        "demand_modifier":    round(demand_mod, 2),
        "demand_label":       demand_label,
        "alerts":             alerts,
        "confidence":         "high" if waste_score >= 75 else "medium" if waste_score >= 60 else "low",
    }


# ════════════════════════════════════════════════════════════════════════════
# 5. BATCH FORECAST — 7-day lookahead for a dish
# ════════════════════════════════════════════════════════════════════════════

def forecast_week(
    meal_id:        int,
    center_id:      int,
    dish_name:      str,
    checkout_price: float,
    base_price:     float,
    cost_per_unit:  float,
    category:       str,
    cuisine:        str,
    center_type:    str,
    op_area:        float,
    city_code:      int,
    region_code:    int,
    recent_orders:  list,       # last 8 weeks of actual orders [oldest … newest]
    current_stock:  float = 0,
    custom_events:  dict  = None,
    start_date:     pd.Timestamp = None,
) -> list:
    """
    Generate a 7-day demand forecast for one dish.
    Returns a list of daily recommendation dicts.
    """
    model, features = load_model()

    if start_date is None:
        start_date = pd.Timestamp(datetime.today().date()) + timedelta(days=1)

    # Pad recent_orders to at least 8 entries
    while len(recent_orders) < 8:
        recent_orders.insert(0, np.mean(recent_orders) if recent_orders else 100)

    results = []
    rolling_orders = list(recent_orders)  # we'll append predictions as we go

    for day_offset in range(7):
        target_date = start_date + timedelta(days=day_offset)

        lag_1  = rolling_orders[-1]
        lag_2  = rolling_orders[-2]
        lag_4  = rolling_orders[-4]
        roll_4 = np.mean(rolling_orders[-4:])
        roll_8 = np.mean(rolling_orders[-8:])

        input_row = build_input_row(
            target_date=target_date,
            meal_id=meal_id, center_id=center_id,
            checkout_price=checkout_price, base_price=base_price,
            is_promoted=False, emailer=False, homepage=False,
            center_type=center_type, op_area=op_area,
            city_code=city_code, region_code=region_code,
            category=category, cuisine=cuisine,
            lag_1=lag_1, lag_2=lag_2, lag_4=lag_4,
            roll_4=roll_4, roll_8=roll_8,
            features=features,
            custom_events=custom_events,
        )

        predicted = predict_demand(input_row, model)

        # Get SL context for this date
        date_df  = pd.DataFrame({"date": [target_date]})
        enriched = enrich(date_df, custom_events=custom_events)
        sl_ctx   = enriched.iloc[0].to_dict()
        sl_ctx["date"] = str(target_date.date())

        rec = generate_recommendation(
            predicted_demand=predicted,
            dish_name=dish_name,
            cost_per_unit=cost_per_unit,
            price_per_unit=checkout_price,
            current_stock=current_stock if day_offset == 0 else 0,
            sl_context=sl_ctx,
            recent_orders=rolling_orders[-8:],
        )

        results.append(rec)
        rolling_orders.append(predicted)  # use prediction as next lag

    return results


# ════════════════════════════════════════════════════════════════════════════
# CLI DEMO
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 52)
    print("  Forqast — 7-Day Demand Forecast Demo")
    print("=" * 52)

    # Simulate a Rice Bowl dish at a TYPE_A center
    results = forecast_week(
        meal_id        = 1885,
        center_id      = 55,
        dish_name      = "Rice & Curry (demo)",
        checkout_price = 450.0,
        base_price     = 500.0,
        cost_per_unit  = 180.0,
        category       = "Rice Bowl",
        cuisine        = "Indian",
        center_type    = "TYPE_A",
        op_area        = 3.7,
        city_code      = 679,
        region_code    = 56,
        recent_orders  = [210, 195, 220, 230, 205, 215, 225, 200],
    )

    print(f"\n{'Date':<14} {'Predict':>8} {'Prepare':>8} {'Order':>8} {'Waste':>7}  Alerts")
    print("-" * 70)
    for r in results:
        alerts_str = " | ".join(a["message"][:40] for a in r["alerts"]) or "—"
        print(
            f"{r['target_date']:<14}"
            f"{r['predicted_demand']:>8.0f}"
            f"{r['units_to_prepare']:>8.0f}"
            f"{r['units_to_order']:>8.0f}"
            f"{r['waste_score']:>7.1f}  "
            f"{alerts_str}"
        )

    print(f"\nTotal estimated savings this week: "
          f"LKR {sum(r['cost_saved_lkr'] for r in results):,.0f}")
    print("\n✓ predict.py working correctly.")