/* Розділ «Новини»: читає news/news.json і показує матеріали від найновіших до найстаріших. */
(function () {
  'use strict';
  var box = document.getElementById('news-list');
  var moreBtn = document.getElementById('news-more');
  if (!box) return;
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var T = EN ? { more: 'Read more', src: 'Source', none: 'No news yet.', fail: 'Could not load the news. Please try again later.' }
             : { more: 'Читати повністю', src: 'Джерело', none: 'Новин поки немає.', fail: 'Не вдалося завантажити новини. Спробуйте пізніше.' };
  /* Англійська версія показує поля title_en, summary_en, text_en, tag_en, linkLabel_en */
  function f(n, k) { return EN ? n[k + '_en'] : n[k]; }
  var SRC = box.getAttribute('data-src') || 'news/news.json';
  var BASE = SRC.replace(/[^\/]*$/, '');

  var LIMIT = parseInt(box.getAttribute('data-limit'), 10) || 0;
  var PAGE = 6;
  var items = [];
  var shown = 0;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function safeUrl(u) { return (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : null; }
  function fmtDate(s) {
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return s;
    try { return d.toLocaleDateString(EN ? 'en-GB' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return s; }
  }
  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function card(n) {
    var a = el('article', 'news-card scroll-reveal');
    var wrap = a;
    /* Картинка до новини: поле image (шлях відносно папки news/), image_alt / image_alt_en */
    if (n.image && /^[\w\-\/.]+\.(jpe?g|png|webp)$/i.test(n.image)) {
      a.className += ' has-img';
      var fig = el('figure', 'news-img');
      var img = el('img');
      img.src = BASE + n.image;
      img.alt = f(n, 'image_alt') || f(n, 'title') || '';
      img.loading = 'lazy'; img.decoding = 'async'; img.width = 1200; img.height = 630;
      fig.appendChild(img);
      a.appendChild(fig);
      wrap = el('div', 'news-body');
      a.appendChild(wrap);
    }
    var meta = el('div', 'news-meta');
    var t = el('time', null, fmtDate(n.date));
    t.setAttribute('datetime', n.date);
    meta.appendChild(t);
    if (f(n, 'tag')) meta.appendChild(el('span', 'news-tag', f(n, 'tag')));
    wrap.appendChild(meta);
    wrap.appendChild(el('h3', null, f(n, 'title')));
    if (f(n, 'summary')) wrap.appendChild(el('p', null, f(n, 'summary')));

    if (f(n, 'text')) {
      var det = el('details');
      det.appendChild(el('summary', null, T.more));
      var body = el('div', 'body');
      String(f(n, 'text')).split(/\n{2,}/).forEach(function (par) {
        if (par.trim()) body.appendChild(el('p', null, par.trim()));
      });
      det.appendChild(body);
      wrap.appendChild(det);
    }
    var url = safeUrl(n.link);
    if (url) {
      var l = el('a', 'news-link', (f(n, 'linkLabel') || T.src) + ' →');
      l.href = url; l.target = '_blank'; l.rel = 'noopener';
      wrap.appendChild(l);
    }
    return a;
  }

  function renderMore() {
    var end = Math.min(shown + (LIMIT || PAGE), items.length);
    for (; shown < end; shown++) box.appendChild(card(items[shown]));
    if (moreBtn) moreBtn.hidden = shown >= items.length;
  }

  function fail(msg) {
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(el('p', 'w-err', msg));
  }

  fetch(SRC, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (list) {
      if (!Array.isArray(list)) throw new Error('format');
      var today = todayISO();
      items = list.filter(function (i) {
        return i && f(i, 'title') && i.date && String(i.date) <= today; /* майбутні дати приховані до свого дня */
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      if (LIMIT) items = items.slice(0, LIMIT);
      while (box.firstChild) box.removeChild(box.firstChild);
      if (!items.length) { box.appendChild(el('p', 'w-loading', T.none)); return; }
      renderMore();
    })
    .catch(function () { fail(T.fail); });

  if (moreBtn) moreBtn.addEventListener('click', renderMore);
})();
