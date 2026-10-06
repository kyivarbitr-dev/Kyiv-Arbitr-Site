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

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = f.n.value.trim(), p = f.p.value.trim();
    var L = EN ? {
      need: 'Please enter your name and phone number.', consent: 'Consent to the processing of personal data is required.',
      name: 'Name', phone: 'Phone', as: 'Contacting as', subj: 'Enquiry from the website (EN)',
      ok: 'Your email app has opened with a ready message. If it did not open, write to kyivarbitr@gmail.com.'
    } : {
      need: 'Вкажіть ім\'я та телефон.', consent: 'Потрібна згода на обробку персональних даних.',
      name: 'Ім\'я', phone: 'Телефон', as: 'Звертається як', subj: 'Звернення з сайту',
      ok: 'Відкрито поштову програму з готовим листом. Якщо вона не відкрилась, напишіть на kyivarbitr@gmail.com.'
    };
    if (!n || !p) { st.textContent = L.need; return; }
    if (!document.getElementById('c').checked) { st.textContent = L.consent; return; }
    var body = L.name + ': ' + n + '\n' + L.phone + ': ' + p + '\nEmail: ' + f.e.value.trim() +
               '\n' + L.as + ': ' + f.t.value + '\n\n' + f.m.value.trim();
    window.location.href = 'mailto:kyivarbitr@gmail.com?subject=' +
      encodeURIComponent(L.subj) + '&body=' + encodeURIComponent(body);
    st.textContent = L.ok;
  });
})();
