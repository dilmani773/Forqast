"""
Forqast — API Request & Response Schemas
=========================================
Pydantic models define exactly what the API accepts and returns.
FastAPI uses these for automatic validation and Swagger docs.
"""

from pydantic import BaseModel, Field
from typing  import List, Optional
from datetime import date


# ════════════════════════════════════════════════════════════════════════════
# REQUEST SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class DishForecastRequest(BaseModel):
    """
    Request body for POST /api/predict
    The restaurant owner provides their dish details and recent sales history.
    """
    # Dish identity
    dish_name:      str   = Field(..., example="Rice & Curry")
    category:       str   = Field(..., example="Rice Bowl")
    cuisine:        str   = Field(..., example="Indian")

    # Pricing
    checkout_price: float = Field(..., gt=0, example=450.0,
                                  description="Current selling price in LKR")
    base_price:     float = Field(..., gt=0, example=500.0,
                                  description="Original price before any discount")
    cost_per_unit:  float = Field(..., gt=0, example=180.0,
                                  description="Ingredient cost per dish in LKR")

    # Promotions
    is_promoted:    bool  = Field(False, example=False)
    emailer:        bool  = Field(False, example=False)
    homepage:       bool  = Field(False, example=False)

    # Center / location info
    center_type:    str   = Field("TYPE_A", example="TYPE_A",
                                  description="TYPE_A | TYPE_B | TYPE_C")
    op_area:        float = Field(3.7,  example=3.7)
    city_code:      int   = Field(679,  example=679)
    region_code:    int   = Field(56,   example=56)

    # Internal model IDs (use defaults for new restaurants)
    meal_id:        int   = Field(1885, example=1885)
    center_id:      int   = Field(55,   example=55)

    # Recent sales history — last 8 weeks, oldest first
    # If the owner uploads a CSV, the backend fills this automatically
    recent_orders:  List[float] = Field(
        default=[150, 160, 145, 170, 155, 165, 158, 162],
        example=[150, 160, 145, 170, 155, 165, 158, 162],
        description="Last 8 weeks of actual orders for this dish, oldest first"
    )

    # Current stock on hand
    current_stock:  float = Field(0, example=0,
                                  description="Units already prepped/in stock")

    # Forecast start date (defaults to tomorrow)
    start_date:     Optional[date] = Field(
        None, example="2025-05-19",
        description="Start date for forecast. Defaults to tomorrow."
    )

    # Optional: custom events from the UI calendar
    custom_events:  Optional[dict] = Field(
        None,
        example={"2025-05-20": "Restaurant Anniversary"},
        description="Special events marked by the owner in the UI"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "dish_name":      "Rice & Curry",
                "category":       "Rice Bowl",
                "cuisine":        "Indian",
                "checkout_price": 450.0,
                "base_price":     500.0,
                "cost_per_unit":  180.0,
                "recent_orders":  [150, 160, 145, 170, 155, 165, 158, 162],
                "current_stock":  0,
            }
        }


# ════════════════════════════════════════════════════════════════════════════
# RESPONSE SCHEMAS
# ════════════════════════════════════════════════════════════════════════════

class ContextAlert(BaseModel):
    type:    str  # "poya" | "monsoon" | "holiday" | "event"
    level:   str  # "warning" | "info" | "success"
    message: str


class DayForecast(BaseModel):
    """Single day forecast for one dish."""
    target_date:         str
    predicted_demand:    float
    units_to_prepare:    float
    units_to_order:      float
    current_stock:       float
    waste_score:         float
    cost_saved_lkr:      float
    stockout_risk_pct:   float
    demand_modifier:     float
    confidence:          str    # "high" | "medium" | "low"
    alerts:              List[ContextAlert]


class ForecastResponse(BaseModel):
    """7-day forecast response for one dish."""
    dish_name:              str
    forecast:               List[DayForecast]
    total_savings_lkr:      float
    avg_waste_score:        float
    week_summary:           str


class SLContextResponse(BaseModel):
    """Sri Lankan context for a specific date."""
    date:               str
    day_of_week:        int
    is_weekend:         bool
    is_poya:            bool
    is_public_holiday:  bool
    holiday_name:       str
    monsoon_type:       str
    monsoon_intensity:  float
    is_school_term:     bool
    local_event:        str
    demand_modifier:    float


class UploadResponse(BaseModel):
    """Response after uploading a sales CSV."""
    success:        bool
    rows_processed: int
    dishes_found:   List[str]
    date_range:     str
    message:        str