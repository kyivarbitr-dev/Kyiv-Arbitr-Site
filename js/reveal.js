/* Плавна поява контенту при скролі (fade-in & slide-up).
   Елементи з класом .scroll-reveal з'являються один раз, коли входять в екран.
   Затримку можна задати вручну: style="--delay: 0.2s". Якщо її немає, елементи,
   що входять в екран одночасно (наприклад, картки в сітці), з'являються по черзі з кроком 100 мс. */
(function () {
  'use strict';
  var root = document.documentElement;
  var STEP = 0.1, MAX_STEPS = 4;

  function showAll() {
    var list = document.querySelectorAll('.scroll-reveal');
    for (var i = 0; i < list.length; i++) list[i].classList.add('is-visible');
  }

  /* Без підтримки IntersectionObserver або з обмеженням руху: все видно одразу */
  if (!root.classList.contains('reveal') || !('IntersectionObserver' in window)) {
    root.classList.remove('reveal');
    showAll();
    return;
  }
  window.__revealReady = true;

  function done(el) {
    el.addEventListener('transitionend', function h(e) {
      if (e.target !== el) return;
      el.style.willChange = 'auto';
      el.removeEventListener('transitionend', h);
    });
  }

  var io = new IntersectionObserver(function (entries, observer) {
    var batch = 0;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      if (!el.style.getPropertyValue('--delay')) {
        el.style.setProperty('--delay', (Math.min(batch, MAX_STEPS) * STEP).toFixed(1) + 's');
        batch++;
      }
      el.classList.add('is-visible');
      done(el);
      observer.unobserve(el);
    });
  }, { root: null, rootMargin: '0px 0px -50px 0px', threshold: 0.15 });

  function watch(scope) {
    var list = (scope || document).querySelectorAll('.scroll-reveal:not(.is-visible)');
    for (var i = 0; i < list.length; i++) io.observe(list[i]);
  }
  watch();

  /* Динамічний вміст (новини, віджети) підхоплюється автоматично */
  if ('MutationObserver' in window) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.classList.contains('scroll-reveal') && !n.classList.contains('is-visible')) io.observe(n);
          watch(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* Перед друком показуємо все */
  window.addEventListener('beforeprint', showAll);
})();
