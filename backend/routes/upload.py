"""
Forqast — Upload Route
=======================
POST /api/upload-sales

Accepts a CSV file of past sales from a restaurant owner.
Parses it, extracts recent order history per dish,
and returns data ready for the predict endpoint.

Expected CSV columns (flexible — we map common variations):
    date, dish_name, units_sold
    OR: Date, Product, Quantity
    OR: order_date, item, quantity_sold
"""

import io
import pandas as pd
from fastapi           import APIRouter, UploadFile, File, HTTPException
from backend.models.schemas import UploadResponse

router = APIRouter()

# ── Column name aliases — maps common variations to our standard names ────────
DATE_ALIASES  = ["date", "order_date", "Date", "ORDER_DATE", "transaction_date"]
DISH_ALIASES  = ["dish_name", "product", "item", "Product", "ITEM", "menu_item", "dish"]
UNITS_ALIASES = ["units_sold", "quantity", "qty", "Quantity", "UNITS", "sold", "orders"]


def find_column(df: pd.DataFrame, aliases: list) -> str:
    """Find the first matching column name from a list of aliases."""
    for alias in aliases:
        if alias in df.columns:
            return alias
    # Try case-insensitive match
    lower_cols = {c.lower(): c for c in df.columns}
    for alias in aliases:
        if alias.lower() in lower_cols:
            return lower_cols[alias.lower()]
    return None


@router.post("/upload-sales", response_model=UploadResponse)
async def upload_sales(file: UploadFile = File(...)):
    """
    Upload a CSV of past sales.

    The CSV should have at minimum:
    - A date column
    - A dish/product name column
    - A units sold / quantity column

    Returns aggregated weekly order history per dish,
    ready to feed into the /predict endpoint.
    """
    # ── Validate file type ────────────────────────────────────────────────────
    if not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code = 400,
            detail      = "Only CSV files are accepted. Please upload a .csv file."
        )

    # ── Read file ─────────────────────────────────────────────────────────────
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read CSV: {e}")

    # ── Find columns ──────────────────────────────────────────────────────────
    date_col  = find_column(df, DATE_ALIASES)
    dish_col  = find_column(df, DISH_ALIASES)
    units_col = find_column(df, UNITS_ALIASES)

    missing = []
    if not date_col:  missing.append("date (tried: date, order_date, Date)")
    if not dish_col:  missing.append("dish name (tried: dish_name, product, item)")
    if not units_col: missing.append("units sold (tried: units_sold, quantity, qty)")

    if missing:
        raise HTTPException(
            status_code = 422,
            detail      = f"Could not find required columns: {'; '.join(missing)}. "
                          f"Your CSV has: {list(df.columns)}"
        )

    # ── Clean and parse ───────────────────────────────────────────────────────
    df = df[[date_col, dish_col, units_col]].copy()
    df.columns = ["date", "dish_name", "units_sold"]

    df["date"]       = pd.to_datetime(df["date"], errors="coerce")
    df["units_sold"] = pd.to_numeric(df["units_sold"], errors="coerce")
    df              = df.dropna()

    if len(df) == 0:
        raise HTTPException(
            status_code = 422,
            detail      = "No valid rows found after parsing. Check date and quantity formats."
        )

    # ── Aggregate to weekly per dish ──────────────────────────────────────────
    df["week"] = df["date"].dt.to_period("W").apply(lambda p: p.start_time)

    weekly = (
        df.groupby(["dish_name", "week"])["units_sold"]
        .sum()
        .reset_index()
        .sort_values(["dish_name", "week"])
    )

    # Build last-8-weeks history per dish for the predict endpoint
    dish_histories = {}
    for dish, group in weekly.groupby("dish_name"):
        last_8 = group["units_sold"].tail(8).tolist()
        # Pad to 8 if fewer weeks available
        while len(last_8) < 8:
            last_8.insert(0, float(group["units_sold"].mean()))
        dish_histories[dish] = [round(v, 1) for v in last_8]

    dishes_found = list(dish_histories.keys())
    date_range   = f"{df['date'].min().date()} → {df['date'].max().date()}"

    return UploadResponse(
        success        = True,
        rows_processed = len(df),
        dishes_found   = dishes_found,
        date_range     = date_range,
        message        = (
            f"Successfully processed {len(df):,} sales records "
            f"across {len(dishes_found)} dishes "
            f"({date_range}). "
            f"Use the dish_histories in your predict requests."
        ),
    )