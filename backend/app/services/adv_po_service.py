"""
adv_po_service.py — Advanced Purchase Order Rule Engine (Phase 1.5)

Flow:
  1. Fetch tomorrow's weather from OpenWeatherMap for branch lat/lng
  2. Load matching weather rules for branch's categories
  3. Load active occasions for branch that overlap with PO date
  4. Calculate 30-day average qty per item from order_item (POS sales)
  5. Apply multipliers → save to adv_po_suggestion
  6. Phase 1.5: compute accuracy after fact, recommend rule corrections
"""

import json
import math
import logging
from datetime import date, datetime, timedelta
from typing import Optional

import requests
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.inventory_models import (
    AdvWeatherRule, AdvOccasion, AdvOccasionRule, AdvBranchOccasion,
    AdvPoSuggestion, AdvAccuracyLog, InventoryItem, ItemCategory,
)
from app.models.company_model import Company

logger = logging.getLogger(__name__)

import os
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")   # openweathermap.org free tier
OPENWEATHER_URL     = "https://api.openweathermap.org/data/2.5/forecast"


# ── Occasion helpers ──────────────────────────────────────────
def _occasions_active_on(db: Session, company_id: int, target_date: date) -> list[AdvOccasion]:
    """Return occasions the branch opted in + active on/around target_date."""
    branch_occ_ids = [
        r.occasion_id for r in
        db.query(AdvBranchOccasion)
          .filter_by(company_unique_id=company_id, is_active=True).all()
    ]
    if not branch_occ_ids:
        return []

    occasions = db.query(AdvOccasion).filter(
        AdvOccasion.occasion_id.in_(branch_occ_ids),
        AdvOccasion.is_active == True,
        AdvOccasion.month.isnot(None),
        AdvOccasion.day.isnot(None),
    ).all()

    active = []
    for occ in occasions:
        try:
            occ_date = date(target_date.year, occ.month, occ.day)
        except ValueError:
            continue
        window_start = occ_date - timedelta(days=occ.days_before)
        window_end   = occ_date + timedelta(days=occ.days_after)
        if window_start <= target_date <= window_end:
            active.append(occ)
    return active


def _occasion_multiplier_for_category(db: Session, occasion_ids: list[int], category_id: int) -> float:
    """Combine multipliers for all active occasions for a category (product of all)."""
    if not occasion_ids or not category_id:
        return 1.0
    rules = db.query(AdvOccasionRule).filter(
        AdvOccasionRule.occasion_id.in_(occasion_ids),
        AdvOccasionRule.item_category_id == category_id,
        AdvOccasionRule.is_active == True,
    ).all()
    result = 1.0
    for r in rules:
        result *= float(r.multiplier)
    return round(result, 3)


# ── Weather helpers ───────────────────────────────────────────
def _get_latlong(db: Session, company_id: int) -> tuple[float, float] | None:
    company = db.query(Company).filter_by(company_unique_id=company_id).first()
    if not company or not company.latlong:
        return None
    try:
        parts = str(company.latlong).replace("(", "").replace(")", "").split(",")
        return float(parts[0].strip()), float(parts[1].strip())
    except Exception:
        return None


def fetch_weather(lat: float, lng: float) -> dict:
    """Fetch tomorrow's weather forecast. Returns dict with temp, rain_prob."""
    try:
        url = f"{OPENWEATHER_URL}?lat={lat}&lon={lng}&appid={OPENWEATHER_API_KEY}&units=metric&cnt=8"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        # Get tomorrow's daytime forecast (entry closest to noon tomorrow)
        tomorrow = date.today() + timedelta(days=1)
        best = None
        for entry in data.get("list", []):
            dt = datetime.fromtimestamp(entry["dt"])
            if dt.date() == tomorrow:
                if best is None or abs(dt.hour - 12) < abs(best["_hour"] - 12):
                    best = {
                        "temp":      entry["main"]["temp"],
                        "feels_like":entry["main"]["feels_like"],
                        "humidity":  entry["main"]["humidity"],
                        "condition": entry["weather"][0]["main"].lower() if entry.get("weather") else "",
                        "rain_prob": entry.get("pop", 0),   # probability of precipitation 0-1
                        "_hour":     dt.hour,
                        "date":      str(tomorrow),
                    }
        return best or {"temp": 30, "rain_prob": 0, "condition": "clear", "date": str(tomorrow)}
    except Exception as e:
        logger.warning(f"Weather fetch failed: {e}")
        return {"temp": 30, "rain_prob": 0, "condition": "clear", "date": str(date.today() + timedelta(days=1))}


