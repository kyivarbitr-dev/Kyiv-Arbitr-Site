/* Налаштування сайту. Редагуйте лише значення нижче. */
window.SITE_CONFIG = {
  /* Дані мапи й перевірки лотів: читаються напряму з репозиторію GitHub, тож щоденне оновлення
     видно одразу після роботи бота. Запасний варіант — копія /data/ на сайті. */
  DATA_BASE: 'https://raw.githubusercontent.com/kyivarbitr-dev/kyiv-arbitr-site/main/data/',

  /* Ключ доступу Web3Forms (web3forms.com → Create Access Key, приходить на пошту).
     Ключ публічний за задумом сервісу: він лише вказує, на яку пошту пересилати заявки. */
  WEB3FORMS_KEY: '97914465-ffad-405a-aa61-0914742c6408',

  /* Адреса вбудованої Google Form (src з коду «Вставити»). Порожньо = запасна форма через пошту. */
  GOOGLE_FORM_URL: '',

  /* Ідентифікатор Google Analytics 4 (формат G-XXXXXXXXXX). Порожньо = аналітика вимкнена. */
  GA4_ID: '',

  /* Необов'язково: власний код карти (Google Maps → Поділитися → Вбудувати карту → src). */
  MAP_EMBED_URL: '',

  /* Курси НБУ: коди валют для показу. */
  NBU_CURRENCIES: ['USD', 'EUR', 'GBP', 'PLN'],

  /* Криптовалюти: id для CoinGecko і символ для запасного джерела Binance. */
  CRYPTO: [
    { id: 'bitcoin',  sym: 'BTC', name: 'Bitcoin',  binance: 'BTCUSDT' },
    { id: 'ethereum', sym: 'ETH', name: 'Ethereum', binance: 'ETHUSDT' },
    { id: 'ripple',   sym: 'XRP', name: 'XRP',      binance: 'XRPUSDT' }
  ]
};

/* Завантаження файлу даних: спершу GitHub (найсвіжіше), потім копія на сайті. */
window.loadSiteData = function (name) {
  var C = window.SITE_CONFIG || {}, v = 'v=' + new Date().toISOString().slice(0, 13);
  function get(url) {
    return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + v, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  var local = '/data/' + name;
  if (!C.DATA_BASE) return get(local);
  return get(C.DATA_BASE + name).catch(function () { return get(local); });
};
