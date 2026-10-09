#!/usr/bin/env python3
"""
Збирає активні лоти Prozorro.Продажі по всій Україні, розкладає їх за областями
(м. Київ — окремим регіоном) і формує GeoJSON для мапи на сайті.

Джерело: відкритий API Prozorro.Sale (нова ЦБД), пошук за датою зміни:
  https://procedure.prozorro.sale/api/search/byDateModified/<ISO-дата>?limit=100
Порядок обходу — як описано на https://prozorro.sale/opendata/ :
  беремо 100 найстаріших змінених процедур, далі dateModified останньої + 1 мс.

Файли (інкрементально, між запусками):
  data/prozorro-state.json — курсор + стислі записи активних лотів;
  data/geocache.json       — кеш координат (адреси, населені пункти, області);
  data/prozorro-ua.geojson — результат для мапи.

Координати визначаються в такому порядку:
  1) координати з самого лота (якщо продавець їх вказав)          -> precision "exact"
  2) геокодування повної адреси (OpenStreetMap Nominatim)          -> "address"
  3) центр населеного пункту                                        -> "locality"
  4) центр області                                                  -> "region"
Лише стандартна бібліотека Python 3.9+. Запуск: python scripts/prozorro_ua.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------- налаштування
API_BASE = os.environ.get("PROZORRO_API", "https://procedure.prozorro.sale/api")
LOT_URL = "https://prozorro.sale/auction/{auction_id}"  # публічна сторінка лота [перевірити формат]
FIRST_RUN_DAYS = int(os.environ.get("FIRST_RUN_DAYS", "120"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "5000"))
MAX_GEOCODE_ADDR = int(os.environ.get("MAX_GEOCODE_ADDR", "800"))   # точних адрес за запуск
MAX_GEOCODE_PLACE = int(os.environ.get("MAX_GEOCODE_PLACE", "600"))  # нових населених пунктів за запуск
USER_AGENT = os.environ.get("USER_AGENT", "kyivarbitr-prozorro-map/2.0 (+https://kyivarbitr.com.ua)")

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STATE_FILE = DATA / "prozorro-state.json"
GEOCACHE_FILE = DATA / "geocache.json"
OUT_FILE = DATA / "prozorro-ua.geojson"
SUMMARY_FILE = DATA / "prozorro-summary.json"  # коротка статистика для анонсу на сторінці «Аналітика»
SITEMAP_FILE = ROOT / "sitemap.xml"
MAP_PAGE_URL = "https://kyivarbitr.com.ua/prozorro-map"

UA_BBOX = (44.0, 22.0, 52.5, 40.3)  # (lat_min, lon_min, lat_max, lon_max)
KYIV_CITY = "м. Київ"
UNKNOWN = "Регіон не визначено"

# (назва для показу, шаблони для розпізнавання в полі "region"/адресі)
REGIONS = [
    ("Вінницька", r"вінниц|vinnyts|vinnits"),
    ("Волинська", r"волин|volyn"),
    ("Дніпропетровська", r"дніпропетр|dnipropetr|dnepropetr"),
    ("Донецька", r"донец|donets"),
    ("Житомирська", r"житомир|zhytomyr"),
    ("Закарпатська", r"закарпат|zakarpat"),
    ("Запорізька", r"запоріз|zaporiz"),
    ("Івано-Франківська", r"франків|frankiv"),
    ("Київська", r"київськ|kyivsk|kyiv oblast"),
    ("Кіровоградська", r"кіровоград|kirovohrad"),
    ("Луганська", r"луган|luhan"),
    ("Львівська", r"львів|lviv"),
    ("Миколаївська", r"миколаїв|mykolai"),
    ("Одеська", r"одес|odes"),
    ("Полтавська", r"полтав|poltav"),
    ("Рівненська", r"рівненськ|rivnensk|^рівне"),
    ("Сумська", r"сумськ|sumsk"),
    ("Тернопільська", r"терноп|ternop"),
    ("Харківська", r"харків|kharkiv"),
    ("Херсонська", r"херсон|kherson"),
    ("Хмельницька", r"хмельниц|khmelnyts"),
    ("Черкаська", r"черкас|cherkas"),
    ("Чернівецька", r"чернівец|chernivts"),
    ("Чернігівська", r"чернігів|chernihiv"),
    ("АР Крим", r"крим|crimea|krym"),
    ("м. Севастополь", r"севастоп|sevastop"),
]
REGION_RE = [(name, re.compile(pat, re.I)) for name, pat in REGIONS]

# Статуси, за яких лот ще можна купити.
EXCLUDED_ACTIVE = {"active_qualification", "active_awarded", "active_contracting"}


# ---------------------------------------------------------------- утиліти
def log(*a):
    print(*a, file=sys.stderr, flush=True)


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, data, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":") if compact else None,
                     indent=None if compact else 1)
    path.write_text(txt, encoding="utf-8")


def http_json(url: str, retries: int = 4):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            wait = 2 ** attempt * 3
            log(f"  ! {e} — повтор через {wait} с")
            time.sleep(wait)
    raise RuntimeError(f"Не вдалося отримати {url}")


def ml(v) -> str:
    """Багатомовне поле {"uk_UA": "..."} -> рядок."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, dict):
        for k in ("uk_UA", "uk", "en_US", "en"):
            if v.get(k):
                return str(v[k]).strip()
        for val in v.values():
            if isinstance(val, str) and val.strip():
                return val.strip()
    return ""


