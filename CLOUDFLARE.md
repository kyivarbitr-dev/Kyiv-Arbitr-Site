# Переїзд сайту на Cloudflare Pages

Сайт лишається в репозиторії GitHub `kyivarbitr-dev/kyiv-arbitr-site`. Cloudflare сам публікує його після кожного завантаження файлів, як це робив Netlify. Безкоштовно: до 500 публікацій на місяць, трафік не лімітований.

Порядок важливий: спершу запускаємо сайт на тимчасовій адресі Cloudflare й перевіряємо, і лише потім перемикаємо домен. Так сайт не буде недоступний.

## Крок 1. Ключ для форм (Web3Forms)

Ключ уже вписано в `js/config.js`, `contacts.html`, `en/contacts.html` і `lot-dep.html`. Заявки приходитимуть на пошту, з якою ключ створено (kyivarbitr@gmail.com). Ключ не є секретним: він лише вказує, на яку пошту пересилати заявки.

## Крок 2. Завантажте оновлені файли на GitHub

Як зазвичай: Add file → Upload files, перетягніть вміст архіву разом із папками. Netlify ці зміни вже не опублікує, і це нормально.

## Крок 3. Створіть проєкт у Cloudflare Pages, 10 хвилин

1. Зареєструйтеся на https://dash.cloudflare.com (безкоштовно), бажано одразу ввімкнути двофакторний вхід.
2. **Workers & Pages → Create → Pages → Connect to Git** → дозвольте доступ до GitHub → оберіть `kyiv-arbitr-site`.
3. Налаштування збірки:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command:
     ```
     rm -rf scripts .github netlify.toml info.html data/prozorro-state.json data/geocache.json *.md
     ```
     (прибирає зі збірки службові файли, щоб їх не можна було відкрити з сайту)
   - Build output directory: `/`
4. **Save and Deploy.** Через 1–2 хвилини сайт з'явиться на адресі вигляду `kyiv-arbitr-site.pages.dev`.

## Крок 4. Перевірте сайт на тимчасовій адресі

- Головна, «Аналітика», мапа, «Перевірка лота» відкриваються.
- На мапі стоїть сьогоднішня дата оновлення.
- Надішліть тестове звернення з «Контактів»: лист має прийти на kyivarbitr@gmail.com (перший лист від Web3Forms може потрапити в «Спам», позначте його як «Не спам»).

## Крок 5. Перенесіть домен, 15 хвилин + очікування

1. Cloudflare → **Add a domain** → `kyivarbitr.com.ua` → тариф **Free**.
2. Cloudflare сам підтягне наявні DNS-записи. Перегляньте список: якщо там є TXT-запис Google (google-site-verification), він має лишитися.
3. Cloudflare покаже два сервери імен (вигляду `xxx.ns.cloudflare.com`).
4. В Ukr.host: керування доменом → **Сервери імен (NS)** → замініть наявні на два сервери Cloudflare → збережіть.
5. Зачекайте, поки Cloudflare покаже статус **Active** (зазвичай до кількох годин, інколи до доби).
6. Workers & Pages → ваш проєкт → **Custom domains → Set up a custom domain** → `kyivarbitr.com.ua`. Потім так само додайте `www.kyivarbitr.com.ua`.
7. Щоб `www` вела на основну адресу: Rules → **Redirect Rules** → шаблон «Redirect from WWW to root» → увімкнути.

## Крок 6. Після переїзду

- У Google Search Console нічого змінювати не потрібно: адреса сайту та сама.
- Netlify: коли сайт працює через Cloudflare, видаліть проєкт у Netlify (Project configuration → Delete project), щоб він не витрачав кредити й не плутав.
- Оновлення сайту відтепер: так само завантажуєте файли на GitHub, Cloudflare публікує сам.

## Що змінилося в коді

| Файл | Що це |
|---|---|
| `_headers` | Захисні заголовки й кеш (замість `netlify.toml`) |
| `_redirects` | Перенаправлення старої сторінки «Інформер» |
| `js/app.js` | Форма надсилає заявки через Web3Forms |
| `js/config.js` | Місце для ключа Web3Forms |
| `contacts.html`, `en/contacts.html`, `lot-dep.html` | Форми переведено на Web3Forms |
| `privacy.html`, `en/privacy.html` | Політика: Cloudflare і Web3Forms замість Netlify |
