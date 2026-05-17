"""
Forqast — XGBoost Demand Forecasting Model
==========================================
Trains an XGBoost model on the preprocessed dataset.
Uses log-transform on target to handle the wide demand range.
Saves the trained model + feature list to disk.

Run:
    python model/train.py

Output:
    model/forqast_model.pkl
    model/feature_list.json
    model/training_report.txt
"""

import json
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error
import xgboost as xgb

# ── PATHS ─────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
DATA_PATH  = ROOT / "data" / "processed" / "forqast_training_data.csv"
MODEL_DIR  = Path(__file__).parent
MODEL_PATH = MODEL_DIR / "forqast_model.pkl"
FEAT_PATH  = MODEL_DIR / "feature_list.json"
REPORT     = MODEL_DIR / "training_report.txt"


# ════════════════════════════════════════════════════════════════════════════
# 1. LOAD DATA
# ════════════════════════════════════════════════════════════════════════════

def load_data():
    print("── Step 1: Loading training data ──")
    df = pd.read_csv(DATA_PATH, parse_dates=["date"])
    print(f"  Rows: {len(df):,}  |  Cols: {df.shape[1]}")
    return df


# ════════════════════════════════════════════════════════════════════════════
# 2. FEATURE SELECTION
# ════════════════════════════════════════════════════════════════════════════
# Exclude ID cols and non-numeric context strings from features.
# The model only sees numbers.

EXCLUDE_COLS = {
    "date", "center_id", "meal_id",       # IDs
    "num_orders",                          # target
    "monsoon_type", "holiday_name",        # string cols (already encoded)
    "local_event",
}

def get_features(df: pd.DataFrame) -> list:
    features = [c for c in df.columns if c not in EXCLUDE_COLS]
    # Convert booleans to int (XGBoost needs numeric)
    bool_cols = df[features].select_dtypes(include="bool").columns.tolist()
    return features, bool_cols


# ════════════════════════════════════════════════════════════════════════════
# 3. TRAIN / VALIDATION SPLIT
# ════════════════════════════════════════════════════════════════════════════
# For time series we NEVER shuffle. We split chronologically:
#   Train  : all weeks up to week 120  (~85%)
#   Val    : weeks 121–145             (~15%)
# This mirrors real deployment: model sees past, predicts future.

TRAIN_CUTOFF_WEEK = 130

def split_data(df, features, bool_cols):
    print(f"\n── Step 2: Train/val split (cutoff week {TRAIN_CUTOFF_WEEK}) ──")

    train_df = df[df["week"] <= TRAIN_CUTOFF_WEEK].copy()
    val_df   = df[df["week"] >  TRAIN_CUTOFF_WEEK].copy()

    # Convert booleans to int
    for split in [train_df, val_df]:
        split[bool_cols] = split[bool_cols].astype(int)

    X_train = train_df[features]
    X_val   = val_df[features]

    # Log-transform target — handles the wide range (13 to 24,299)
    # We predict log(1 + orders), then exponentiate at inference time
    y_train = np.log1p(train_df["num_orders"])
    y_val   = np.log1p(val_df["num_orders"])

    # Keep raw for evaluation
    y_val_raw = val_df["num_orders"]

    print(f"  Train rows : {len(X_train):>7,}  (weeks 1–{TRAIN_CUTOFF_WEEK})")
    print(f"  Val rows   : {len(X_val):>7,}  (weeks {TRAIN_CUTOFF_WEEK+1}+)")

    return X_train, X_val, y_train, y_val, y_val_raw


# ════════════════════════════════════════════════════════════════════════════
# 4. TRAIN MODEL
# ════════════════════════════════════════════════════════════════════════════

XGBOOST_PARAMS = {
    "n_estimators":      1000,
    "max_depth":         8,
    "learning_rate":     0.03,
    "subsample":         0.8,
    "colsample_bytree":  0.7,
    "min_child_weight":  3,
    "reg_alpha":         0.05,
    "reg_lambda":        1.5,
    "objective":         "reg:squarederror",
    "random_state":      42,
    "n_jobs":            -1,
    "early_stopping_rounds": 50,
}

def train_model(X_train, X_val, y_train, y_val):
    print("\n── Step 3: Training XGBoost model ──")
    print(f"  Features   : {X_train.shape[1]}")
    print(f"  Estimators : {XGBOOST_PARAMS['n_estimators']} (early stop @ {XGBOOST_PARAMS['early_stopping_rounds']})")

    model = xgb.XGBRegressor(**XGBOOST_PARAMS)

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=50,   # print every 50 rounds
    )

    print(f"\n  Best iteration : {model.best_iteration}")
    return model


