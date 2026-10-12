#!/usr/bin/env python3
"""Щоденна добірка нових лотів (банкрутство, ФГВФО, держбанки, права вимоги) у Telegram-канал.

Бере data/dep-lots.json (його щодня оновлює prozorro_ua.py), публікує лоти, яких ще не було
в каналі, і запам'ятовує їх у data/tg-posted.json.

Змінні середовища:
  TELEGRAM_BOT_TOKEN  токен бота від @BotFather (секрет репозиторію)
  TELEGRAM_CHAT_ID    @username каналу або його числовий id (секрет репозиторію)
  SITE_URL            адреса сайту, за замовчуванням https://kyivarbitr.com.ua
  TG_MAX_LOTS         скільки лотів публікувати за день (типово 10)
  TG_DRY_RUN=1        лише показати повідомлення, нічого не надсилати
Без токена скрипт нічого не робить і завершується без помилки.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEP_FILE = ROOT / "data" / "dep-lots.json"
POSTED_FILE = ROOT / "data" / "tg-posted.json"

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
SITE = os.environ.get("SITE_URL", "").strip().rstrip("/") or "https://kyivarbitr.com.ua"
MAX_LOTS = int(os.environ.get("TG_MAX_LOTS", "10"))
FIRST_RUN_LOTS = 5          # перший запуск: коротка добірка найближчих аукціонів, решту позначаємо як бачені
PER_MESSAGE = 5             # пунктів в одному повідомленні
MIN_DAYS = 3                # не пропонувати лоти, до аукціону яких менше 3 днів
DRY = os.environ.get("TG_DRY_RUN") == "1"
from zoneinfo import ZoneInfo
KYIV = ZoneInfo("Europe/Kyiv")  # київський час з урахуванням переходу на літній/зимовий
# Вікно публікації за Києвом: розклад запускає скрипт двічі (літо/зима), публікує лише перший запуск у вікні.
WINDOW = os.environ.get("TG_KYIV_WINDOW", "")  # напр. "09:00-11:00"; порожньо — без обмеження
FORCE = os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch"  # ручний запуск — без перевірки часу

OCCUPIED = {"Донецька", "Луганська", "АР Крим", "м. Севастополь"}
FRONT = ["Херсон", "Ізюм", "Краматорськ", "Дружківка", "Білозерське", "Куп'янськ", "Куп’янськ",
         "Нова Каховка", "Покровськ", "Костянтинівка"]
KIND = {"bk": "Майно банкрута", "state": "Актив держбанку", "fgv": "Актив ФГВФО", "claim": "Права вимоги"}

RX_CLAIM = re.compile(r"прав[оа]? вимоги|продаж боргу|дебіторськ", re.I)
RX_SECURED = re.compile(r"заставлен|застав[уіа]|іпотек|забезпечен(ого|ий|им) кредитор|предмет(ом)? забезпечення", re.I)


def text(l):
    return f"{l.get('t') or ''} {l.get('d') or ''}"


def is_claim(l):
    return bool(RX_CLAIM.search(text(l)) or re.search("права вимоги", l.get("c") or "", re.I))


def kind(l):
    i = l.get("id") or ""
    if is_claim(l) and not i.startswith("BR"):
        return "claim"
    if i.startswith("BR") or l.get("bk"):
        return "bk"
    if i.startswith("NL"):
        return "state"
    if i.startswith("GF"):
        return "fgv"
    return "claim"


def flags(l):
    """Короткі прапорці — ті самі правила, що й у картці ризиків на сайті (js/lot-dep.js)."""
    t = text(l).lower()
    claim = is_claim(l)
    place = f"{l.get('lc') or ''} {l.get('ad') or ''}"  # без назви: «Херсонський термінал» у Києві — не прифронтовий лот
    high, mid = [], []
    if RX_SECURED.search(text(l)):
        high.append("застава / іпотека")
    if l.get("rg") in OCCUPIED or re.search(r"донецьк|луганськ|криму|севастопол", l.get("t") or "", re.I):
        high.append("окупований / прифронтовий регіон")
    elif any(c in place for c in FRONT):
        mid.append("зона бойових дій поруч")
    if claim and re.search(r"рф|російськ|агресі", t):
        high.append("вимога до держави-агресора")
    if claim and re.search(r"субсидіар|солідарн|фізичн(ої|их) особ", t):
        mid.append("боржники — фізособи / субсидіарна відповідальність")
    if re.search(r"повторн", t):
        mid.append("повторний аукціон")
    if re.search(r"право (суб)?оренди", t):
        mid.append("право оренди, не власність")
    if re.search(r"\b\d{1,3}/(100|1000)\b|\b1/2\b|частк[аиуі]\b", l.get("t") or "", re.I):
        mid.append("частка об’єкта")
    return high, mid


def money(l):
    a = l.get("a")
    if a is None:
        return "ціна не вказана"
    s = f"{a:,.0f}".replace(",", " ")
    cur = l.get("cur") or "UAH"
    return f"{s} грн" if cur == "UAH" else f"{s} {html.escape(cur)}"


def when(l):
    try:
        d = datetime.fromisoformat((l.get("st") or "").replace("Z", "+00:00")).astimezone(KYIV)
    except ValueError:
        return "дата не вказана"
    return d.strftime("%d.%m.%Y")


def place(l):
    rg, lc = l.get("rg") or "", l.get("lc") or ""
    parts = [rg] + ([lc] if lc and rg.replace("м. ", "") != lc else [])
    return ", ".join(p for p in parts if p) or "місце не вказано"


RX_PREFIX = re.compile(
    r"^(проведення\s+)?((перш|друг|трет)\w*\s+)?(повторн\w*\s+)?(аукціон\w*|продаж\w*)\s+(з\s+)?(продажу\s+)?", re.I)
ABBR = [(r"Товариств[оа] з обмеженою відповідальністю", "ТОВ"), (r"[Пп]риватн(е|ого) підприємств[оа]", "ПП"),
        (r"ідентифікаційний код юридичної особи", "код"), (r"код ЄДРПОУ", "код")]


def headline(l):
    t = re.sub(r"\s+", " ", l.get("t") or "").strip()
    t = RX_PREFIX.sub("Продаж ", t)
    for a, b in ABBR:
        t = re.sub(a, b, t)
    return (t[:1].upper() + t[1:]) if t else "Лот без назви"


def group_key(l):
    return re.sub(r"[^a-zа-яіїєґ0-9]", "", headline(l).lower())[:45]


def short(s, n=150):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def lot_block(n, l, more=0):
    high, mid = flags(l)
    if high:
        risk = "🔴 " + "; ".join(high + mid)
    elif mid:
        risk = "🟡 " + "; ".join(mid)
    else:
        risk = "⚪ явних прапорців у тексті немає"
    card = f"{SITE}/lot-dep.html?lot={urllib.parse.quote(l['id'])}"
    pz = f"https://prozorro.sale/auction/{urllib.parse.quote(l['id'])}"
    return (
        f"<b>{n}. {html.escape(short(headline(l)))}</b>\n"
        f"{KIND[kind(l)]}{' · голландський аукціон' if re.match(r'^[A-Z]{2}D', l['id']) else ''} · {html.escape(place(l))}\n"
        + (f"Актив: {html.escape(l['c'])}\n" if l.get("c") else "") +
        f"💰 {money(l)} · 🗓 аукціон {when(l)}\n"
        f"{html.escape(risk)}\n"
        f'<a href="{card}">Картка ризиків</a> · <a href="{pz}">Prozorro</a>'
        + (f"\n+ ще {more} схожих лотів цього продавця" if more else "")
    )


def messages(groups, today):
    out = []
    chunks = [groups[i:i + PER_MESSAGE] for i in range(0, len(groups), PER_MESSAGE)]
    for ci, chunk in enumerate(chunks):
        head = f"<b>Нові лоти: банкрутство, ФГВФО, права вимоги · {today}</b>"
        if len(chunks) > 1:
            head += f" ({ci + 1}/{len(chunks)})"
        body = "\n\n".join(lot_block(ci * PER_MESSAGE + i + 1, g[0], len(g) - 1) for i, g in enumerate(chunk))
        foot = (
            "\n\n<i>Прапорці — автоматичний аналіз тексту оголошення, не юридичний висновок.</i>\n"
            f'<a href="{SITE}/lot-dep.html">Перевірити будь-який лот</a> · '
            f'<a href="{SITE}/contacts.html">Замовити перевірку</a>'
        )
        out.append(f"{head}\n\n{body}{foot}")
    return out


def send(msg):
    data = urllib.parse.urlencode({
        "chat_id": CHAT, "text": msg, "parse_mode": "HTML",
        "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{TOKEN}/sendMessage", data=data)
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)
    if not res.get("ok"):
        raise RuntimeError(res.get("description"))


def main():
    if not DRY and not (TOKEN and CHAT):
        print("Telegram: токен або канал не задано — пропускаю")
        return 0
    now = datetime.now(timezone.utc)
    local = now.astimezone(KYIV)
    first = not POSTED_FILE.exists()
    state = {} if first else json.loads(POSTED_FILE.read_text(encoding="utf-8"))
    posted = state.get("ids", {})
    if WINDOW and not FORCE:
        a, b = WINDOW.split("-")
        if not (a <= local.strftime("%H:%M") < b):
            print(f"Telegram: зараз {local:%H:%M} за Києвом — поза вікном {WINDOW}, пропускаю")
            return 0
        if state.get("lastRun") == local.strftime("%Y-%m-%d"):
            print("Telegram: сьогодні добірку вже опубліковано — пропускаю")
            return 0
    dep = json.loads(DEP_FILE.read_text(encoding="utf-8"))
    lots = [l for l in dep.get("lots", []) if l.get("id")]

    def upcoming(l):
        # інвесторові потрібен час на подання заявки: показуємо лоти з аукціоном не раніше ніж за 3 дні
        try:
            return datetime.fromisoformat((l.get("st") or "").replace("Z", "+00:00")) > now + timedelta(days=MIN_DAYS)
        except ValueError:
            return True

    fresh = [l for l in lots if l["id"] not in posted and upcoming(l)]
    fresh.sort(key=lambda l: l.get("st") or "9999")
    groups = {}
    for l in fresh:  # лоти одного продавця з однаковою назвою — одним пунктом
        groups.setdefault(group_key(l), []).append(l)
    glist = list(groups.values())
    gpick = glist[: FIRST_RUN_LOTS if first else MAX_LOTS]
    pick = [l for g in gpick for l in g]
    today = now.astimezone(KYIV).strftime("%d.%m.%Y")

    msgs = messages(gpick, today) if gpick else []
    for m in msgs:
        if DRY:
            print(m, "\n" + "-" * 60)
        else:
            send(m)
            time.sleep(3)
    stamp = now.strftime("%Y-%m-%d")
    for l in (lots if first else pick):  # перший запуск: усе наявне вважаємо вже баченим
        posted.setdefault(l["id"], stamp)
    live = {l["id"] for l in lots}
    cutoff = (now - timedelta(days=60)).strftime("%Y-%m-%d")
    posted = {k: v for k, v in posted.items() if k in live or v >= cutoff}
    if not DRY:
        POSTED_FILE.write_text(json.dumps({"updated": stamp, "lastRun": local.strftime("%Y-%m-%d"), "ids": posted},
                                          ensure_ascii=False, separators=(",", ":")),
                               encoding="utf-8")
    print(f"Telegram: опубліковано пунктів {len(gpick)} (лотів {len(pick)}) у {len(msgs)} повідомленнях; "
          f"нових залишилось {len(fresh) - len(pick)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # збій Telegram не повинен ламати оновлення мапи
        print(f"Telegram: помилка {e!r}")
        sys.exit(0)
