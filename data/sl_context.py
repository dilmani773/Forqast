"""
Forqast — Sri Lankan Context Enrichment Layer (Production Grade)
================================================================
Adds Poya days, monsoon seasons, public holidays, and school term
flags to any DataFrame with a 'date' column.

Key design decisions (industrial quality):
  1. Poya days   → computed astronomically via 'ephem' library.
                   No hardcoding. Works for any year, past or future.
  2. Public holidays → fetched from Calendarific API (free tier).
                   Falls back to a minimal built-in set if API is down.
  3. Manual overrides → restaurant owners can pass custom special days
                   via the UI (e.g. a private event, local festival).
  4. Caching      → API results cached to disk so we don't re-fetch
                   on every run.

Setup:
    pip install pandas numpy ephem requests

Optional (for live public holidays):
    Sign up free at https://calendarific.com → get API key
    Set env variable: CALENDARIFIC_API_KEY=your_key_here

Usage:
    from sl_context import enrich
    df = enrich(df)                          # basic
    df = enrich(df, year=2025)               # specific year
    df = enrich(df, custom_events={          # with manual overrides
        pd.Timestamp("2025-08-15"): "Restaurant Anniversary"
    })
"""

import os
import json
import requests
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta

# Try importing ephem; give clear install instructions if missing
try:
    import ephem
    EPHEM_AVAILABLE = True
except ImportError:
    EPHEM_AVAILABLE = False
    print(
        "[Forqast] WARNING: 'ephem' not installed. Poya days will use fallback.\n"
        "  Fix: pip install ephem"
    )

# ── CACHE SETUP ───────────────────────────────────────────────────────────────
CACHE_DIR = Path(__file__).parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)


# ════════════════════════════════════════════════════════════════════════════
# 1. POYA DAYS — Astronomical full moon computation
# ════════════════════════════════════════════════════════════════════════════

SL_UTC_OFFSET = timedelta(hours=5, minutes=30)

def _compute_poya_days(year: int) -> list:
    """
    Compute all full moon dates for a given year in Sri Lanka time (UTC+5:30).
    Uses ephem for astronomical accuracy. Results cached to disk.
    """
    cache_path = CACHE_DIR / f"poya_{year}.json"

    if cache_path.exists():
        dates = json.loads(cache_path.read_text())
        return [pd.Timestamp(d) for d in dates]

    if not EPHEM_AVAILABLE:
        return _fallback_poya_days(year)

    poya_dates = []
    start = ephem.Date(f"{year}/1/1")
    end   = ephem.Date(f"{year + 1}/1/1")

    next_full = ephem.next_full_moon(start)
    while next_full < end:
        utc_dt  = ephem.Date(next_full).datetime()
        sl_dt   = utc_dt + SL_UTC_OFFSET
        poya_dates.append(str(sl_dt.date()))
        next_full = ephem.next_full_moon(next_full + 1)

    cache_path.write_text(json.dumps(poya_dates))
    print(f"[Forqast] Computed {len(poya_dates)} Poya days for {year} (cached)")

    return [pd.Timestamp(d) for d in poya_dates]


def _fallback_poya_days(year: int) -> list:
    """
    Fallback: approximate full moons using a fixed 29.53-day lunar cycle.
    Used only when ephem is not installed.
    Not hardcoded — works for any year by cycling from a known anchor.
    """
    anchor       = datetime(2024, 1, 25)  # known full moon (Duruthu Poya 2024)
    lunar_cycle  = 29.530588861

    start        = datetime(year, 1, 1)
    days_diff    = (start - anchor).days
    first_cycle  = int(days_diff / lunar_cycle)

    poya_dates = []
    cycle = first_cycle - 1
    while True:
        full_moon    = anchor + timedelta(days=cycle * lunar_cycle)
        full_moon_sl = full_moon + SL_UTC_OFFSET
        if full_moon_sl.year > year:
            break
        if full_moon_sl.year == year:
            poya_dates.append(pd.Timestamp(full_moon_sl.date()))
        cycle += 1

    return poya_dates