# ════════════════════════════════════════════════════════════════════════════
# 5. EVALUATE
# ════════════════════════════════════════════════════════════════════════════

def evaluate(model, X_val, y_val_raw):
    print("\n── Step 4: Evaluation ──")

    # Predict in log space, inverse-transform back to order counts
    y_pred_log = model.predict(X_val)
    y_pred     = np.expm1(y_pred_log).clip(min=0)
    y_true     = y_val_raw.values

    mae  = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mape = np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1))) * 100

    # Waste reduction score (0–100)
    # Measures how close our predictions are to actual —
    # closer = less over-ordering = less waste
    waste_score = max(0, 100 - mape)

    print(f"  MAE          : {mae:.2f}  orders")
    print(f"  RMSE         : {rmse:.2f}  orders")
    print(f"  MAPE         : {mape:.2f}%")
    print(f"  Waste Score  : {waste_score:.1f} / 100")

    # Cost savings estimate
    # Assume avg dish cost = LKR 200, avg over-order without model = 20%
    avg_cost_lkr    = 200
    baseline_waste  = 0.20
    model_waste     = mape / 100
    savings_pct     = max(0, baseline_waste - model_waste)
    mean_daily_orders = y_val_raw.mean()
    est_daily_savings = mean_daily_orders * savings_pct * avg_cost_lkr

    print(f"\n  Estimated daily waste savings : LKR {est_daily_savings:,.0f}")
    print(f"  (Assuming LKR {avg_cost_lkr} avg cost/dish, baseline {baseline_waste*100:.0f}% waste)")

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2),
        "waste_score": round(waste_score, 1),
        "est_daily_savings_lkr": round(est_daily_savings, 0),
        "best_iteration": model.best_iteration,
        "n_features": X_val.shape[1],
        "trained_at": datetime.now().isoformat(),
    }


# ════════════════════════════════════════════════════════════════════════════
# 6. FEATURE IMPORTANCE
# ════════════════════════════════════════════════════════════════════════════

def print_feature_importance(model, features, top_n=15):
    print(f"\n── Top {top_n} most important features ──")
    importance = pd.Series(
        model.feature_importances_,
        index=features
    ).sort_values(ascending=False)

    for feat, score in importance.head(top_n).items():
        bar = "|" * int(score * 200)
        print(f"  {feat:<30} {score:.4f}  {bar}")

    return importance


# ════════════════════════════════════════════════════════════════════════════
# 7. SAVE MODEL + ARTIFACTS
# ════════════════════════════════════════════════════════════════════════════

def save_artifacts(model, features, metrics, importance):
    print("\n── Step 6: Saving artifacts ──")

    # Save model
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    print(f"  ✓ Model saved    → {MODEL_PATH}")

    # Save feature list (predict.py needs this to build input correctly)
    with open(FEAT_PATH, "w") as f:
        json.dump(features, f, indent=2)
    print(f"  ✓ Features saved → {FEAT_PATH}")

    # Save training report
    report_lines = [
        "Forqast — Training Report",
        "=" * 40,
        f"Trained at     : {metrics['trained_at']}",
        f"Features       : {metrics['n_features']}",
        f"Best iteration : {metrics['best_iteration']}",
        "",
        "── Model Performance ──",
        f"MAE            : {metrics['mae']} orders",
        f"RMSE           : {metrics['rmse']} orders",
        f"MAPE           : {metrics['mape']}%",
        f"Waste Score    : {metrics['waste_score']} / 100",
        "",
        "── Business Impact ──",
        f"Est. daily savings : LKR {metrics['est_daily_savings_lkr']:,.0f}",
        "",
        "── Top 15 Features ──",
    ]
    for feat, score in importance.head(15).items():
        report_lines.append(f"  {feat:<30} {score:.4f}")

    REPORT.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"  ✓ Report saved   → {REPORT}")


# ════════════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 52)
    print("  Forqast — XGBoost Training Pipeline")
    print("=" * 52)

    df                              = load_data()
    features, bool_cols             = get_features(df)
    X_train, X_val, y_train, y_val, y_val_raw = split_data(df, features, bool_cols)
    model                           = train_model(X_train, X_val, y_train, y_val)
    metrics                         = evaluate(model, X_val, y_val_raw)
    importance                      = print_feature_importance(model, features)
    save_artifacts(model, features, metrics, importance)

    print("\n" + "=" * 52)
    print("  ✓ Phase 2 complete — model trained and saved")
    print("=" * 52)


if __name__ == "__main__":
    main()