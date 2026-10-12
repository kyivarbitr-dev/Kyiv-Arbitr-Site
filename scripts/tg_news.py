#!/usr/bin/env python3
"""Публікує в Telegram-канал нові матеріали розділу «Новини» (news/news.json).

Новина потрапляє в канал, коли її дата настала (дата в майбутньому чекає свого дня),
один раз: опубліковані id зберігаються в data/tg-news-posted.json.
Перший запуск лише запам'ятовує вже наявні новини, щоб не засипати канал архівом.

Змінні середовища: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SITE_URL (типово https://kyivarbitr.com.ua),
TG_DRY_RUN=1 — лише показати повідомлення. Без токена скрипт нічого не робить.
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
NEWS_FILE = ROOT / "news" / "news.json"
POSTED_FILE = ROOT / "data" / "tg-news-posted.json"

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
SITE = os.environ.get("SITE_URL", "").strip().rstrip("/") or "https://kyivarbitr.com.ua"
DRY = os.environ.get("TG_DRY_RUN") == "1"
MAX_PER_RUN = 3                      # не більше трьох новин за раз, решта — наступного запуску
KYIV = timezone(timedelta(hours=3))  # дата «сьогодні» за Києвом (з точністю до години не критично)
CAPTION_MAX = 1024                   # межа підпису до фото в Telegram


def hashtag(tag: str) -> str:
    t = re.sub(r"[’'ʼ`]", "", tag or "")
    t = re.sub(r"[^\wА-Яа-яІіЇїЄєҐґ]+", "_", t).strip("_")
    return f"#{t}" if t else ""


def short(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def build(n: dict) -> tuple[str, str | None]:
    url = f"{SITE}/news.html#n-{urllib.parse.quote(str(n['id']))}"
    head = f"<b>{html.escape(n.get('title') or '')}</b>"
    tail = f'\n\n<a href="{url}">Читати на сайті</a>'
    src = n.get("link")
    if isinstance(src, str) and src.startswith(("http://", "https://")):
        tail += f' · <a href="{html.escape(src)}">{html.escape(n.get("linkLabel") or "Джерело")}</a>'
    tag = hashtag(n.get("tag") or "")
    if tag:
        tail += f"\n{html.escape(tag)}"
    room = CAPTION_MAX - len(re.sub(r"<[^>]+>", "", head + tail)) - 4
    body = html.escape(short(n.get("summary") or "", max(room, 120)))
    text = f"{head}\n\n{body}{tail}" if body else head + tail
    img = n.get("image")
    photo = f"{SITE}/news/{img}" if isinstance(img, str) and re.fullmatch(r"[\w\-/.]+\.(jpe?g|png|webp)", img, re.I) else None
    return text, photo


def api(method: str, params: dict):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{TOKEN}/{method}", data=data)
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.load(r)
    if not res.get("ok"):
        raise RuntimeError(res.get("description"))


def send(text: str, photo: str | None):
    if photo:
        try:
            api("sendPhoto", {"chat_id": CHAT, "photo": photo, "caption": text, "parse_mode": "HTML"})
            return
        except Exception as e:  # фото недоступне — надсилаємо текстом
            print(f"  фото не надіслано ({e}); надсилаю текстом")
    api("sendMessage", {"chat_id": CHAT, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true"})


def main():
    if not DRY and not (TOKEN and CHAT):
        print("Telegram (новини): токен або канал не задано — пропускаю")
        return 0
    news = json.loads(NEWS_FILE.read_text(encoding="utf-8"))
    today = datetime.now(KYIV).strftime("%Y-%m-%d")
    ready = [n for n in news if isinstance(n, dict) and n.get("id") and n.get("title") and str(n.get("date", "9999")) <= today]
    ready.sort(key=lambda n: (str(n["date"]), str(n["id"])))
    first = not POSTED_FILE.exists()
    posted = {} if first else json.loads(POSTED_FILE.read_text(encoding="utf-8")).get("ids", {})

    if first:
        for n in ready:
            posted[str(n["id"])] = today
        print(f"Telegram (новини): перший запуск — позначено як наявні {len(ready)} новин, нічого не публікую")
        pick = []
    else:
        pick = [n for n in ready if str(n["id"]) not in posted][:MAX_PER_RUN]

    for n in pick:
        text, photo = build(n)
        if DRY:
            print(photo or "(без фото)")
            print(text, "\n" + "-" * 60)
        else:
            send(text, photo)
            time.sleep(3)
        posted[str(n["id"])] = today
    if not DRY:
        POSTED_FILE.write_text(json.dumps({"updated": today, "ids": posted}, ensure_ascii=False, separators=(",", ":")),
                               encoding="utf-8")
    if pick:
        print(f"Telegram (новини): опубліковано {len(pick)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # збій Telegram не повинен ламати оновлення сайту
        print(f"Telegram (новини): помилка {e!r}")
        sys.exit(0)