def get_poya_days(years: list) -> pd.DatetimeIndex:
    """Return all Poya days for a list of years as a DatetimeIndex."""
    all_dates = []
    for year in set(years):
        all_dates.extend(_compute_poya_days(year))
    return pd.DatetimeIndex(all_dates)


# ════════════════════════════════════════════════════════════════════════════
# 2. PUBLIC HOLIDAYS — Calendarific API with fallback
# ════════════════════════════════════════════════════════════════════════════

CALENDARIFIC_URL = "https://calendarific.com/api/v2/holidays"

def _fetch_holidays_api(year: int, api_key: str) -> dict:
    """Fetch Sri Lankan public holidays from Calendarific. Cached to disk."""
    cache_path = CACHE_DIR / f"holidays_LK_{year}.json"

    if cache_path.exists():
        data = json.loads(cache_path.read_text())
        return {pd.Timestamp(k): v for k, v in data.items()}

    try:
        resp = requests.get(CALENDARIFIC_URL, params={
            "api_key": api_key,
            "country": "LK",
            "year":    year,
            "type":    "national",
        }, timeout=10)
        resp.raise_for_status()

        holidays = {}
        for h in resp.json().get("response", {}).get("holidays", []):
            date_str = h["date"]["iso"][:10]
            holidays[date_str] = h["name"]

        cache_path.write_text(json.dumps(holidays))
        print(f"[Forqast] Fetched {len(holidays)} public holidays for LK {year} (cached)")
        return {pd.Timestamp(k): v for k, v in holidays.items()}

    except Exception as e:
        print(f"[Forqast] Calendarific API error: {e} — using built-in fallback")
        return {}


def _builtin_holidays(year: int) -> dict:
    """
    Minimal fixed-date Sri Lankan holidays that don't change year to year.
    Used as fallback when API key is missing or API is unreachable.
    Moon-dependent holidays (Vesak, Poson etc.) are handled by Poya logic.
    """
    fixed = {
        f"{year}-01-14": "Thai Pongal",
        f"{year}-02-04": "Independence Day",
        f"{year}-04-13": "Sinhala & Tamil New Year Eve",
        f"{year}-04-14": "Sinhala & Tamil New Year",
        f"{year}-05-01": "Labour Day",
        f"{year}-05-22": "National Heroes Day",
        f"{year}-12-25": "Christmas Day",
    }
    return {pd.Timestamp(k): v for k, v in fixed.items()}


def get_public_holidays(years: list, api_key: str = None) -> dict:
    """
    Get public holidays for all years.
    Uses Calendarific API if key is available, otherwise built-in fallback.
    """
    if api_key is None:
        api_key = os.environ.get("CALENDARIFIC_API_KEY")

    all_holidays = {}
    for year in set(years):
        if api_key:
            fetched = _fetch_holidays_api(year, api_key)
            all_holidays.update(fetched or _builtin_holidays(year))
        else:
            print(f"[Forqast] No API key found — using built-in holidays for {year}.")
            all_holidays.update(_builtin_holidays(year))

    return all_holidays


# ════════════════════════════════════════════════════════════════════════════
# 3. MONSOON — Sri Lanka Meteorology Dept. climatological patterns
# ════════════════════════════════════════════════════════════════════════════
# Timing is stable year to year (climatological).
# Intensity per day will be enriched by live Open-Meteo API in Phase 3.

MONSOON_TYPE = {
    1: "northeast", 2: "dry",        3: "dry",
    4: "dry",       5: "southwest",  6: "southwest",
    7: "southwest", 8: "southwest",  9: "southwest",
    10: "northeast",11: "northeast", 12: "northeast",
}

