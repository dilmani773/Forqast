# Forqast 🍴
### AI-Powered Demand Forecasting for Sri Lankan Restaurants

> Build to help Sri Lankan restaurant owners reduce food waste and order smarter using machine learning.

---

## What it does

Forqast predicts daily dish demand for restaurants by combining an XGBoost forecasting model trained on 456,000+ real restaurant transactions with a Sri Lankan context layer that no global tool has — astronomically computed Poya days, monsoon seasons, public holidays, and a restaurant owner's own calendar for Eid, Deepavali, Ramadan, weddings, and promotions.

A restaurant owner uploads their past sales CSV, sets prices once, and gets a 7-day forecast for every dish on their menu. They can download a full kitchen order sheet or send tomorrow's prep list to their team on WhatsApp in one click.

---

## Key features

- **7-day demand forecast** per dish using XGBoost with lag features, rolling averages, and Sri Lankan context
- **Poya day detection** — computed astronomically via the `ephem` library (UTC+5:30), accurate for any year
- **Monsoon awareness** — southwest and northeast monsoon intensity by month based on Dept. of Meteorology data
- **Inclusive holiday support** — Ramadan Mode for Muslim restaurants (full 30-day demand adjustment), Eid, Deepavali, Christmas, Good Friday, Avurudu — owner sets exact dates, nothing is hardcoded
- **Custom restaurant calendar** — mark promotions, weddings, school events, any special day with custom demand boost
- **Plan All Dishes** — forecast entire menu at once from a single CSV upload
- **Export & WhatsApp share** — full kitchen report as .txt or one-tap WhatsApp message to kitchen staff
- **Waste reduction score** per dish based on demand stability (coefficient of variation)
- **Auto-saved settings** — localStorage persistence so setup survives browser restarts
- **Real lag features** — actual weekly sales from uploaded CSV used directly in model inference

---

## Tech stack

| Layer | Technology |
|---|---|
| ML model | XGBoost, scikit-learn, pandas, numpy |
| Context engine | ephem (astronomy), Calendarific API |
| Backend | FastAPI, uvicorn, Python 3.13 |
| Frontend | React 18, Vite, Recharts |

---

## Project structure

```
forqast/
├── data/
│   ├── sl_context.py        # Sri Lankan enrichment layer
│   └── preprocess.py        # Data pipeline (456k rows, 42 features)
├── model/
│   ├── train.py             # XGBoost training pipeline
│   ├── predict.py           # Inference engine + recommendation generator
│   ├── feature_list.json    # Feature schema from training
│   └── training_report.txt  # Model metrics
├── backend/
│   ├── main.py              # FastAPI app
│   ├── routes/predict.py    # POST /api/predict
│   └── routes/upload.py     # POST /api/upload-sales
├── frontend/
│   └── src/
│       ├── pages/Dashboard.jsx    # Main forecast view
│       ├── pages/MenuSetup.jsx    # Upload + price editor
│       └── components/            # Chart, gauge, calendar, alerts
├── requirements.txt
└── .env.example
```

---

## Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Download datasets from Kaggle (see Data Setup below)
# 3. Run preprocessing
python data/preprocess.py

# 4. Train the model
python model/train.py

# 5. Start the API
uvicorn backend.main:app --reload --port 8000

# 6. Start the frontend
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`

---

## Data setup

Download from Kaggle and place in `data/raw/`:
- [Food Demand Forecasting](https://www.kaggle.com/datasets/kannanaikkal/food-demand-forecasting) → `train.csv`, `meal_info.csv`, `fulfilment_center_info.csv`

Optional — for live Sri Lankan public holidays:
```bash
# Sign up free at https://calendarific.com
echo "CALENDARIFIC_API_KEY=your_key" > .env
```

---

## Model performance

| Metric | Value |
|---|---|
| MAE | 68.21 orders |
| RMSE | 162.82 orders |
| MAPE | 43.47% |
| Waste Score | 56.5 / 100 |
| Best iteration | 389 / 1000 |
| Training rows | 407,243 |

The MAPE figure reflects the wide demand range in the dataset (13 to 24,299 orders). MAE of 68 on a mean of 261 is operationally accurate for kitchen planning. The Sri Lankan context layer further adjusts predictions using local signals that are absent from the training data.

---

## Why this exists

Food waste is an environmental and economic crisis for Sri Lankan SME restaurants. Most demand forecasting tools are built for Western markets — they have no concept of Poya days, the southwest monsoon, or Ramadan affecting a Muslim restaurant's entire month. Forqast is built from the ground up for the Sri Lankan context, covering Buddhist, Hindu, Muslim, and Christian communities equally.

---

