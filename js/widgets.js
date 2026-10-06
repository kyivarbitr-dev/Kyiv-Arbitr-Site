/* Віджети: курси НБУ і криптовалюти. Дані завантажуються у браузері відвідувача. Мова визначається атрибутом lang у <html>. */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var LOC = EN ? 'en-GB' : 'uk-UA';
  var T = EN ? {
    err: 'Could not load the data. ', nbuLink: 'Open rates on bank.gov.ua', uah: ' UAH',
    nbuDate: 'Official NBU rate as of ', day: '% in 24 h', src: 'Source: ', cg: 'Open CoinGecko'
  } : {
    err: 'Не вдалося завантажити дані. ', nbuLink: 'Відкрити курси на bank.gov.ua', uah: ' грн',
    nbuDate: 'Офіційний курс НБУ на ', day: '% за 24 год', src: 'Джерело: ', cg: 'Відкрити CoinGecko'
  };
  var CUR_EN = { USD: 'US Dollar', EUR: 'Euro', GBP: 'Pound Sterling', PLN: 'Polish Zloty', CHF: 'Swiss Franc', JPY: 'Japanese Yen', CNY: 'Chinese Yuan', CAD: 'Canadian Dollar' };
  var NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';
  var NBU_PAGE = EN ? 'https://bank.gov.ua/en/markets/exchangerates' : 'https://bank.gov.ua/ua/markets/exchangerates';

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
      return new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
    } catch (e) { return Number(n).toFixed(d); }
  }
  function fmtPrice(n) { return fmt(n, n >= 100 ? 2 : (n >= 1 ? 3 : 4)); }
  function showError(box, href, label) {
    clear(box);
    var p = el('p', 'w-err', T.err);
    var a = el('a', null, label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    p.appendChild(a);
    box.appendChild(p);
  }

  /* Значок-монета з символом валюти */
  var SYM = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', CHF: '₣', JPY: '¥', CNY: '¥', CAD: '$', BTC: '₿', ETH: 'Ξ', XRP: 'XRP' };
  function coin(code, idx, crypto) {
    var s = SYM[code] || code;
    var w = el('span', 'coin' + (crypto ? ' crypto' : '') + (s.length > 1 ? ' sm' : ''));
    w.setAttribute('aria-hidden', 'true');
    var i = el('i', null, s);
    i.style.setProperty('--d', (idx * 0.45) + 's');
    w.appendChild(i);
    return w;
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
      rows.forEach(function (r, idx) {
        var row = el('div', 'w-row');
        var left = el('div', 'w-name');
        left.appendChild(coin(r.cc, idx, false));
        var tx = el('div');
        tx.appendChild(el('b', null, r.cc));
        tx.appendChild(el('span', 'n', EN ? (CUR_EN[r.cc] || '') : (r.txt || '')));
        left.appendChild(tx);
        row.appendChild(left);
        row.appendChild(el('div', 'w-val', fmt(Number(r.rate), 4) + T.uah));
        box.appendChild(row);
      });
      if (meta) meta.textContent = T.nbuDate + (rows[0].exchangedate || '');
    }).catch(function () {
      showError(box, NBU_PAGE, T.nbuLink);
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
      rows.forEach(function (r, idx) {
        var row = el('div', 'w-row');
        var left = el('div', 'w-name');
        left.appendChild(coin(r.c.sym, idx + 4, true));
        var tx = el('div');
        tx.appendChild(el('b', null, r.c.sym));
        tx.appendChild(el('span', 'n', r.c.name));
        left.appendChild(tx);
        row.appendChild(left);
        var val = el('div', 'w-val', '$' + fmtPrice(r.usd));
        var parts = [];
        if (typeof r.uah === 'number' && isFinite(r.uah)) parts.push(fmt(r.uah, r.uah >= 100 ? 0 : 2) + T.uah);
        if (typeof r.ch === 'number' && isFinite(r.ch)) {
          parts.push((r.ch >= 0 ? '▲ +' : '▼ ') + r.ch.toFixed(2) + T.day);
        }
        if (parts.length) val.appendChild(el('small', null, parts.join(' · ')));
        row.appendChild(val);
        box.appendChild(row);
      });
      if (src) src.textContent = T.src + rows[0].src + '.';
    }).catch(function () {
      showError(box, 'https://www.coingecko.com/', T.cg);
    });
  }

  function start() {
    var nbuP = loadNBU();
    loadCrypto(nbuP);
    if ($('w-crypto')) setInterval(function () { loadCrypto(Promise.resolve()); }, 120 * 1000);
  }

  start();
})();