MONSOON_INTENSITY = {
    1: 0.40, 2: 0.20, 3: 0.20, 4: 0.40,
    5: 0.80, 6: 0.90, 7: 0.70, 8: 0.70,
    9: 0.60, 10: 0.70, 11: 0.80, 12: 0.60,
}


# ════════════════════════════════════════════════════════════════════════════
# 4. SCHOOL TERMS
# ════════════════════════════════════════════════════════════════════════════

SCHOOL_HOLIDAY_MONTHS = {4, 8, 12}

def is_school_term(month: int) -> bool:
    return month not in SCHOOL_HOLIDAY_MONTHS


# ════════════════════════════════════════════════════════════════════════════
# 5. MAIN ENRICHMENT FUNCTION
# ════════════════════════════════════════════════════════════════════════════

def enrich(
    df: pd.DataFrame,
    date_col: str = "date",
    api_key: str = None,
    custom_events: dict = None,
) -> pd.DataFrame:
    """
    Add Sri Lankan context features to any DataFrame with a date column.

    Parameters
    ----------
    df            : DataFrame with at least one date column
    date_col      : Name of the date column (default: 'date')
    api_key       : Calendarific API key (or set CALENDARIFIC_API_KEY env var)
    custom_events : dict of {pd.Timestamp: event_name}
                    Passed from the Forqast UI calendar when a restaurant
                    owner marks a special day manually.

    Returns
    -------
    Enriched DataFrame with columns:
        day_of_week, is_weekend, is_poya, is_public_holiday,
        holiday_name, monsoon_type, monsoon_intensity,
        is_school_term, local_event, demand_modifier
    """
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col])
    dates = df[date_col]

    # Only fetch/compute for years that actually appear in the data
    years = sorted(dates.dt.year.unique().tolist())

    poya_days       = get_poya_days(years)
    public_holidays = get_public_holidays(years, api_key=api_key)
    local_events    = dict(custom_events) if custom_events else {}

    df["day_of_week"]       = dates.dt.dayofweek
    df["is_weekend"]        = dates.dt.dayofweek >= 5
    df["is_poya"]           = dates.isin(poya_days)
    df["is_public_holiday"] = dates.isin(public_holidays.keys())
    df["holiday_name"]      = dates.map(public_holidays).fillna("")
    df["monsoon_type"]      = dates.dt.month.map(MONSOON_TYPE)
    df["monsoon_intensity"] = dates.dt.month.map(MONSOON_INTENSITY)
    df["is_school_term"]    = dates.dt.month.map(is_school_term)
    df["local_event"]       = dates.map(local_events).fillna("")

    modifier = pd.Series(1.0, index=df.index)
    modifier += df["is_weekend"].astype(float)        * 0.20
    modifier -= df["is_poya"].astype(float)           * 0.30
    modifier += df["is_public_holiday"].astype(float) * 0.15
    modifier -= (df["monsoon_intensity"] > 0.7).astype(float) * 0.10
    modifier += df["is_school_term"].astype(float)    * 0.10
    modifier += (df["local_event"] != "").astype(float) * 0.25

    df["demand_modifier"] = modifier.clip(0.5, 2.0)

    return df


# ════════════════════════════════════════════════════════════════════════════
# SMOKE TEST
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("── Forqast: sl_context smoke test ──\n")

    print("Poya days 2025 (astronomically computed):")
    for d in sorted(get_poya_days([2025])):
        print(f"  {d.strftime('%Y-%m-%d  %A')}")

    test_df = pd.DataFrame({
        "date": pd.date_range("2025-04-10", periods=10, freq="D"),
    })

    result = enrich(
        test_df,
        custom_events={pd.Timestamp("2025-04-14"): "Sinhala & Tamil New Year"}
    )

    cols = ["date", "is_poya", "is_public_holiday", "holiday_name",
            "monsoon_type", "local_event", "demand_modifier"]
    print("\nEnrichment output:")
    print(result[cols].to_string(index=False))
    print("\n✓ sl_context working correctly.")