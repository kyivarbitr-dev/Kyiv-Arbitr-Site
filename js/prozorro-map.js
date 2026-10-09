/* Мапа лотів Prozorro.Продажі (сторінка prozorro-map.html).
   Дані: /data/prozorro-ua.geojson — оновлюються щодня скриптом scripts/prozorro_ua.py. */
(function () {
  var root = document.getElementById('pm');
  if (!root || !window.L) return;

  var DATA_URL = '/data/prozorro-ua.geojson';
  var KYIV = 'м. Київ';
  var UNKNOWN = 'Регіон не визначено';
  var LIST_LIMIT = 300;
  var BASE_TITLE = document.title;
  var C_BK = '#9C7A3C', C_OTHER = '#0B1F3A';

  var map = L.map('pm-map', { scrollWheelZoom: false }).setView([48.6, 31.2], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(map);
  map.on('click', function () { map.scrollWheelZoom.enable(); });
  var cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 45, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
  map.addLayer(cluster);

  var feats = [], unplaced = [], regions = [], markers = {}, region = '';
  var $ = function (id) { return document.getElementById(id); };
  var regEl = $('pm-reg'), qEl = $('pm-q'), bkEl = $('pm-bk');
  var sideEl = $('pm-side'), sideH = $('pm-side-h'), backEl = $('pm-back');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(a, c) { if (a == null) return 'ціна не вказана'; try { return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: c || 'UAH', maximumFractionDigits: 0 }).format(a); } catch (e) { return a + ' ' + (c || ''); } }
  function date(s) { if (!s) return 'дата не вказана'; var d = new Date(s); return isNaN(d) ? 'дата не вказана' : d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function num(n) { return new Intl.NumberFormat('uk-UA').format(n); }
  function safeUrl(u) { return /^https:\/\//i.test(u || '') ? u : ''; }
  var STATUS = { active_rectification: 'період редагування', active_tendering: 'прийом заяв', active_auction: 'аукціон триває' };
  var PREC = {
    locality: 'Позначено в центрі населеного пункту: точну адресу не визначено.',
    region: 'Позначено в центрі області: точну адресу не визначено.',
    address: 'Розташування визначено за адресою приблизно.'
  };
  function regLabel(r) { return r === KYIV || r.indexOf('м. ') === 0 || r === 'АР Крим' || r === UNKNOWN ? r : r + ' область'; }
  function place(p) { return [p.region === KYIV ? '' : p.locality, p.address].filter(Boolean).join(', ') || 'адресу не вказано'; }
  function tag(p) { return p.bankruptcy ? '<span class="pm-tag">банкрутство</span>' : ''; }

  function popup(p) {
    var url = safeUrl(p.url);
    return '<div class="pm-pp"><div class="pm-pp-t">' + esc(p.title) + tag(p) + '</div>' +
      '<div class="pm-pp-r">' + esc(regLabel(p.region)) + '</div>' +
      '<div class="pm-pp-r">' + esc(place(p)) + '</div>' +
      '<div class="pm-pp-r"><b>' + esc(money(p.amount, p.currency)) + '</b> · аукціон: ' + esc(date(p.auctionStart)) + '</div>' +
      '<div class="pm-pp-r">Статус: ' + esc(STATUS[p.status] || p.status) + '</div>' +
      (url ? '<a class="pm-pp-a" href="' + esc(url) + '" target="_blank" rel="noopener">Відкрити лот на Prozorro.Sale</a>' : '') +
      (PREC[p.precision] ? '<div class="pm-pp-w">' + PREC[p.precision] + '</div>' : '') + '</div>';
  }

  function matches(p, ignoreRegion) {
    if (!ignoreRegion && region && p.region !== region) return false;
    if (bkEl.checked && !p.bankruptcy) return false;
    var q = qEl.value.trim().toLowerCase();
    return !q || ((p.title || '') + ' ' + (p.address || '') + ' ' + (p.locality || '')).toLowerCase().indexOf(q) !== -1;
  }

  function lotRow(p, i) {
    var url = safeUrl(p.url);
    return '<div class="pm-lot"' + (i != null ? ' data-i="' + i + '" tabindex="0" role="button"' : '') + '>' +
      '<div class="pm-lot-t">' + esc(p.title) + tag(p) + '</div>' +
      '<div class="pm-lot-a">' + esc(place(p)) + '</div>' +
      '<div class="pm-lot-m"><span class="pm-price">' + esc(money(p.amount, p.currency)) + '</span> · ' + esc(date(p.auctionStart)) +
      (i == null && url ? ' · <a href="' + esc(url) + '" target="_blank" rel="noopener">лот</a>' : '') + '</div></div>';
  }

  function regRow(r, n, nb, cls) {
    return '<button type="button" class="pm-reg' + (cls ? ' ' + cls : '') + '" data-r="' + esc(r) + '"><span class="n">' + esc(regLabel(r)) + '</span>' +
      '<span class="c">' + num(n) + (nb ? '<small>' + num(nb) + ' банкр.</small>' : '') + '</span></button>';
  }

  function render(fit) {
    cluster.clearLayers(); markers = {};
    var ms = [], bounds = [], visible = [];
    feats.forEach(function (f, i) {
      var p = f.properties; if (!matches(p)) return;
      var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      var m = L.circleMarker(ll, { radius: 7, weight: 2, color: '#fff', fillOpacity: .95, fillColor: p.bankruptcy ? C_BK : C_OTHER }).bindPopup(popup(p));
      markers[i] = m; ms.push(m); bounds.push(ll); visible.push(i);
    });
    cluster.addLayers(ms);
    if (fit && region && bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: region === KYIV ? 12 : 10 });
    if (fit && !region) map.setView([48.6, 31.2], 6);

    backEl.hidden = !region;
    if (!region) {
      var counts = {};
      feats.map(function (f) { return f.properties; }).concat(unplaced).forEach(function (p) {
        if (!matches(p, true)) return;
        var c = counts[p.region] || (counts[p.region] = { n: 0, b: 0 }); c.n++; if (p.bankruptcy) c.b++;
      });
      var html = '', any = false;
      if (counts[KYIV]) { html += '<div class="pm-group">Місто Київ</div>' + regRow(KYIV, counts[KYIV].n, counts[KYIV].b, 'city'); any = true; }
      var rest = regions.filter(function (r) { return r.name !== KYIV && counts[r.name]; });
      if (rest.length) html += '<div class="pm-group">Області</div>';
      rest.forEach(function (r) { html += regRow(r.name, counts[r.name].n, counts[r.name].b); any = true; });
      sideH.textContent = 'Регіони';
      sideEl.innerHTML = any ? html : '<div class="pm-empty">' + (feats.length || unplaced.length ? 'Немає лотів за цими умовами.' : 'Дані ще збираються. Перше оновлення з’явиться після нічного запуску.') + '</div>';
    } else {
      var rows = visible.slice(0, LIST_LIMIT).map(function (i) { return lotRow(feats[i].properties, i); }).join('');
      sideH.textContent = regLabel(region) + ': ' + num(visible.length);
      sideEl.innerHTML = (rows || '<div class="pm-empty">Немає лотів на мапі за цими умовами.</div>') +
        (visible.length > LIST_LIMIT ? '<div class="pm-empty">Показано перші ' + LIST_LIMIT + ' (найближчі аукціони). Уточніть пошук, щоб побачити інші.</div>' : '');
    }

    var un = unplaced.filter(function (p) { return matches(p); });
    $('pm-un-n').textContent = num(un.length);
    $('pm-unplaced').hidden = !un.length;
    $('pm-un-list').innerHTML = un.slice(0, LIST_LIMIT).map(function (p) { return lotRow(p, null); }).join('');
  }

  function setRegion(r) {
    region = r || ''; regEl.value = region;
    document.title = region ? 'Лоти: ' + regLabel(region) + ' · ' + BASE_TITLE : BASE_TITLE;
    try { var u = new URL(location.href); if (region) u.searchParams.set('region', region); else u.searchParams.delete('region'); history.replaceState(null, '', u); } catch (e) {}
    render(true);
  }

  function focusLot(el) {
    var m = markers[el.getAttribute('data-i')]; if (!m) return;
    cluster.zoomToShowLayer(m, function () { m.openPopup(); });
    if (window.innerWidth <= 900) $('pm-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  sideEl.addEventListener('click', function (e) {
    var reg = e.target.closest('.pm-reg'); if (reg) { setRegion(reg.getAttribute('data-r')); return; }
    var el = e.target.closest('.pm-lot[data-i]'); if (el) focusLot(el);
  });
  sideEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest('.pm-lot[data-i]'); if (el) { e.preventDefault(); focusLot(el); }
  });
  backEl.addEventListener('click', function () { setRegion(''); });
  regEl.addEventListener('change', function () { setRegion(regEl.value); });
  qEl.addEventListener('input', function () { render(false); });
  bkEl.addEventListener('change', function () { render(false); });

  fetch(DATA_URL + '?v=' + new Date().toISOString().slice(0, 10))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (gj) {
      var md = gj.metadata || {};
      feats = gj.features || []; unplaced = md.unplaced || []; regions = md.regions || [];
      var kyiv = regions.filter(function (r) { return r.name === KYIV; })[0];
      var bk = regions.reduce(function (s, r) { return s + (r.bankruptcy || 0); }, 0);
      $('pm-s-total').textContent = num(md.total != null ? md.total : feats.length);
      $('pm-s-kyiv').textContent = num(kyiv ? kyiv.count : 0);
      $('pm-s-bk').textContent = num(bk);
      $('pm-s-upd').textContent = md.updated ? new Date(md.updated).toLocaleDateString('uk-UA') : 'очікується';
      regEl.innerHTML = '<option value="">Уся Україна</option>' + regions.map(function (r) {
        return '<option value="' + esc(r.name) + '">' + esc(regLabel(r.name)) + ' (' + num(r.count) + ')</option>';
      }).join('');
      var start = ''; try { start = new URL(location.href).searchParams.get('region') || ''; } catch (e) {}
      if (start && !regions.some(function (r) { return r.name === start; })) start = '';
      setRegion(start);
    })
    .catch(function () { sideEl.innerHTML = '<div class="pm-empty">Дані тимчасово недоступні. Спробуйте пізніше.</div>'; });
})();