def _weather_condition(weather: dict) -> str:
    """Classify weather into hot | rain | cold | normal."""
    temp      = weather.get("temp", 30)
    rain_prob = weather.get("rain_prob", 0)
    if rain_prob >= 0.5:
        return "rain"
    if temp > 35:
        return "hot"
    if temp < 15:
        return "cold"
    return "normal"


def _weather_multiplier_for_category(db: Session, company_id: int, weather: dict, category_id: int) -> float:
    """Find best matching weather rule for this category."""
    temp      = weather.get("temp", 30)
    rain_prob = weather.get("rain_prob", 0)
    condition = _weather_condition(weather)

    rules = db.query(AdvWeatherRule).filter_by(
        company_unique_id=company_id,
        is_active=True,
    ).filter(
        AdvWeatherRule.item_category_id == category_id,
        AdvWeatherRule.condition == condition,
    ).all()

    best = None
    for r in rules:
        # Check temp bounds
        t_min = float(r.temp_min) if r.temp_min is not None else -999
        t_max = float(r.temp_max) if r.temp_max is not None else 999
        if not (t_min <= temp <= t_max):
            continue
        # Check rain threshold
        if r.rain_threshold is not None and rain_prob < float(r.rain_threshold):
            continue
        best = r
        break

    return float(best.multiplier) if best else 1.0


# ── 30-day avg from POS order_item ───────────────────────────
def _get_30day_avg(db: Session, company_id: int, node_id: int, item_id: int, ref_date: date) -> float:
    """
    Average daily quantity sold for item_id over last 30 days.
    Joins order_item → foodmenu (food_menu_id) → inv_recipe_ingredient → inv_item
    OR directly via food_menu_id if item is directly on menu.

    Simpler approach: use inv_stock_consumption as proxy for ingredient usage,
    which is more accurate for inventory items than POS items.
    """
    since = ref_date - timedelta(days=30)

    # Primary: use stock consumption as 30-day proxy
    result = db.execute(text("""
        SELECT COALESCE(SUM(sci.qty_consumed), 0) / 30.0 as daily_avg
        FROM inv_stock_consumption sc
        JOIN inv_stock_consumption_item sci ON sci.consumption_id = sc.consumption_id
        WHERE sc.company_unique_id = :cid
          AND sc.node_id = :nid
          AND sci.item_id = :iid
          AND sc.consumption_date >= :since
          AND sc.consumption_date <= :ref_date
    """), {"cid": company_id, "nid": node_id, "iid": item_id, "since": since, "ref_date": ref_date}).fetchone()

    avg = float(result.daily_avg) if result and result.daily_avg else 0.0

    # Fallback: use last PO ordered_qty as base if no consumption data
    if avg == 0.0:
        po_result = db.execute(text("""
            SELECT COALESCE(AVG(poi.ordered_qty), 0) as avg_qty
            FROM inv_purchase_order_item poi
            JOIN inv_purchase_order po ON po.po_id = poi.po_id
            WHERE po.company_unique_id = :cid
              AND po.node_id = :nid
              AND poi.item_id = :iid
              AND po.po_date >= :since
        """), {"cid": company_id, "nid": node_id, "iid": item_id, "since": since}).fetchone()
        avg = float(po_result.avg_qty) if po_result and po_result.avg_qty else 0.0

    return round(avg, 3)


