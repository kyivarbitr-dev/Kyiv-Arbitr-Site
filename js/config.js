/* Налаштування сайту. Редагуйте лише значення нижче. */
window.SITE_CONFIG = {
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
  ],

  /* Prozorro.Sale (відкриті дані, нова ЦБД). */
  PROZORRO_API: 'https://procedure.prozorro.sale/api',
  PROZORRO_LOOKBACK_HOURS: 48,
  PROZORRO_METHOD_REGEX: 'bankruptcy',
  PROZORRO_MAX_ITEMS: 6
};
