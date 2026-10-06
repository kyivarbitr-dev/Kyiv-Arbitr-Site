/* Розділ «Новини»: читає news/news.json і показує матеріали від найновіших до найстаріших. */
(function () {
  'use strict';
  var box = document.getElementById('news-list');
  var moreBtn = document.getElementById('news-more');
  if (!box) return;

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
    try { return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }); }
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
    var meta = el('div', 'news-meta');
    var t = el('time', null, fmtDate(n.date));
    t.setAttribute('datetime', n.date);
    meta.appendChild(t);
    if (n.tag) meta.appendChild(el('span', 'news-tag', n.tag));
    a.appendChild(meta);
    a.appendChild(el('h3', null, n.title));
    if (n.summary) a.appendChild(el('p', null, n.summary));

    if (n.text) {
      var det = el('details');
      det.appendChild(el('summary', null, 'Читати повністю'));
      var body = el('div', 'body');
      String(n.text).split(/\n{2,}/).forEach(function (par) {
        if (par.trim()) body.appendChild(el('p', null, par.trim()));
      });
      det.appendChild(body);
      a.appendChild(det);
    }
    var url = safeUrl(n.link);
    if (url) {
      var l = el('a', 'news-link', (n.linkLabel || 'Джерело') + ' →');
      l.href = url; l.target = '_blank'; l.rel = 'noopener';
      a.appendChild(l);
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

  fetch('news/news.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (list) {
      if (!Array.isArray(list)) throw new Error('format');
      var today = todayISO();
      items = list.filter(function (i) {
        return i && i.title && i.date && String(i.date) <= today; /* майбутні дати приховані до свого дня */
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      if (LIMIT) items = items.slice(0, LIMIT);
      while (box.firstChild) box.removeChild(box.firstChild);
      if (!items.length) { box.appendChild(el('p', 'w-loading', 'Новин поки немає.')); return; }
      renderMore();
    })
    .catch(function () { fail('Не вдалося завантажити новини. Спробуйте пізніше.'); });

  if (moreBtn) moreBtn.addEventListener('click', renderMore);
})();
