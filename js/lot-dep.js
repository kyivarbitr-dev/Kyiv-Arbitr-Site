/* Перевірка лота: безкоштовна картка ризиків за даними оголошення Prozorro.Продажі.
   Дані: /data/dep-lots.json (оновлює scripts/prozorro_ua.py раз на добу). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var list = $('dep-list'), card = $('dep-card');
  if (!list || !card) return;

  var NUM = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
  var KIND = { bk: 'Майно банкрута', state: 'Актив держбанку', fgv: 'Актив ФГВФО', claim: 'Права вимоги' };
  var OCCUPIED = ['Донецька', 'Луганська', 'АР Крим', 'м. Севастополь'];
  var FRONT = ['Херсон', 'Ізюм', 'Краматорськ', 'Дружківка', 'Білозерське', "Куп'янськ", 'Куп’янськ', 'Нова Каховка', 'Покровськ', 'Костянтинівка'];
  var LV = { high: 'Критично', mid: 'Увага', info: 'Довідка' };
  var LOTS = [], current = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  function text(l) { return (l.t + ' ' + l.d).toLowerCase(); }
  function isClaim(l) { return /прав[оа]? вимоги|продаж боргу|дебіторськ/i.test(l.t + ' ' + l.d) || /права вимоги/i.test(l.c); }
  function kind(l) {
    if (isClaim(l) && !/^BR/.test(l.id)) return 'claim';
    if (/^BR/.test(l.id) || l.bk) return 'bk';
    if (/^NL/.test(l.id)) return 'state';
    if (/^GF/.test(l.id)) return 'fgv';
    return 'claim';
  }
  function secured(l) { return /заставлен|застав[уіа]|іпотек|забезпечен(ого|ий|им) кредитор|предмет(ом)? забезпечення/i.test(l.t + ' ' + l.d); }
  function days(l) {
    if (!l.st) return null;
    var d = new Date(l.st); if (isNaN(d)) return null;
    var now = new Date(); now.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 864e5);
  }
  function area(l) {
    var m = (l.t + ' ' + l.d).match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(?:кв\.?\s*м|м²|м2)/i);
    if (!m) return null;
    var v = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    return v > 0 ? v : null;
  }
  function caseNo(l) { var m = (l.t + ' ' + l.d).match(/справ[іиа]\s*№\s*([\w\/\-.]+)/i); return m ? m[1].replace(/[.,]$/, '') : ''; }

  function flags(l) {
    var f = [], t = text(l), place = (l.lc + ' ' + l.ad + ' ' + l.t), claim = isClaim(l);
    function add(lv, x) { f.push({ lv: lv, x: x }); }
    if (secured(l)) add('high', 'В оголошенні згадано заставу, іпотеку або забезпеченого кредитора. Виручка йде насамперед йому, а продаж потребує його згоди: перевірте її наявність у документах лота.');
    if (OCCUPIED.indexOf(l.rg) >= 0 || /донецьк|луганськ|криму|севастопол/i.test(l.t)) add('high', 'Регіон, де частина території окупована або перебуває в зоні бойових дій. Доступ до об’єкта, огляд і реєстрація права можуть бути неможливі.');
    else if (FRONT.some(function (c) { return place.indexOf(c) >= 0; })) add('mid', 'Місто в зоні підвищеного ризику бойових дій. Перевірте Реєстр пошкодженого та знищеного майна і фактичний стан об’єкта.');
    if (claim && /рф|російськ|агресі/i.test(t)) add('high', 'Вимога до держави-агресора. Строки й реальність стягнення залежать від міжнародних механізмів компенсації.');
    if (claim && /субсидіар|солідарн|фізичн(ої|их) особ/i.test(t)) add('mid', 'Вимога до фізичних осіб або в порядку субсидіарної відповідальності. Перевірте, чи є в боржників майно, на яке можна звернути стягнення.');
    if (claim) add('info', 'Купуючи право вимоги, ви отримуєте борг, а не гроші. Результат залежить від платоспроможності боржника й забезпечення.');
    if (/пул|пакет/i.test(t)) add('info', 'Пул або пакет активів. Склад і якість окремих позицій видно лише в паспорті лота.');
    if (/повторн/i.test(t)) add('mid', 'Повторний аукціон: попередні торги не відбулися. Варто з’ясувати причину.');
    if (/^[A-Z]{2}D/.test(l.id)) add('info', 'Голландський аукціон: ціна може знижуватися під час торгів.');
    if (/право (суб)?оренди/i.test(t)) add('mid', 'Продається право оренди, а не власність. Перевірте строк договору й розмір орендної плати.');
    if (/\b\d{1,3}\/(100|1000)\b|\b1\/2\b|частк[аиуі]\b|частин[аиу] (нежитлов|будівл|приміщ)/i.test(l.t)) add('mid', 'Продається частка або частина об’єкта. Користування буде спільним з іншими власниками.');
    // Земля потрібна лише для окремої будівлі чи приватного будинку. Квартира, офіс або приміщення
    // всередині будівлі окремої ділянки не мають, тож для них прапорець не ставимо.
    var tNoAddr = l.t.replace(/(будин(ок|ку)|буд\.)\s*№?\s*\d+[\wа-яіїєґ\/-]*/gi, '').replace(/(у|в)\s+(житлов\S*\s+|нежитлов\S*\s+|багатоквартирн\S*\s+)?будин\S*/gi, '');
    // Предмет продажу — початок назви до опису й адреси: «Нежитлова будівля. Опис: приміщення 1–19» — це будівля.
    var head = l.t.split(/опис об|адреса:|загальною площею/i)[0];
    var bldFirst = /^\s*(\S+\s+){0,3}(будівл|житлов\S* будин|майнов\S* комплекс|цілісн)/i.test(head) || /окрем\S*\s+(розташован\S*\s+)?(\S+\s+)?будівл/i.test(l.t);
    var premises = !bldFirst && /квартир|приміщен|офіс|кімнат|машино-?місц|паркомісц|гаражн\S* бокс/i.test(head);
    var building = /будівл[яіею]|будівель|житлов(ий|ого) будин|індивідуальн\S* (житлов\S* )?будин|садибн|дачн\S* будин|котедж|майнов(ий|ого|і) комплекс|цілісн\S* майнов|(^|[\s«"(])склад(и|ів|ськ\S*)?([\s,.;)»"]|$)|ангар|споруд/i.test(tNoAddr);
    if (!claim && !premises && building && !/мобільн|вагон|ділянк|кадастров/i.test(t)) add('mid', 'Право на землю під будівлею в оголошенні не вказано. Від нього залежить, чи зможете ви користуватися ділянкою: потрібна перевірка кадастру й реєстру.');
    if (!claim && !secured(l)) add('info', 'Іпотека в оголошенні не згадана. Це не означає, що обтяжень немає: потрібен витяг з Державного реєстру речових прав.');
    var d = days(l);
    if (d != null && d <= 3) add('high', 'До аукціону ' + (d <= 0 ? 'менше доби' : 'залишилось днів: ' + d) + '. Кінцевий строк подання пропозицій настає раніше: перевірте його на сторінці лота.');
    return f;
  }
  function verdict(f) {
    var h = f.filter(function (x) { return x.lv === 'high'; }).length, m = f.filter(function (x) { return x.lv === 'mid'; }).length;
    if (h) return { k: 'high', t: 'Підвищений ризик', s: 'Критичних прапорців: ' + h + ', помірних: ' + m + '.' };
    if (m) return { k: 'mid', t: 'Потребує перевірки', s: 'Помірних прапорців: ' + m + '.' };
    return { k: 'ok', t: 'Явних прапорців немає', s: 'Лише за текстом оголошення. Реєстри не перевірено.' };
  }

  function placeStr(l) {
    var parts = [l.rg];
    if (l.lc && l.rg.replace(/^м\.\s*/, '') !== l.lc) parts.push(l.lc);
    if (l.ad) parts.push(l.ad);
    return parts.filter(Boolean).join(', ') || 'не вказано';
  }
  function money(l) {
    if (l.a == null) return 'не вказано';
    if (l.cur && l.cur !== 'UAH') return NUM.format(l.a) + ' ' + esc(l.cur);
    return NUM.format(l.a) + ' грн';
  }
  function dateStr(l) {
    if (!l.st) return 'не вказано';
    var d = new Date(l.st); if (isNaN(d)) return 'не вказано';
    var n = days(l);
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) + (n != null && n >= 0 ? ' · через ' + n + ' дн.' : '');
  }

  function show(l, scroll) {
    current = l;
    try { history.replaceState(null, '', '?lot=' + encodeURIComponent(l.id)); } catch (e) {}
    var f = flags(l), v = verdict(f), a = area(l), cn = caseNo(l), k = kind(l);
    var rows = [
      ['Тип продажу', KIND[k]],
      l.ln ? ['Номер лоту', l.ln] : null,
      l.s ? ['Організатор', l.s] : null,
      cn ? ['Справа №', cn] : null,
      ['Місце', placeStr(l)],
      l.c ? ['Класифікація', l.c] : null,
      ['Стартова ціна', money(l)],
      a && l.a && k !== 'claim' && (!l.cur || l.cur === 'UAH') ? ['Ціна за м²', '≈ ' + NUM.format(l.a / a) + ' грн (площа з оголошення ' + String(a).replace('.', ',') + ' м²)'] : null,
      ['Аукціон', dateStr(l)]
    ].filter(Boolean);
    card.innerHTML =
      '<p class="eyebrow">Картка ризиків · безкоштовно</p>' +
      '<h2 class="dep-title' + (l.t.length > 140 ? ' long' : '') + '">' + esc(l.t) + '</h2>' +
      '<a class="dep-id" href="https://prozorro.sale/auction/' + encodeURIComponent(l.id) + '" target="_blank" rel="noopener">' + esc(l.id) + ' ↗</a>' +
      '<div class="dep-verdict ' + v.k + '"><span class="dep-dot"></span><div><b>' + v.t + '</b><span>' + v.s + '</span></div></div>' +
      '<h3 class="dep-h">Прапорці ризику</h3>' +
      '<ul class="dep-flags">' + f.map(function (x) { return '<li class="' + x.lv + '"><span class="lv">' + LV[x.lv] + '</span><span>' + esc(x.x) + '</span></li>'; }).join('') + '</ul>' +
      '<h3 class="dep-h">Що відомо з оголошення</h3>' +
      '<table class="dep-facts"><tbody>' + rows.map(function (r) { return '<tr><th scope="row">' + r[0] + '</th><td>' + (r[0] === 'Стартова ціна' || r[0] === 'Ціна за м²' ? r[1] : esc(r[1])) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h3 class="dep-h">Що картка не перевіряє</h3>' +
      '<ul class="dep-todo"><li>Власника й обтяження за Державним реєстром речових прав</li><li>Право на землю й кадастрові дані</li><li>Судові спори щодо об’єкта та виконавчі провадження</li><li>Ризик оскарження результатів торгів</li><li>Фактичний технічний стан</li></ul>' +
      '<a class="btn btn-primary" href="#order" id="dep-go">Замовити перевірку цього лота</a>';
    $('dep-lot').setAttribute('value', l.id); $('dep-lot').value = l.id;
    $('dep-order-lot').innerHTML = 'Лот: <a href="https://prozorro.sale/auction/' + encodeURIComponent(l.id) + '" target="_blank" rel="noopener">' + esc(l.id) + '</a>';
    [].forEach.call(list.querySelectorAll('.pm-lot'), function (b) { b.classList.toggle('on', b.getAttribute('data-id') === l.id); });
    if (scroll && window.matchMedia && matchMedia('(max-width: 1023px)').matches) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    var q = $('dep-q').value.trim().toLowerCase(), kd = $('dep-kind').value, sec = $('dep-sec').checked;
    var words = q ? q.split(/\s+/) : [];
    var hits = LOTS.filter(function (l) {
      if (kd && l.k !== kd) return false;
      if (sec && !l.sec) return false;
      return words.every(function (w) { return l.hay.indexOf(w) >= 0; });
    });
    $('dep-count').textContent = 'Лотів: ' + NUM.format(hits.length);
    if (!LOTS.length) { list.innerHTML = '<div class="pm-empty">Дані про лоти ще не завантажилися. Оновіть сторінку трохи пізніше.</div>'; return; }
    if (!hits.length) { list.innerHTML = '<div class="pm-empty">Немає лотів за цими умовами. Перевірте номер або змініть фільтр.</div>'; return; }
    list.innerHTML = hits.slice(0, 200).map(function (l) {
      return '<button type="button" class="pm-lot dep-lot" data-id="' + esc(l.id) + '">' +
        '<span class="pm-lot-t">' + esc(l.t) + '</span>' +
        '<span class="pm-lot-m"><span class="pm-price">' + money(l) + '</span> · ' + esc(l.lc || l.rg || '') + (l.sec ? '<span class="pm-tag">застава</span>' : '') + '</span>' +
        '</button>';
    }).join('') + (hits.length > 200 ? '<div class="pm-empty">Показано 200 з ' + NUM.format(hits.length) + '. Уточніть пошук.</div>' : '');
    if (current) [].forEach.call(list.querySelectorAll('.pm-lot'), function (b) { b.classList.toggle('on', b.getAttribute('data-id') === current.id); });
  }

  list.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.dep-lot') : null;
    if (!b) return;
    var l = LOTS.find(function (x) { return x.id === b.getAttribute('data-id'); });
    if (l) show(l, true);
  });
  ['dep-q', 'dep-kind', 'dep-sec'].forEach(function (id) { $(id).addEventListener(id === 'dep-q' ? 'input' : 'change', render); });

  (window.loadSiteData ? window.loadSiteData('dep-lots.json') : fetch('/data/dep-lots.json').then(function (r) { return r.ok ? r.json() : null; })).then(function (d) {
    if (!d || !d.lots) throw new Error('no data');
    LOTS = d.lots;
    LOTS.forEach(function (l) { l.k = kind(l); l.sec = secured(l); l.hay = [l.id, l.ln, l.t, l.d, l.s, l.rg, l.lc, l.ad, l.c].join(' ').toLowerCase(); });
    $('dep-s-total').textContent = NUM.format(LOTS.length);
    $('dep-s-bk').textContent = NUM.format(LOTS.filter(function (l) { return l.k === 'bk'; }).length);
    $('dep-s-sec').textContent = NUM.format(LOTS.filter(function (l) { return l.sec; }).length);
    $('dep-s-upd').textContent = d.updated ? new Date(d.updated).toLocaleDateString('uk-UA') : '—';
    $('dep-stats').hidden = false;
    var p = new URLSearchParams(location.search).get('lot');
    render();
    var pre = p && LOTS.find(function (l) { return l.id === p; });
    show(pre || LOTS.filter(function (l) { return l.sec; })[0] || LOTS[0], false);
  }).catch(function () {
    list.innerHTML = '<div class="pm-empty">Не вдалося завантажити дані. Оновіть сторінку пізніше або перегляньте лоти на <a href="https://prozorro.sale/auction" target="_blank" rel="noopener">prozorro.sale</a>.</div>';
  });
})();
