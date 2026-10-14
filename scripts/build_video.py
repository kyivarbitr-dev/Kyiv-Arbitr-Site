#!/usr/bin/env python3
"""Сторінка «Відео», відео-блоки на сторінках послуг, пункт меню і запис у sitemap — з video/videos.json.

Новий ролик: покласти video/<id>.mp4 (720×1280, ~1 МБ) і video/<id>.jpg (обкладинка), додати запис у videos.json,
за потреби — id у "pages", і запустити:
  python scripts/build_video.py
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "video" / "videos.json").read_text(encoding="utf-8"))
SITE = "https://kyivarbitr.com.ua"
UPLOAD = "2026-10-15"
V = {v["id"]: v for v in DATA["videos"]}
START, END = "<!-- videos:start -->", "<!-- videos:end -->"


def esc(s) -> str:
    return html.escape(str(s or ""), quote=True)


def nb(s: str) -> str:
    return re.sub(r"(?<=\s)(\w{1,2}) ", lambda m: m.group(1) + "&nbsp;", s)


def card(v: dict, prefix: str = "") -> str:
    return (f'<figure class="vcard"><video controls preload="none" playsinline poster="{prefix}video/{v["id"]}.jpg" width="720" height="1280" '
            f'aria-label="{esc(v["title"])}"><source src="{prefix}video/{v["id"]}.mp4" type="video/mp4"></video>'
            f'<figcaption><b>{nb(esc(v["title"]))}</b><span>{nb(esc(v["desc"]))}</span></figcaption></figure>')


def ld_video(v: dict) -> dict:
    return {"@type": "VideoObject", "name": v["title"], "description": v["desc"],
            "thumbnailUrl": f"{SITE}/video/{v['id']}.jpg", "contentUrl": f"{SITE}/video/{v['id']}.mp4",
            "uploadDate": UPLOAD, "duration": f"PT{int(v['dur'])}S", "inLanguage": "uk",
            "author": {"@id": f"{SITE}/#person"}}


# ---------- 1. меню «Відео» на всіх українських сторінках ----------
def add_menu(text: str, current: bool = False) -> str:
    if 'href="video.html"' not in text:
        text = re.sub(r'(<a href="news.html"(?: aria-current="page")?>Новини</a>)',
                      r'\1<a href="video.html">Відео</a>', text, count=1)
        text = text.replace('<li><a href="news.html">Новини</a></li>',
                            '<li><a href="news.html">Новини</a></li>\n          <li><a href="video.html">Відео</a></li>', 1)
    return text


for p in sorted(ROOT.glob("*.html")):
    t = p.read_text(encoding="utf-8")
    t2 = add_menu(t)
    if t2 != t:
        p.write_text(t2, encoding="utf-8")

# ---------- 2. сторінка video.html (шаблон — news.html) ----------
tpl = (ROOT / "news.html").read_text(encoding="utf-8")
head, rest = tpl.split("<main>", 1)
_, foot = rest.split("</main>", 1)
title = "Відео · Раковський О. П."
desc = "Короткі відео про банкрутство, права кредиторів, розшук активів, ліквідацію ТОВ, торги Prozorro.Продажі та зняття арештів."
h = head
h = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", h, count=1, flags=re.S)
h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc}">', h, count=1)
h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{title}">', h, count=1)
h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{desc}">', h, count=1)
h = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{SITE}/video">', h, count=1)
h = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{SITE}/video">', h, count=1)
h = re.sub(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n', "", h)
h = re.sub(r'<link rel="alternate" type="application/rss\+xml"[^>]*>\n', "", h)
h = h.replace('<script src="js/news.js" defer></script>\n', "")
h = h.replace('<a href="news.html" aria-current="page">Новини</a>', '<a href="news.html">Новини</a>')
h = h.replace('<a href="video.html">Відео</a>', '<a href="video.html" aria-current="page">Відео</a>', 1)
h = h.replace('<a href="news.html" lang="uk" hreflang="uk" aria-current="true">UA</a><a href="en/news.html" lang="en" hreflang="en">EN</a>',
              '<a href="video.html" lang="uk" hreflang="uk" aria-current="true">UA</a><a href="en/index.html" lang="en" hreflang="en">EN</a>')
ld = {"@context": "https://schema.org", "@type": "ItemList", "name": "Відео · Раковський О. П.",
      "itemListElement": [{"@type": "ListItem", "position": i + 1, "item": ld_video(v)} for i, v in enumerate(DATA["videos"])]}
h = h.replace("</head>", '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>\n</head>", 1)

sections = []
for tp in DATA["topics"]:
    vids = [v for v in DATA["videos"] if v["topic"] == tp["id"]]
    if not vids:
        continue
    sections.append(f'    <h2 class="sub-h vtopic" id="{tp["id"]}">{nb(esc(tp["title"]))}</h2>\n    <div class="vgrid">\n      '
                    + "\n      ".join(card(v) for v in vids) + "\n    </div>")
nav = " ".join(f'<a href="video.html#{tp["id"]}">{esc(tp["title"])}</a>' for tp in DATA["topics"])
main = f"""<main>
<section id="video">
  <div class="wrap">
    <div class="section-head scroll-reveal">
      <p class="eyebrow">Відео</p>
      <h1>Коротко про&nbsp;процедури</h1>
      <p class="lead">Відео про&nbsp;банкрутство, права кредиторів, розшук активів, ліквідацію, торги та&nbsp;зняття арештів.</p>
    </div>
    <nav class="vtopics" aria-label="Теми відео">{nav}</nav>
{chr(10).join(sections)}
    <aside class="tg-cta">
      <p><b>Нові відео, лоти й&nbsp;новини&nbsp;— у&nbsp;Telegram і&nbsp;на&nbsp;YouTube.</b> Маєте запитання щодо своєї ситуації&nbsp;— напишіть або зателефонуйте.</p>
      <a class="btn btn-primary" href="contacts.html">Отримати консультацію</a>
    </aside>
    <p class="note">Відео мають загальний інформаційний характер і&nbsp;не&nbsp;є юридичною консультацією. Норми законодавства перевіряйте в&nbsp;актуальній редакції.</p>
  </div>
</section>
</main>"""
(ROOT / "video.html").write_text(h + main + foot, encoding="utf-8")

# ---------- 3. відео-блоки на сторінках послуг ----------
for page, ids in DATA["pages"].items():
    p = ROOT / page
    t = p.read_text(encoding="utf-8")
    vids = [V[i] for i in ids if i in V]
    block = (f'{START}\n<section class="vblock">\n  <div class="wrap">\n    <h2 class="sub-h">Коротко у&nbsp;відео</h2>\n    <div class="vgrid">\n      '
             + "\n      ".join(card(v) for v in vids)
             + '\n    </div>\n    <p><a class="news-link" href="video.html">Усі відео →</a></p>\n  </div>\n</section>\n' + END)
    if START in t:
        t = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda m: block, t, flags=re.S)
    else:
        t = t.replace("</main>", block + "\n</main>", 1)
    p.write_text(t, encoding="utf-8")

# ---------- 4. sitemap ----------
sm = ROOT / "sitemap.xml"
x = sm.read_text(encoding="utf-8")
if f"<loc>{SITE}/video</loc>" not in x:
    x = x.replace("  <!-- news:start -->", f"  <url>\n    <loc>{SITE}/video</loc>\n    <lastmod>{UPLOAD}</lastmod>\n  </url>\n  <!-- news:start -->", 1)
    sm.write_text(x, encoding="utf-8")
print(f"Відео: {len(DATA['videos'])} роликів, сторінок з блоками: {len(DATA['pages'])}")