# ── Main: generate suggestions for a PO ──────────────────────
def generate_suggestions(db: Session, company_id: int, node_id: int, po_id: int, po_date: date) -> list[dict]:
    """
    Generate AI quantity suggestions for all items in a PO.
    Returns list of suggestion dicts for frontend display.
    """
    # 1. Fetch weather
    latlong = _get_latlong(db, company_id)
    weather = fetch_weather(*latlong) if latlong else {"temp": 30, "rain_prob": 0, "condition": "clear", "date": str(po_date)}

    # 2. Get active occasions for this branch on this date
    active_occasions = _occasions_active_on(db, company_id, po_date)
    occasion_ids     = [o.occasion_id for o in active_occasions]
    occasion_names   = [o.name for o in active_occasions]

    # 3. Get all items in this PO
    po_items = db.execute(text("""
        SELECT poi.item_id, poi.ordered_qty, poi.unit_price,
               ii.item_name, ii.item_category_id
        FROM inv_purchase_order_item poi
        JOIN inv_item ii ON ii.item_id = poi.item_id
        WHERE poi.po_id = :po_id
    """), {"po_id": po_id}).fetchall()

    suggestions = []
    for row in po_items:
        item_id     = row.item_id
        category_id = row.item_category_id

        # 4. 30-day avg
        base_qty = _get_30day_avg(db, company_id, node_id, item_id, po_date)
        if base_qty == 0:
            base_qty = float(row.ordered_qty or 0)

        # 5. Multipliers
        w_mult = _weather_multiplier_for_category(db, company_id, weather, category_id)
        o_mult = _occasion_multiplier_for_category(db, occasion_ids, category_id)
        final  = round(w_mult * o_mult, 3)
        sugg   = round(base_qty * final, 3)

        # Build reason string
        reason_parts = []
        cond = _weather_condition(weather)
        temp = weather.get("temp", 30)
        rain = weather.get("rain_prob", 0)
        if w_mult != 1.0:
            if cond == "rain":
                reason_parts.append(f"Rain {int(rain*100)}% (×{w_mult})")
            elif cond == "hot":
                reason_parts.append(f"Hot {temp:.0f}°C (×{w_mult})")
            elif cond == "cold":
                reason_parts.append(f"Cold {temp:.0f}°C (×{w_mult})")
        for occ_name in occasion_names:
            reason_parts.append(f"{occ_name} (×{o_mult})")
        reason = " + ".join(reason_parts) if reason_parts else "Normal conditions"

        # 6. Save suggestion
        existing = db.query(AdvPoSuggestion).filter_by(po_id=po_id, item_id=item_id).first()
        if existing:
            existing.base_qty_30d        = base_qty
            existing.weather_multiplier  = w_mult
            existing.occasion_multiplier = o_mult
            existing.final_multiplier    = final
            existing.suggested_qty       = sugg
            existing.reason              = reason
            existing.weather_data        = json.dumps(weather)
            sugg_obj = existing
        else:
            sugg_obj = AdvPoSuggestion(
                company_unique_id  = company_id,
                po_id              = po_id,
                node_id            = node_id,
                item_id            = item_id,
                po_date            = po_date,
                base_qty_30d       = base_qty,
                weather_multiplier = w_mult,
                occasion_multiplier= o_mult,
                final_multiplier   = final,
                suggested_qty      = sugg,
                reason             = reason,
                weather_data       = json.dumps(weather),
            )
            db.add(sugg_obj)

        db.flush()

        suggestions.append({
            "item_id":           item_id,
            "item_name":         row.item_name,
            "unit_price":        float(row.unit_price or 0),
            "base_qty_30d":      base_qty,
            "weather_multiplier":w_mult,
            "occasion_multiplier":o_mult,
            "final_multiplier":  final,
            "suggested_qty":     sugg,
            "normal_qty":        float(row.ordered_qty or 0),
            "reason":            reason,
            "weather":           weather,
            "occasions":         occasion_names,
            "suggestion_id":     sugg_obj.suggestion_id,
        })

    db.commit()
    return suggestions


def accept_suggestions(db: Session, po_id: int, accepted: list[dict]) -> None:
    """Save manager's accepted quantities back to suggestions."""
    for a in accepted:
        sugg = db.query(AdvPoSuggestion).filter_by(
            po_id=po_id, item_id=a["item_id"]
        ).first()
        if sugg:
            sugg.accepted_qty = a["accepted_qty"]
    db.commit()