def dig(obj, *path):
    for p in path:
        if isinstance(obj, dict):
            obj = obj.get(p)
        elif isinstance(obj, list) and isinstance(p, int) and len(obj) > p:
            obj = obj[p]
        else:
            return None
    return obj


def parse_dt(s: str | None):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def in_ua(lat, lon) -> bool:
    a, b, c, d = UA_BBOX
    return a <= lat <= c and b <= lon <= d


# ---------------------------------------------------------------- регіони
def clean_locality(s: str) -> str:
    s = re.sub(r"^(м\.|місто|с\.|село|смт\.?|селище|сщ\.?|с-ще)\s*", "", s.strip(), flags=re.I)
    return s.strip(" ,.")


def is_kyiv_city(region: str, locality: str, street: str) -> bool:
    r, l = region.lower().strip(), clean_locality(locality).lower()
    if l in {"київ", "kyiv", "kiev"}:
        return True
    if re.fullmatch(r"(м\.?\s*)?київ|kyiv( city)?|kiev", r):
        return True
    return bool(not r and not l and re.search(r"\bм\.?\s*київ\b", street.lower()))


def detect_region(addr: dict) -> tuple[str, str]:
    """-> (регіон для показу, населений пункт)."""
    region, locality, street = (ml(addr.get(k)) for k in ("region", "locality", "streetAddress"))
    if is_kyiv_city(region, locality, street):
        return KYIV_CITY, "Київ"
    for text in (region, f"{locality} {street}"):
        for name, rx in REGION_RE:
            if text and rx.search(text):
                # "Київ" у полі населеного пункту вже оброблено вище; тут "київськ" — тільки область
                return name, clean_locality(locality)
    return UNKNOWN, clean_locality(locality)


# ---------------------------------------------------------------- розбір процедури
def item_coords(item: dict):
    for path in (("location",), ("address", "location"), ("geo",)):
        loc = dig(item, *path)
        if isinstance(loc, dict):
            try:
                lat, lon = float(loc.get("latitude")), float(loc.get("longitude"))
            except (TypeError, ValueError):
                continue
            if in_ua(lat, lon) and not (lat == 0 and lon == 0):
                return [round(lat, 6), round(lon, 6)]
    return None


def summarize(proc: dict) -> dict | None:
    items = [it for it in (proc.get("items") or []) if isinstance(it, dict)]
    if not items:
        return None
    it = items[0]
    addr = it.get("address") or {}
    region, locality = detect_region(addr)
    coords = next((c for c in (item_coords(x) for x in items) if c), None)
    value = proc.get("value") or proc.get("startingPrice") or {}
    selling = str(proc.get("sellingMethod") or proc.get("procurementMethodType") or "")
    start = (dig(proc, "auctionPeriod", "startDate")
             or dig(proc, "auctionPeriod", "shouldStartAfter")
             or dig(proc, "tenderPeriod", "endDate"))
    return {
        "id": proc.get("_id") or proc.get("id"),
        "auctionId": proc.get("auctionId") or proc.get("lotId") or "",
        "status": proc.get("status") or "",
        "title": ml(proc.get("title")) or ml(it.get("description")) or "Лот без назви",
        "region": region,
        "locality": locality,
        "rawRegion": ml(addr.get("region")),
        "address": ml(addr.get("streetAddress")),
        "classification": ml(dig(it, "classification", "description")),
        "amount": value.get("amount") if isinstance(value, dict) else None,
        "currency": (value.get("currency") if isinstance(value, dict) else None) or "UAH",
        "sellingMethod": selling,
        "bankruptcy": "bankrupt" in selling.lower(),
        "auctionStart": start,
        "coords": coords,
        "precision": "exact" if coords else None,
    }


def still_for_sale(rec: dict, now: datetime) -> bool:
    st = rec.get("status") or ""
    if not st.startswith("active") or st in EXCLUDED_ACTIVE:
        return False
    start = parse_dt(rec.get("auctionStart"))
    return not (start and start < now - timedelta(days=1))


