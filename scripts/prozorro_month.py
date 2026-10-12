#!/usr/bin/env python3
"""Місячна аналітика Prozorro.Продажі.

Збирає всі процедури, оголошені в заданому місяці (дата береться з ідентифікатора аукціону
…-UA-YYYYMMDD-…), разом з їхнім поточним статусом, і зберігає зведення в
data/analytics/prozorro-YYYY-MM.json. З цього файлу потім готується огляд для сайту й соцмереж.

  MONTH=2026-09 python scripts/prozorro_month.py     # конкретний місяць
  python scripts/prozorro_month.py                   # попередній календарний місяць

Обмеження: лоти ФГВФО (GFE…/GFD…) у пошуку API не з'являються, тож у зведенні їх може бракувати;
це позначено в полі "notes".
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prozorro_ua import API_BASE, dig, extract_list, http_json, is_dep, log, parse_dt, summarize  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "analytics"
MAX_PAGES = int(os.environ.get("MONTH_MAX_PAGES", "6000"))
RX_REPEAT = re.compile(r"повторн", re.I)
RX_SECURED = re.compile(r"заставлен|застав[уіа]|іпотек|забезпечен(ого|ий|им) кредитор|предмет(ом)? забезпечення", re.I)
RX_CLAIM = re.compile(r"прав[оа]? вимоги|продаж боргу|дебіторськ", re.I)


def target_month(now: datetime) -> tuple[int, int]:
    m = os.environ.get("MONTH", "").strip()
    if m:
        y, mo = m.split("-")
        return int(y), int(mo)
    first = now.replace(day=1)
    prev = first - timedelta(days=1)
    return prev.year, prev.month


def final_amount(proc: dict):
    """Ціна продажу, якщо API її вже містить (договір або визнаний переможцем учасник)."""
    for key in ("contracts", "awards"):
        for x in reversed(proc.get(key) or []):
            if not isinstance(x, dict):
                continue
            v = dig(x, "value", "amount") or dig(x, "contractTotalValue", "amount")
            if v:
                return v
    return None


def walk(month_tag: str, start: datetime, now: datetime) -> dict:
    cursor = start.strftime("%Y-%m-%dT%H:%M:%S.000000Z")
    found, seen = {}, 0
    for page in range(MAX_PAGES):
        url = f"{API_BASE}/search/byDateModified/{urllib.parse.quote(cursor, safe='')}?limit=100"
        batch = extract_list(http_json(url))
        if not batch:
            break
        last = None
        for proc in batch:
            aid = str(proc.get("auctionId") or "")
            if "items" not in proc and (proc.get("_id") or proc.get("id")):
                if aid and f"-UA-{month_tag}" not in aid:
                    dm = proc.get("dateModified")
                    last = dm if dm and (last is None or dm > last) else last
                    continue  # чужий місяць — повну процедуру не завантажуємо
                proc = http_json(f"{API_BASE}/procedures/{proc.get('_id') or proc.get('id')}")
                aid = str(proc.get("auctionId") or "")
            seen += 1
            dm = proc.get("dateModified")
            if dm and (last is None or dm > last):
                last = dm
            if f"-UA-{month_tag}" not in aid:
                continue
            rec = summarize(proc)
            if not rec:
                continue
            rec["final"] = final_amount(proc)
            found[rec["id"]] = rec  # обхід іде за зростанням dateModified: остання версія перезаписує попередню
        if not last:
            break
        nxt = (parse_dt(last) + timedelta(milliseconds=1)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        if nxt <= cursor or parse_dt(nxt) > now:
            break
        cursor = nxt
        if page % 50 == 0:
            log(f"  сторінка {page}: курсор {cursor}, переглянуто {seen}, лотів місяця {len(found)}")
        if len(batch) < 100:
            break
        time.sleep(0.15)
    log(f"Переглянуто процедур: {seen}; оголошених у {month_tag}: {len(found)}")
    return found


def agg(recs):
    n = len(recs)
    uah = [r["amount"] for r in recs if r.get("amount") and (r.get("currency") or "UAH") == "UAH"]
    return {"n": n, "sum_uah": round(sum(uah), 2), "median_uah": (sorted(uah)[len(uah) // 2] if uah else None)}


def compact(r):
    return {
        "id": r["auctionId"], "t": (r.get("title") or "")[:220], "c": r.get("classification") or "",
        "m": (r.get("sellingMethod") or "").split("-")[0], "a": r.get("amount"), "cur": r.get("currency") or "UAH",
        "f": r.get("final"), "s": r.get("status"), "rg": r.get("region") or "", "st": r.get("auctionStart"),
        "sl": (r.get("seller") or "")[:120],
    }


def main():
    now = datetime.now(timezone.utc)
    y, mo = target_month(now)
    tag = f"{y}{mo:02d}"
    start = datetime(y, mo, 1, tzinfo=timezone.utc) - timedelta(days=2)  # запас на часові пояси
    log(f"Місяць {y}-{mo:02d}: обхід змін з {start:%Y-%m-%d}")
    recs = list(walk(tag, start, now).values())

    by_method, by_region, by_status = defaultdict(list), defaultdict(list), defaultdict(Counter)
    for r in recs:
        m = (r.get("sellingMethod") or "?").split("-")[0]
        by_method[m].append(r)
        by_region[r.get("region") or "не визначено"].append(r)
        by_status[m][r.get("status") or "?"] += 1

    dep = [r for r in recs if is_dep(r) or r.get("bankruptcy")]
    text = lambda r: f"{r.get('title') or ''} {r.get('description') or ''}"
    seg = {
        "all": agg(dep),
        "secured": agg([r for r in dep if RX_SECURED.search(text(r))]),
        "repeat": agg([r for r in dep if RX_REPEAT.search(r.get("title") or "")]),
        "claims": agg([r for r in dep if RX_CLAIM.search(text(r)) or "права вимоги" in (r.get("classification") or "").lower()]),
        "dutch": agg([r for r in dep if re.match(r"^[A-Z]{2}D", r.get("auctionId") or "")]),
        "with_final": sum(1 for r in dep if r.get("final")),
    }
    out = {
        "month": f"{y}-{mo:02d}",
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Prozorro.Продажі, публічний API (procedure.prozorro.sale)",
        "notes": [
            "Місяць визначено за датою в ідентифікаторі аукціону.",
            "Статуси — на дату формування звіту; частина торгів ще триває.",
            "Лоти ФГВФО (GFE/GFD) у пошуку API можуть бути відсутні.",
            "Суми — стартові ціни в гривнях; лоти в інших валютах не підсумовано.",
        ],
        "total": agg(recs),
        "statuses": dict(Counter(r.get("status") or "?" for r in recs).most_common()),
        "by_method": {k: {**agg(v), "statuses": dict(by_status[k].most_common())}
                      for k, v in sorted(by_method.items(), key=lambda kv: -len(kv[1]))},
        "by_region": {k: agg(v) for k, v in sorted(by_region.items(), key=lambda kv: -len(kv[1]))},
        "dep_segment": seg,
        "dep_lots": [compact(r) for r in sorted(dep, key=lambda r: -(r.get("amount") or 0))],
        "top_lots": [compact(r) for r in sorted(recs, key=lambda r: -(r.get("amount") or 0)
                                                if (r.get("currency") or "UAH") == "UAH" else 0)[:25]],
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"prozorro-{y}-{mo:02d}.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Збережено {path.relative_to(ROOT)}: лотів {out['total']['n']}, сегмент банкрутство/вимоги {seg['all']['n']}")


if __name__ == "__main__":
    main()
