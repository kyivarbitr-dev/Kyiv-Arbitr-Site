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

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!document.getElementById('n').value.trim() || !document.getElementById('p').value.trim()) { say(L.need, 'err'); return; }
    if (!document.getElementById('c').checked) { say(L.consent, 'err'); return; }
    if (!window.fetch || !window.URLSearchParams || !window.FormData) { f.submit(); return; }
    btn.disabled = true; say(L.sending);
    /* Netlify Forms: надсилання на кореневу адресу з полем form-name */
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(f)).toString()
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      f.reset();
      say(L.ok, 'ok');
      if (window.gtag) window.gtag('event', 'generate_lead', { form: f.getAttribute('name') });
    }).catch(function () {
      say(L.fail, 'err');
    }).then(function () { btn.disabled = false; });
  });
})();
