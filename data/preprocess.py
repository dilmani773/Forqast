"""
Forqast — Data Preprocessing Pipeline
=======================================
Cleans, merges, and enriches all datasets into one
training-ready CSV for the XGBoost forecasting model.

Input files (place in data/raw/):
    train.csv
    meal_info.csv
    fulfilment_center_info.csv
    restaurant_sales.csv  (optional — used for feature enrichment only)

Output:
    data/processed/forqast_training_data.csv

Run:
    python preprocess.py
"""

import pandas as pd
import numpy as np
from pathlib import Path
import sys
import os

# ── make sl_context importable regardless of where you run from ──────────────
sys.path.append(str(Path(__file__).parent))
from sl_context import enrich

# ── PATHS ────────────────────────────────────────────────────────────────────
RAW_DIR  = Path(__file__).parent / "raw"
OUT_DIR  = Path(__file__).parent / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# ════════════════════════════════════════════════════════════════════════════
# STEP 1 — Load raw files
# ════════════════════════════════════════════════════════════════════════════

def load_raw():
    print("── Step 1: Loading raw files ──")

    train   = pd.read_csv(RAW_DIR / "train.csv")
    meals   = pd.read_csv(RAW_DIR / "meal_info.csv")
    centers = pd.read_csv(RAW_DIR / "fulfilment_center_info.csv")

    print(f"  train.csv            : {train.shape[0]:>7,} rows × {train.shape[1]} cols")
    print(f"  meal_info.csv        : {meals.shape[0]:>7,} rows × {meals.shape[1]} cols")
    print(f"  fulfilment_center    : {centers.shape[0]:>7,} rows × {centers.shape[1]} cols")

    # Restaurant sales is small — load only if present
    sales_path = RAW_DIR / "restaurant_sales.csv"
    sales = pd.read_csv(sales_path) if sales_path.exists() else None
    if sales is not None:
        print(f"  restaurant_sales.csv : {sales.shape[0]:>7,} rows × {sales.shape[1]} cols")
    else:
        print("  restaurant_sales.csv : not found — skipping")

    return train, meals, centers, sales


# ════════════════════════════════════════════════════════════════════════════
# STEP 2 — Convert week numbers to real calendar dates
# ════════════════════════════════════════════════════════════════════════════
# The dataset uses week=1,2,3... with no anchor date.
# We anchor week 1 to 2019-01-07 (a Monday) — this gives us ~8.7 years of
# weekly data mapped to real calendar dates so sl_context can work on them.

ANCHOR_DATE = pd.Timestamp("2019-01-07")

def week_to_date(week: pd.Series) -> pd.Series:
    return ANCHOR_DATE + pd.to_timedelta((week - 1) * 7, unit="D")


# ════════════════════════════════════════════════════════════════════════════
# STEP 3 — Merge all tables
# ════════════════════════════════════════════════════════════════════════════

def merge_tables(train, meals, centers):
    print("\n── Step 2: Merging tables ──")

    df = train.copy()

    # Join meal info (category, cuisine)
    df = df.merge(meals, on="meal_id", how="left")

    # Join center info (city_code, region_code, center_type, op_area)
    df = df.merge(centers, on="center_id", how="left")

    print(f"  After merge          : {df.shape[0]:>7,} rows × {df.shape[1]} cols")
    print(f"  Null check:\n{df.isnull().sum()[df.isnull().sum() > 0]}")

    return df


# ════════════════════════════════════════════════════════════════════════════
# STEP 4 — Clean + feature engineer
# ════════════════════════════════════════════════════════════════════════════

