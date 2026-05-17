# Forqast 🍴
### AI-Powered Demand Forecasting for Sri Lankan Restaurants

> Built for Sysco LABS — helping Sri Lankan restaurant owners reduce food waste and order smarter using machine learning.

---

## What it does

Forqast predicts daily dish demand for restaurants by combining:
- **XGBoost demand forecasting** trained on 456,000+ real restaurant transactions
- **Sri Lankan context layer** — astronomically computed Poya days, monsoon seasons, public holidays, and local events
- **7-day lookahead** with per-dish order recommendations and waste reduction scores
- **Cost savings estimates** in LKR based on reduced over-ordering

---

## Project structure

```
forqast/
├── data/
│   ├── sl_context.py        # Sri Lankan enrichment layer (Poya, monsoon, holidays)
│   ├── preprocess.py        # Data cleaning + feature engineering pipeline
│   └── raw/                 # Raw datasets (not committed — see Data Setup)
├── model/
│   ├── train.py             # XGBoost training pipeline
│   ├── predict.py           # Inference engine + recommendation generator
│   ├── feature_list.json    # Feature schema from training
│   └── training_report.txt  # Model metrics + feature importance
├── backend/                 # FastAPI REST API (Phase 3)
├── frontend/                # React dashboard (Phase 4)
├── requirements.txt
└── .env.example
```

---

## Quick start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Data setup
Download these datasets from Kaggle and place in `data/raw/`:
- [Food Demand Forecasting](https://www.kaggle.com/datasets/kannanaikkal/food-demand-forecasting) → `train.csv`, `meal_info.csv`, `fulfilment_center_info.csv`

### 3. Set environment variables (optional)
```bash
cp .env.example .env
# Add your Calendarific API key for live Sri Lankan public holidays
# Sign up free at https://calendarific.com
```

### 4. Run preprocessing
```bash
python data/preprocess.py
```

### 5. Train the model
```bash
python model/train.py
```

### 6. Test predictions
```bash
python model/predict.py
```

---

## Model performance

| Metric | Value |
|--------|-------|
| MAE | 68.21 orders |
| RMSE | 162.82 orders |
| MAPE | 43.47% |
| Waste Score | 56.5 / 100 |
| Est. weekly savings | LKR 28,474 |

---

## Sri Lankan context features

| Feature | Source | Method |
|---------|--------|--------|
| Poya days | Astronomical computation | `ephem` library — full moon in UTC+5:30 |
| Public holidays | Calendarific API | Live fetch, cached to disk |
| Monsoon intensity | Dept. of Meteorology SL | Monthly index (0–1 scale) |
| School terms | Ministry of Education SL | Term calendar approximation |
| Local events | Manual override via UI | Restaurant owner input |

---

## Tech stack

- **ML**: XGBoost, scikit-learn, pandas, numpy
- **Context**: ephem (astronomy), Calendarific API
- **Backend**: FastAPI, uvicorn
- **Frontend**: React, Tailwind CSS, Recharts

---

## Why Forqast?

Food waste is a LKR 2.3 billion annual problem for Sri Lankan SME restaurants.
Forqast gives every restaurant owner — not just large chains — access to the same
demand intelligence that Sysco uses globally, localised for the Sri Lankan market.

---

