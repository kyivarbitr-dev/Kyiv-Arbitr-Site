/* Загальна логіка сайту: аналітика, карта, форма звернення. */
(function () {
  'use strict';
  var C = window.SITE_CONFIG || {};

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

  /* Форма звернення */
  var f = document.getElementById('f');
  var st = document.getElementById('status');
  if (!f) return;

  if (C.GOOGLE_FORM_URL) {
    var fr = document.createElement('iframe');
    fr.src = C.GOOGLE_FORM_URL;
    fr.title = 'Форма звернення';
    fr.loading = 'lazy';
    fr.setAttribute('frameborder', '0');
    fr.style.cssText = 'width:100%;height:1100px;border:1px solid var(--border);background:#fff;border-radius:2px';
    f.parentNode.replaceChild(fr, f);
    return;
  }

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = f.n.value.trim(), p = f.p.value.trim();
    if (!n || !p) { st.textContent = 'Вкажіть ім\'я та телефон.'; return; }
    if (!document.getElementById('c').checked) { st.textContent = 'Потрібна згода на обробку персональних даних.'; return; }
    var body = 'Ім\'я: ' + n + '\nТелефон: ' + p + '\nEmail: ' + f.e.value.trim() +
               '\nЗвертається як: ' + f.t.value + '\n\n' + f.m.value.trim();
    window.location.href = 'mailto:kyivarbitr@gmail.com?subject=' +
      encodeURIComponent('Звернення з сайту') + '&body=' + encodeURIComponent(body);
    st.textContent = 'Відкрито поштову програму з готовим листом. Якщо вона не відкрилась, напишіть на kyivarbitr@gmail.com.';
  });
})();
