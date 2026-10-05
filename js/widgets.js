/* Віджети: курси НБУ, криптовалюти, Prozorro.Sale. Дані завантажуються у браузері відвідувача. */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';
  var NBU_PAGE = 'https://bank.gov.ua/ua/markets/exchangerates';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function cacheGet(k, ttl) {
    try {
      var s = localStorage.getItem(k);
      if (!s) return null;
      var o = JSON.parse(s);
      return (Date.now() - o.t > ttl) ? null : o.d;
    } catch (e) { return null; }
  }
  function cacheSet(k, d) {
    try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
  }
  function getJSON(url, key, ttl) {
    var cached = cacheGet(key, ttl);
    if (cached) return Promise.resolve(cached);
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) { cacheSet(key, d); return d; });
  }

  function fmt(n, d) {
    try {
      return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
    } catch (e) { return Number(n).toFixed(d); }
  }
  function fmtPrice(n) { return fmt(n, n >= 100 ? 2 : (n >= 1 ? 3 : 4)); }
  function showError(box, href, label) {
    clear(box);
    var p = el('p', 'w-err', 'Не вдалося завантажити дані. ');
    var a = el('a', null, label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    p.appendChild(a);
    box.appendChild(p);
  }

  /* ---------- Курси НБУ ---------- */
  function loadNBU() {
    var box = $('w-nbu'), meta = $('w-nbu-date');
    if (!box) return Promise.resolve();
    return getJSON(NBU_URL, 'w_nbu', 30 * 60 * 1000).then(function (list) {
      if (!Array.isArray(list)) throw new Error('format');
      var want = C.NBU_CURRENCIES || ['USD', 'EUR'];
      var rows = [], i;
      want.forEach(function (cc) {
        for (i = 0; i < list.length; i++) { if (list[i].cc === cc) { rows.push(list[i]); break; } }
      });
      if (!rows.length) throw new Error('empty');
      for (i = 0; i < list.length; i++) {
        if (list[i].cc === 'USD') { window.__usdRate = Number(list[i].rate); break; }
      }
      clear(box);
      rows.forEach(function (r) {
        var row = el('div', 'w-row');
        var left = el('div');
        left.appendChild(el('b', null, r.cc));
        left.appendChild(el('span', 'n', r.txt || ''));
        row.appendChild(left);
        row.appendChild(el('div', 'w-val', fmt(Number(r.rate), 4) + ' грн'));
        box.appendChild(row);
      });
      if (meta) meta.textContent = 'Офіційний курс НБУ на ' + (rows[0].exchangedate || '');
    }).catch(function () {
      showError(box, NBU_PAGE, 'Відкрити курси на bank.gov.ua');
      if (meta) meta.textContent = '';
    });
  }

  /* ---------- Криптовалюти (CoinGecko, запасний варіант Binance) ---------- */
  function loadCrypto(nbuPromise) {
    var box = $('w-crypto'), src = $('w-crypto-src');
    if (!box) return Promise.resolve();
    var coins = C.CRYPTO || [];
    var cgUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=' +
      coins.map(function (c) { return c.id; }).join(',') +
      '&vs_currencies=usd,uah&include_24hr_change=true';

    return getJSON(cgUrl, 'w_cg', 90 * 1000).then(function (d) {
      var out = coins.map(function (c) {
        var o = d[c.id];
        if (!o || typeof o.usd !== 'number') throw new Error('format');
        return { c: c, usd: o.usd, uah: o.uah, ch: o.usd_24h_change, src: 'CoinGecko' };
      });
      return out;
    }).catch(function () {
      var syms = JSON.stringify(coins.map(function (c) { return c.binance; }));
      var url2 = 'https://api.binance.com/api/v3/ticker/24hr?symbols=' + encodeURIComponent(syms);
      return Promise.all([getJSON(url2, 'w_bn', 90 * 1000), nbuPromise || Promise.resolve()]).then(function (r) {
        var arr = r[0];
        return coins.map(function (c) {
          var o = null;
          for (var i = 0; i < arr.length; i++) { if (arr[i].symbol === c.binance) { o = arr[i]; break; } }
          if (!o) throw new Error('format');
          var usd = parseFloat(o.lastPrice);
          return {
            c: c, usd: usd,
            uah: window.__usdRate ? usd * window.__usdRate : null,
            ch: parseFloat(o.priceChangePercent), src: 'Binance'
          };
        });
      });
    }).then(function (rows) {
      clear(box);
      rows.forEach(function (r) {
        var row = el('div', 'w-row');
        var left = el('div');
        left.appendChild(el('b', null, r.c.sym));
        left.appendChild(el('span', 'n', r.c.name));
        row.appendChild(left);
        var val = el('div', 'w-val', '$' + fmtPrice(r.usd));
        var parts = [];
        if (typeof r.uah === 'number' && isFinite(r.uah)) parts.push(fmt(r.uah, r.uah >= 100 ? 0 : 2) + ' грн');
        if (typeof r.ch === 'number' && isFinite(r.ch)) {
          parts.push((r.ch >= 0 ? '▲ +' : '▼ ') + r.ch.toFixed(2) + '% за 24 год');
        }
        if (parts.length) val.appendChild(el('small', null, parts.join(' · ')));
        row.appendChild(val);
        box.appendChild(row);
      });
      if (src) src.textContent = 'Джерело: ' + rows[0].src + '.';
    }).catch(function () {
      showError(box, 'https://www.coingecko.com/', 'Відкрити CoinGecko');
    });
  }

  /* ---------- Prozorro.Sale ---------- */
  function pickText(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      var keys = ['uk_UA', 'uk', 'ua', 'en_US', 'en'], i;
      for (i = 0; i < keys.length; i++) { if (typeof v[keys[i]] === 'string' && v[keys[i]]) return v[keys[i]]; }
      for (var k in v) { if (typeof v[k] === 'string' && v[k]) return v[k]; }
    }
    return '';
  }
  function loadProzorro() {
    var box = $('w-pz');
    if (!box) return Promise.resolve();
    var base = (C.PROZORRO_API || 'https://procedure.prozorro.sale/api').replace(/\/$/, '');
    var hours = C.PROZORRO_LOOKBACK_HOURS || 48;
    var since = new Date(Date.now() - hours * 3600 * 1000).toISOString().replace('Z', '000Z');
    var url = base + '/search/byDateModified/' + since + '?limit=100';

    return getJSON(url, 'w_pz', 15 * 60 * 1000).then(function (res) {
      var arr = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);
      if (!arr) throw new Error('format');
      if (window.console && console.info) console.info('[Prozorro.Sale] записів у вибірці:', arr.length);
      var re = new RegExp(C.PROZORRO_METHOD_REGEX || 'bankruptcy', 'i');
      var list = arr.filter(function (p) {
        var m = String(p.sellingMethod || p.procedureType || '');
        var s = String(p.status || '');
        return re.test(m) && (!s || /^active_(rectification|tendering)/.test(s));
      });
      list.sort(function (a, b) { return String(b.dateModified || '').localeCompare(String(a.dateModified || '')); });
      list = list.slice(0, C.PROZORRO_MAX_ITEMS || 6);
      clear(box);
      if (!list.length) {
        box.appendChild(el('p', 'w-loading', 'Зараз у вибірці немає відкритих лотів за цим напрямом. Перегляньте повний перелік на Prozorro.Sale.'));
        return;
      }
      list.forEach(function (p) {
        var id = p.auctionId || p.id || p._id;
        if (!id) return;
        var wrap = el('div', 'w-lot');
        var a = el('a', null, pickText(p.title) || pickText(p.description) || 'Лот ' + id);
        a.href = 'https://prozorro.sale/auction/' + encodeURIComponent(id);
        a.target = '_blank'; a.rel = 'noopener';
        wrap.appendChild(a);
        var bits = [];
        var v = p.value;
        var amount = (v && typeof v === 'object') ? v.amount : (typeof v === 'number' ? v : null);
        if (typeof amount === 'number') bits.push('Стартова ціна: ' + fmt(amount, 2) + ' ' + ((v && v.currency) || 'грн'));
        if (p.dateModified) bits.push('оновлено ' + String(p.dateModified).slice(0, 10));
        if (bits.length) wrap.appendChild(el('small', null, bits.join(' · ')));
        box.appendChild(wrap);
      });
    }).catch(function () {
      showError(box, 'https://prozorro.sale/prodazh-majna-borzhnikiv-u-spravah-pro-bankrutstvo', 'Відкрити Prozorro.Sale');
    });
  }

  function start() {
    var nbuP = loadNBU();
    loadCrypto(nbuP);
    loadProzorro();
    setInterval(function () { loadCrypto(Promise.resolve()); }, 120 * 1000);
  }

  var sec = $('info');
  if ('IntersectionObserver' in window && sec) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); start(); }
    }, { rootMargin: '300px' });
    io.observe(sec);
  } else {
    start();
  }
})();