# ---------------------------------------------------------------- обхід API
def extract_list(resp):
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        for k in ("data", "items", "procedures", "result"):
            if isinstance(resp.get(k), list):
                return resp[k]
    return []


def fetch_updates(state: dict, now: datetime):
    cursor = state.get("cursor")
    if not cursor:
        cursor = (now - timedelta(days=FIRST_RUN_DAYS)).strftime("%Y-%m-%dT%H:%M:%S.000000Z")
    lots = state.setdefault("lots", {})
    seen = 0
    for page in range(MAX_PAGES):
        url = f"{API_BASE}/search/byDateModified/{urllib.parse.quote(cursor, safe='')}?limit=100"
        batch = extract_list(http_json(url))
        if not batch:
            break
        last = None
        for proc in batch:
            if "items" not in proc and (proc.get("_id") or proc.get("id")):
                proc = http_json(f"{API_BASE}/procedures/{proc.get('_id') or proc.get('id')}")
            seen += 1
            dm = proc.get("dateModified")
            if dm and (last is None or dm > last):
                last = dm
            pid = proc.get("_id") or proc.get("id")
            rec = summarize(proc)
            if rec and still_for_sale(rec, now):
                old = lots.get(pid)
                # зберігаємо раніше знайдені координати, якщо адреса не змінилась
                if old and not rec["coords"] and old.get("coords") and old.get("address") == rec["address"] \
                        and old.get("locality") == rec["locality"]:
                    rec["coords"], rec["precision"] = old["coords"], old.get("precision")
                lots[pid] = rec
            else:
                lots.pop(pid, None)  # завершений/скасований лот — прибираємо
        if not last:
            break
        nxt = (parse_dt(last) + timedelta(milliseconds=1)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        if nxt <= cursor:
            break
        cursor = nxt
        if page % 20 == 0:
            log(f"  сторінка {page}: курсор {cursor}, переглянуто {seen}, активних {len(lots)}")
        if len(batch) < 100:
            break
        time.sleep(0.2)
    state["cursor"] = cursor
    log(f"Переглянуто процедур: {seen}; активних лотів у базі: {len(lots)}")


# ---------------------------------------------------------------- геокодування
class Geocoder:
    """OpenStreetMap Nominatim: не частіше 1 запиту/с, власний User-Agent, кеш результатів."""

    def __init__(self, cache: dict):
        self.cache = cache
        self.addr_budget = MAX_GEOCODE_ADDR
        self.place_budget = MAX_GEOCODE_PLACE
        self.calls = 0

    def _query(self, q: str):
        params = urllib.parse.urlencode({"q": q, "format": "jsonv2", "limit": 1,
                                         "countrycodes": "ua", "accept-language": "uk"})
        try:
            res = http_json(f"https://nominatim.openstreetmap.org/search?{params}", retries=2)
        except RuntimeError:
            return None
        finally:
            self.calls += 1
            time.sleep(1.1)
        if res:
            lat, lon = float(res[0]["lat"]), float(res[0]["lon"])
            if in_ua(lat, lon):
                return [round(lat, 6), round(lon, 6)]
        return None

    def _cached(self, key: str, queries, budget_attr: str):
        if key in self.cache:
            return self.cache[key]
        if getattr(self, budget_attr) <= 0:
            return "SKIP"
        setattr(self, budget_attr, getattr(self, budget_attr) - 1)
        found = None
        for q in queries:
            found = self._query(q)
            if found:
                break
        self.cache[key] = found  # кешуємо і невдачі
        return found

    @staticmethod
    def region_label(region: str) -> str:
        if region.startswith("м. ") or region == "АР Крим":
            return region.replace("м. ", "")
        return f"{region} область"

    def address(self, rec):
        street = re.sub(r"\s+", " ", rec.get("address") or "").strip(" ,")
        if not street or rec["region"] == UNKNOWN:
            return None
        loc = rec.get("locality") or ""
        reg = self.region_label(rec["region"])
        use_loc = loc and loc.lower() not in street.lower() and loc.lower() != reg.lower()
        tail = ", ".join(x for x in (loc if use_loc else "", reg) if x)
        full = f"{street}, {tail}"
        short = re.split(r",\s*(?:прим|кв|пов|оф|нежит|літ|секц|кім)", street, flags=re.I)[0]
        qs = [full] + ([f"{short}, {tail}"] if short != street else [])
        r = self._cached("A|" + full.lower(), qs, "addr_budget")
        return None if r == "SKIP" else r

    def locality(self, rec):
        loc = rec.get("locality") or ""
        if not loc or rec["region"] == UNKNOWN:
            return None
        if rec["region"] == KYIV_CITY:
            q = ["Київ"]
        else:
            q = [f"{loc}, {self.region_label(rec['region'])}"]
        r = self._cached("L|" + q[0].lower(), q, "place_budget")
        return None if r == "SKIP" else r

    def region(self, rec):
        if rec["region"] == UNKNOWN:
            return None
        q = self.region_label(rec["region"]) + ", Україна"
        r = self._cached("R|" + q.lower(), [q], "place_budget")
        return None if r == "SKIP" else r


def add_coords(active: list, geo: Geocoder):
    # спершу найближчі аукціони — вони найважливіші для відвідувачів
    for rec in sorted(active, key=lambda r: r.get("auctionStart") or "9999"):
        if rec.get("precision") in ("exact", "address"):
            continue
        c = geo.address(rec)
        if c:
            rec["coords"], rec["precision"] = c, "address"
            continue
        if rec.get("precision") in ("locality",):
            continue
        for fn, prec in ((geo.locality, "locality"), (geo.region, "region")):
            c = fn(rec)
            if c:
                rec["coords"], rec["precision"] = c, prec
                break
    log(f"Запитів до геокодера: {geo.calls}")


# ---------------------------------------------------------------- вихід
def region_order(name: str):
    if name == KYIV_CITY:
        return (0, "")
    if name == UNKNOWN:
        return (3, "")
    if name in ("АР Крим", "м. Севастополь"):
        return (2, name)
    return (1, name)


def to_geojson(active: list, now: datetime):
    feats, unplaced, regions = [], [], {}
    for r in active:
        reg = regions.setdefault(r["region"], {"name": r["region"], "count": 0, "bankruptcy": 0})
        reg["count"] += 1
        reg["bankruptcy"] += 1 if r["bankruptcy"] else 0
        props = {
            "title": r["title"], "region": r["region"], "locality": r["locality"],
            "address": r["address"], "status": r["status"],
            "amount": r["amount"], "currency": r["currency"],
            "auctionStart": r["auctionStart"], "classification": r["classification"],
            "bankruptcy": r["bankruptcy"], "auctionId": r["auctionId"],
            "url": LOT_URL.format(auction_id=r["auctionId"]) if r["auctionId"] else None,
            "precision": r.get("precision"),
        }
        if r.get("coords"):
            lat, lon = r["coords"]
            feats.append({"type": "Feature", "properties": props,
                          "geometry": {"type": "Point", "coordinates": [lon, lat]}})
        else:
            unplaced.append(props)
    return {
        "type": "FeatureCollection",
        "metadata": {
            "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "Prozorro.Продажі (prozorro.sale), відкриті дані",
            "total": len(active), "onMap": len(feats),
            "regions": sorted(regions.values(), key=lambda x: region_order(x["name"])),
            "unplaced": unplaced,
        },
        "features": feats,
    }


def write_summary(gj: dict):
    m = gj["metadata"]
    kyiv = next((r["count"] for r in m["regions"] if r["name"] == KYIV_CITY), 0)
    save_json(SUMMARY_FILE, {
        "updated": m["updated"], "total": m["total"], "onMap": m["onMap"], "kyiv": kyiv,
        "bankruptcy": sum(r["bankruptcy"] for r in m["regions"]),
    }, compact=True)


def touch_sitemap(now: datetime):
    """Оновлює <lastmod> сторінки мапи в sitemap.xml, щоб пошуковики бачили свіжі дані."""
    try:
        xml = SITEMAP_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        return
    day = now.strftime("%Y-%m-%d")
    pat = re.compile(r"(<loc>" + re.escape(MAP_PAGE_URL) + r"</loc>\s*<lastmod>)[^<]*(</lastmod>)")
    new = pat.sub(lambda mt: mt.group(1) + day + mt.group(2), xml, count=1)
    if new != xml:
        SITEMAP_FILE.write_text(new, encoding="utf-8")


def main():
    now = datetime.now(timezone.utc)
    state = load_json(STATE_FILE, {})
    cache = load_json(GEOCACHE_FILE, {})

    log(f"Старт: курсор = {state.get('cursor') or 'перший запуск'}")
    fetch_updates(state, now)

    lots = state.get("lots", {})
    for pid in [p for p, r in lots.items() if not still_for_sale(r, now)]:
        lots.pop(pid)

    active = list(lots.values())
    add_coords(active, Geocoder(cache))
    active.sort(key=lambda r: (region_order(r["region"]), r.get("auctionStart") or "9999"))

    gj = to_geojson(active, now)
    save_json(OUT_FILE, gj, compact=True)
    write_summary(gj)
    touch_sitemap(now)
    save_json(STATE_FILE, state, compact=True)
    save_json(GEOCACHE_FILE, cache)
    m = gj["metadata"]
    log(f"Готово: активних лотів {m['total']}, на мапі {m['onMap']}, без координат {len(m['unplaced'])}")
    for reg in m["regions"]:
        log(f"  {reg['name']}: {reg['count']}")


if __name__ == "__main__":
    main()