def clean_and_engineer(df):
    print("\n── Step 3: Cleaning + feature engineering ──")

    # Convert week → date
    df["date"] = week_to_date(df["week"])

    # ── Price features ───────────────────────────────────────────────────────
    # discount = how much below base price the checkout price is
    # A bigger discount → more orders (promo effect)
    df["discount_pct"] = (
        (df["base_price"] - df["checkout_price"]) / df["base_price"].replace(0, np.nan)
    ).fillna(0).clip(lower=0)

    # Is this item on promotion? (either emailer or homepage)
    df["is_promoted"] = (
        (df["emailer_for_promotion"] == 1) | (df["homepage_featured"] == 1)
    ).astype(int)

    # ── Category encoding ────────────────────────────────────────────────────
    # One-hot encode meal category and cuisine for the ML model
    df = pd.get_dummies(df, columns=["category", "cuisine"], prefix=["cat", "cui"], dtype=int)

    # ── Center type encoding ─────────────────────────────────────────────────
    df["center_type_code"] = df["center_type"].map(
        {"TYPE_A": 0, "TYPE_B": 1, "TYPE_C": 2}
    ).fillna(0).astype(int)

    # ── Lag features (previous weeks' orders for same meal+center) ───────────
    # This is the most powerful feature — past demand predicts future demand.
    print("  Building lag features (this takes ~20 seconds)...")
    df = df.sort_values(["center_id", "meal_id", "week"]).reset_index(drop=True)

    group = df.groupby(["center_id", "meal_id"])["num_orders"]

    df["lag_1"]  = group.shift(1)
    df["lag_2"]  = group.shift(2)
    df["lag_4"]  = group.shift(4)

    # Rolling averages — use transform so the index stays aligned with df
    df["roll_4"] = (
        df.groupby(["center_id", "meal_id"])["num_orders"]
        .transform(lambda x: x.shift(1).rolling(4).mean())
    )
    df["roll_8"] = (
        df.groupby(["center_id", "meal_id"])["num_orders"]
        .transform(lambda x: x.shift(1).rolling(8).mean())
    )

    # Fill NaN lags with the item's mean (only affects very early weeks)
    for col in ["lag_1", "lag_2", "lag_4", "roll_4", "roll_8"]:
        df[col] = df[col].fillna(df.groupby("meal_id")[col].transform("mean"))

    print(f"  After feature eng    : {df.shape[0]:>7,} rows × {df.shape[1]} cols")

    return df


# ════════════════════════════════════════════════════════════════════════════
# STEP 5 — Sri Lankan context enrichment
# ════════════════════════════════════════════════════════════════════════════

def add_sl_context(df):
    print("\n── Step 4: Adding Sri Lankan context ──")
    df = enrich(df, date_col="date")
    print(f"  SL features added    : is_poya, monsoon_type, demand_modifier, ...")
    return df


# ════════════════════════════════════════════════════════════════════════════
# STEP 6 — Final feature selection
# ════════════════════════════════════════════════════════════════════════════
# Only keep columns the model will actually use.
# Drop IDs, raw strings, and intermediate columns.

BASE_FEATURES = [
    # Time
    "week", "day_of_week", "is_weekend",
    # Price
    "checkout_price", "base_price", "discount_pct",
    # Promotions
    "is_promoted", "emailer_for_promotion", "homepage_featured",
    # Center
    "center_type_code", "op_area", "city_code", "region_code",
    # Lag / rolling
    "lag_1", "lag_2", "lag_4", "roll_4", "roll_8",
    # Sri Lankan context
    "is_poya", "is_public_holiday", "monsoon_intensity",
    "is_school_term", "demand_modifier",
    # Target
    "num_orders",
]

def select_features(df):
    print("\n── Step 5: Selecting final features ──")

    # Add one-hot encoded category and cuisine columns dynamically
    cat_cols = [c for c in df.columns if c.startswith("cat_") or c.startswith("cui_")]
    final_cols = BASE_FEATURES + cat_cols

    # Keep only columns that exist (safety check)
    final_cols = [c for c in final_cols if c in df.columns]

    df_final = df[final_cols + ["date", "center_id", "meal_id"]].copy()

    print(f"  Final feature count  : {len(final_cols)} features + 3 ID cols")
    print(f"  Final shape          : {df_final.shape[0]:>7,} rows × {df_final.shape[1]} cols")

    return df_final


# ════════════════════════════════════════════════════════════════════════════
# STEP 7 — Drop rows with NaN targets or critical features
# ════════════════════════════════════════════════════════════════════════════

def drop_nulls(df):
    before = len(df)
    df = df.dropna(subset=["num_orders", "lag_1", "roll_4"])
    after = len(df)
    print(f"\n── Step 6: Dropped {before - after:,} rows with null targets/lags ──")
    print(f"  Clean rows ready     : {after:,}")
    return df


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 52)
    print("  Forqast — Preprocessing Pipeline")
    print("=" * 52)

    train, meals, centers, sales = load_raw()
    df = merge_tables(train, meals, centers)
    df = clean_and_engineer(df)
    df = add_sl_context(df)
    df = select_features(df)
    df = drop_nulls(df)

    # Save
    out_path = OUT_DIR / "forqast_training_data.csv"
    df.to_csv(out_path, index=False)

    print("\n" + "=" * 52)
    print(f"  ✓ Saved → {out_path}")
    print(f"  ✓ {len(df):,} training rows ready")
    print(f"  ✓ {df.shape[1]} total columns")
    print("=" * 52)

    # Quick sanity check
    print("\n── Sample output (3 rows) ──")
    print(df[["date", "meal_id", "checkout_price", "is_poya",
              "monsoon_intensity", "demand_modifier", "lag_1",
              "num_orders"]].head(3).to_string(index=False))

    print("\n── Target distribution ──")
    print(df["num_orders"].describe().round(2).to_string())


if __name__ == "__main__":
    main()