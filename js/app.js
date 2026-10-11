/* Загальна логіка сайту: аналітика, карта, форма звернення. */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';

  /* Google Analytics 4 (вмикається, якщо вказано GA4_ID) */
  if (C.GA4_ID) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(C.GA4_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', C.GA4_ID);
  }

  /* Власний код карти замість типового */
  if (C.MAP_EMBED_URL) {
    var mf = document.getElementById('map-iframe');
    if (mf) mf.src = C.MAP_EMBED_URL;
  }

  /* Мобільне меню */
  var mb = document.querySelector('.menu-btn');
  var hd = document.querySelector('header.site');
  if (mb && hd) {
    mb.addEventListener('click', function () {
      var open = hd.classList.toggle('open');
      mb.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* Форма звернення */
  var f = document.getElementById('f');
  var st = document.getElementById('status');
  if (!f) return;

  if (C.GOOGLE_FORM_URL) {
    var fr = document.createElement('iframe');
    fr.src = C.GOOGLE_FORM_URL;
    fr.title = EN ? 'Enquiry form' : 'Форма звернення';
    fr.loading = 'lazy';
    fr.setAttribute('frameborder', '0');
    fr.style.cssText = 'width:100%;height:1100px;border:1px solid var(--border);background:#fff;border-radius:2px';
    f.parentNode.replaceChild(fr, f);
    return;
  }

  var L = EN ? {
    need: 'Please enter your name and phone number.', consent: 'Please confirm your consent to the processing of personal data.',
    sending: 'Sending…', ok: 'Thank you! Your enquiry has been received. We will contact you using the details you provided.',
    fail: 'The enquiry could not be sent. Please call +380 66 844 08 88 or write to kyivarbitr@gmail.com.'
  } : {
    need: 'Вкажіть ім\'я та телефон.', consent: 'Підтвердьте згоду на обробку персональних даних.',
    sending: 'Надсилаємо…', ok: 'Дякуємо! Звернення отримано. Ми зв\'яжемося з вами за вказаними контактами.',
    fail: 'Не вдалося надіслати звернення. Зателефонуйте за номером +380 66 844 08 88 або напишіть на kyivarbitr@gmail.com.'
  };
  var btn = f.querySelector('button[type="submit"]');
  function say(text, kind) { st.textContent = text; st.className = kind || ''; }

  /* Ключ Web3Forms: із налаштувань сайту (js/config.js), інакше — той, що вписаний у форму */
  var PH = 'YOUR-WEB3FORMS-ACCESS-KEY';
  var keyEl = f.querySelector('[data-w3f-key]');
  if (keyEl && C.WEB3FORMS_KEY && C.WEB3FORMS_KEY !== PH) keyEl.value = C.WEB3FORMS_KEY;

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!document.getElementById('n').value.trim() || !document.getElementById('p').value.trim()) { say(L.need, 'err'); return; }
    if (!document.getElementById('c').checked) { say(L.consent, 'err'); return; }
    if (!keyEl || !keyEl.value || keyEl.value === PH) { say(L.fail, 'err'); return; }
    if (!window.fetch || !window.FormData) { f.submit(); return; }
    btn.disabled = true; say(L.sending);
    /* Web3Forms: заявка пересилається на пошту власника сайту */
    var data = {};
    new FormData(f).forEach(function (v, k) { if (k !== 'redirect') data[k] = v; });
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.success) throw new Error(j.message || ('HTTP ' + r.status));
      });
    }).then(function () {
      f.reset();
      if (keyEl && C.WEB3FORMS_KEY && C.WEB3FORMS_KEY !== PH) keyEl.value = C.WEB3FORMS_KEY;
      say(L.ok, 'ok');
      if (window.gtag) window.gtag('event', 'generate_lead', { form: f.getAttribute('name') });
    }).catch(function () {
      say(L.fail, 'err');
    }).then(function () { btn.disabled = false; });
  });
})();