# ── Phase 1.5: accuracy & recommendations ────────────────────
def compute_accuracy(db: Session, company_id: int, days_back: int = 14) -> list[dict]:
    """
    Compare suggestions vs actual consumption. Return accuracy report.
    """
    since = date.today() - timedelta(days=days_back)
    suggestions = db.query(AdvPoSuggestion).filter(
        AdvPoSuggestion.company_unique_id == company_id,
        AdvPoSuggestion.po_date >= since,
        AdvPoSuggestion.accepted_qty.isnot(None),
    ).all()

    report = []
    for s in suggestions:
        # Actual consumption for this item on this date
        actual = db.execute(text("""
            SELECT COALESCE(SUM(sci.qty_consumed), 0) as actual
            FROM inv_stock_consumption sc
            JOIN inv_stock_consumption_item sci ON sci.consumption_id = sc.consumption_id
            WHERE sc.company_unique_id = :cid
              AND sci.item_id = :iid
              AND sc.consumption_date = :dt
        """), {"cid": company_id, "iid": s.item_id, "dt": s.po_date}).fetchone()

        actual_qty = float(actual.actual) if actual else 0.0
        if actual_qty == 0:
            continue

        variance = ((actual_qty - float(s.suggested_qty)) / float(s.suggested_qty) * 100) if s.suggested_qty else 0
        # Recommended new multiplier
        if float(s.base_qty_30d) > 0:
            rec_multiplier = round(actual_qty / float(s.base_qty_30d), 3)
        else:
            rec_multiplier = 1.0

        # Log accuracy
        log = db.query(AdvAccuracyLog).filter_by(suggestion_id=s.suggestion_id).first()
        if not log:
            log = AdvAccuracyLog(
                company_unique_id=company_id,
                suggestion_id=s.suggestion_id,
                item_id=s.item_id,
                po_date=s.po_date,
                suggested_qty=s.suggested_qty,
                actual_sold_qty=actual_qty,
                variance_pct=round(variance, 2),
                rule_correction=rec_multiplier,
            )
            db.add(log)
        else:
            log.actual_sold_qty = actual_qty
            log.variance_pct    = round(variance, 2)
            log.rule_correction = rec_multiplier

        item = db.query(InventoryItem).filter_by(item_id=s.item_id).first()
        report.append({
            "log_id":          log.log_id if log.log_id else None,
            "item_id":         s.item_id,
            "item_name":       item.item_name if item else f"Item #{s.item_id}",
            "po_date":         str(s.po_date),
            "suggested_qty":   float(s.suggested_qty),
            "actual_qty":      actual_qty,
            "variance_pct":    round(variance, 2),
            "rec_multiplier":  rec_multiplier,
            "reason":          s.reason,
            "is_applied":      log.is_applied if log else False,
        })

    db.commit()
    return report


def apply_accuracy_correction(db: Session, log_id: int, rule_id: int) -> None:
    """Admin clicks Apply — update the weather rule multiplier."""
    log = db.query(AdvAccuracyLog).filter_by(log_id=log_id).first()
    if not log or not log.rule_correction:
        return
    rule = db.query(AdvWeatherRule).filter_by(rule_id=rule_id).first()
    if rule:
        rule.multiplier = log.rule_correction
        rule.updated_at = datetime.utcnow()
    log.is_applied = True
    db.commit()


# ── CRUD: weather rules ───────────────────────────────────────
def get_weather_rules(db: Session, company_id: int) -> list:
    return db.query(AdvWeatherRule).filter_by(company_unique_id=company_id).order_by(AdvWeatherRule.condition, AdvWeatherRule.item_category_id).all()

def create_weather_rule(db: Session, data: dict) -> AdvWeatherRule:
    rule = AdvWeatherRule(**data)
    db.add(rule); db.commit(); db.refresh(rule)
    return rule

def update_weather_rule(db: Session, rule_id: int, data: dict) -> AdvWeatherRule:
    rule = db.query(AdvWeatherRule).filter_by(rule_id=rule_id).first()
    for k, v in data.items():
        setattr(rule, k, v)
    rule.updated_at = datetime.utcnow()
    db.commit(); db.refresh(rule)
    return rule

def delete_weather_rule(db: Session, rule_id: int) -> None:
    db.query(AdvWeatherRule).filter_by(rule_id=rule_id).delete()
    db.commit()


# ── CRUD: occasions ───────────────────────────────────────────
def get_all_occasions(db: Session) -> list:
    return db.query(AdvOccasion).filter_by(is_active=True).order_by(AdvOccasion.month, AdvOccasion.day).all()

def get_occasion_rules(db: Session, occasion_id: int) -> list:
    return db.query(AdvOccasionRule).filter_by(occasion_id=occasion_id, is_active=True).all()

def upsert_occasion_rule(db: Session, occasion_id: int, category_id: int, multiplier: float) -> None:
    rule = db.query(AdvOccasionRule).filter_by(occasion_id=occasion_id, item_category_id=category_id).first()
    if rule:
        rule.multiplier = multiplier; rule.is_active = True
    else:
        db.add(AdvOccasionRule(occasion_id=occasion_id, item_category_id=category_id, multiplier=multiplier))
    db.commit()

def get_branch_occasions(db: Session, company_id: int) -> list:
    return db.query(AdvBranchOccasion).filter_by(company_unique_id=company_id).all()

def set_branch_occasion(db: Session, company_id: int, occasion_id: int, is_active: bool) -> None:
    bo = db.query(AdvBranchOccasion).filter_by(company_unique_id=company_id, occasion_id=occasion_id).first()
    if bo:
        bo.is_active = is_active; bo.updated_at = datetime.utcnow()
    else:
        db.add(AdvBranchOccasion(company_unique_id=company_id, occasion_id=occasion_id, is_active=is_active))
    db.commit()
