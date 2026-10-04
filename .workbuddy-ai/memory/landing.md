# Yargram — два сайта: лендинг и приложение

Сборка одна, сайтов два: **`/`** — лендинг (`apps/landing`), **`/app`** — само приложение
(`apps/web`). Порт dev у лендинга — **5174**, превью — 4174.

## 🔥 Разводка на сервере (`apps/server/src/app.ts`)

```ts
app.use("/api", notFoundHandler);

const landingIndex = resolve(dependencies.config.landingDistPath, "index.html");
const webIndex = resolve(dependencies.config.webDistPath, "index.html");
const hasLanding = existsSync(landingIndex);
const hasWeb = existsSync(webIndex);

if (dependencies.config.nodeEnv === "production") {
  if (hasLanding) {
    app.use(express.static(dependencies.config.landingDistPath, { index: false }));
    app.get("/", (_request, response) => { response.sendFile(landingIndex); });
  }
  if (hasWeb) {
    // 🔥 `/app` без слеша регистрируем **до** `express.static`… иначе 301 на `/app/`.
    app.get("/app", (_request, response) => { response.sendFile(webIndex); });
    app.use("/app", express.static(dependencies.config.webDistPath, { index: false }));
    app.get("*", (request, response, next) => {
      if (!request.accepts("html")) { next(); return; }
      const isAppRoute = request.path.startsWith("/app/");
      if (isAppRoute || !hasLanding) { response.sendFile(webIndex); return; }
      response.sendFile(landingIndex);
    });
  }
}
```

- Пути в `config.ts`: `webDistPath` = `apps/web/dist`, `landingDistPath` = `apps/landing/dist`.
- 🔥 **Порядок маршрутов в Express — порядок разбора**: `app.get("/app", → index.html)` стоит **до**
  `app.use("/app", express.static(…))`, иначе статика отвечает редиректом **301** на `/app/`
  (тесты в `apps/server/tests/app.test.ts`, блок `два сайта: лендинг и приложение`, 6 штук:
  корень — лендинг; `/app` — приложение; `/app/settings` и `/app/chat/123` — приложение; ассеты;
  **без лендинга корень по-прежнему отдаёт приложение**; API-404 не съедается статикой; не-HTML запрос
  к отсутствующему файлу — 404).
- 🔥 **Два SPA не могут жить в корне**: каждому нужен свой catch-all под клиентские маршруты, поэтому
  приложение переехало на `/app` (`base: env.VITE_BASE || '/app/'` в `apps/web/vite.config.ts` — иначе
  бандлы тянутся из корня и белый экран). Без лендинга корень отдаёт приложение — старое поведение.
- `VITE_BASE=/` — тогда лендингу нужен `VITE_APP_URL`, иначе кнопка ведёт на себя же.

## Лендинг (`apps/landing`, `@yargram/landing`)

Статический Vite + React + Tailwind SPA, **без прокси к API** — лендинг не должен знать про сервер.
Можно целиком вынести на Cloudflare Pages / любой хостинг статики.

- 🔥 **i18n лендинга** (`src/lib/i18n.ts` + `src/lib/translations.ts` + `src/lib/useLandingLanguage.tsx`)
  — все тексты страницы переведены на **6 языков**, совпадающих с приложением
  (`ru, en, bg, uk, be, el`). `i18n.ts` держит типы и константы (`LANGUAGES`, `LANGUAGE_LABELS`,
  `LANGUAGE_SHORT` = RU/EN/BG/UK/BE/EL, `LANGUAGE_LOCALES`, `LANGUAGE_STORAGE_KEY =
  'yargram.landing.lang'`, `resolveContent`, `isLanguage`); `translations.ts` — `dictionaries:
  Record<Language, LandingContent>`, форма строго по интерфейсу `LandingContent` (tsc не пропустит
  пропущенное поле — все 6 словарей проверяй на равенство формы). Цепочка фолбэков `bg/uk/be→ru`,
  `el→en` в `resolveContent` нужна на случай, если язык целиком не переведён.
- 🔥 **Язык по умолчанию — `ru`**, намеренно НЕ браузерный: тесты ждут русский текст, а владелец
  открывает сайт на английской ОС. `useLandingLanguage()` — контекст (`LanguageProvider` + `content` +
  `setLanguage`); `document.documentElement.lang` выставляется эффектом. Ключ хранилища **свой**, не как
  у приложения (`yargram.lang`), чтобы лендинг и мессенджер могли разъехаться по языку.
- 🔥 **`LanguageSwitcher`** (`src/components/LanguageSwitcher.tsx`) — компактная кнопка (глобус +
  `LANGUAGE_SHORT`) между кнопкой темы и «Открыть Yargram» в шапке. Меню `role="menu"` из 6
  `menuitemradio`; закрывается по клику вне (`pointerdown` на `document`) и Escape. Не путать с темой
  (у той свой хук `useLandingTheme`, без провайдера).
- `src/lib/appUrl.ts` — 🔥 читает env **в функции** (`readAppUrl()`), не в константе: константа
- `src/lib/appUrl.ts` — 🔥 читает env **в функции** (`readAppUrl()`), не в константе: константа
  (`const RAW = import.meta.env.VITE_APP_URL`) замерзает на импорте и `vi.stubEnv` в тестах не
  действует. Без переменной ведёт на относительный `/app`.
- **Вкладка «Обновления»** (`#updates`, «Что нового»): тексты — теперь внутри словаря
  `src/lib/translations.ts` (`content.releases`: `groups` — шесть направлений, `next`; `openLabel`
  строит «Открытие {channelLong}»), разметка — `src/components/Releases.tsx`. Выпуск один — `0.1.0 ЗБТ`
  («открытие закрытого бета-тестирования»); ЗБТ расшифровывается прямо в тексте. 🔥 **Про админские
  возможности владельца — ни слова** (просьба
  владельца); в `App.test.tsx` на это стоит страж по всему тексту страницы, не только вкладке.
  Новые версии добавляются карточками сверху, форма та же.
- `src/lib/useLandingTheme.ts` — своя тема (`localStorage['yargram.landing.theme']`), падает на
  `matchMedia('(prefers-color-scheme: dark)')`, ставит `data-theme` на `<html>`.
- `src/components/Icon.tsx` — рисованные инлайн-иконки 24×24, без библиотек; тип —
  `Record<IconName, ReactElement>` (🔥 React 19 убрал глобальный namespace `JSX`: `JSX.Element` даёт
  `TS2503 Cannot find namespace 'JSX'`).

### 🔥 Логотип (`src/components/Logo.tsx`)

Настоящий знак Yargram — **залитая V на круге**, а не Y. Рисуется по геометрии `logo-plate.svg`:
плашка `rect 80×80 rx=21` (`fill #EBF3FC`, рамка `#CFE4F9`), внутри `g translate(11 15) scale(1.2)`
круг `r=22` (`#3390EC`), белая V и светлая внутренняя V (`#D9EFFA`). Пропсы: `size`, `withWordmark`,
**`onBrand`** (цвета берутся из самого знака, а не из темы — нужно на синем блоке призыва, см. ниже),
`className`.

🔥 **Плитка — часть знака, её не убирать.** Попытка «убрать белую обводку» на синем блоке привела к
тому, что сняли и плитку, и знак стал белым кругом с синей буквой — владелец поправил («поставь
иконку `Yargram-plate.png`»). Белая обводка была от **внешней обёртки**
`<span className="bg-white/95 p-2 shadow-card">` поверх плитки: две светлые фигуры подряд. Убрать
надо было обёртку, а не плитку.

🔥 **`onBrand`** нужен потому, что блок призыва `bg-brand` **синий в любой теме**: с цветами из темы
на тёмной теме `--accent-soft` тёмный, и светлая плитка превращалась в тёмный квадрат — знак
переставал совпадать с иконкой. В этом режиме плитка `fill-[#EBF3FC]` / `stroke-[#CFE4F9]`,
круг `fill-[#3390EC]`.

Прежний `Icon name="logo"` (там V была **вырезана** из круга — другой знак) удалён; `Header.tsx`,
`Cta.tsx` (значок в CTA и подвал) переведены на `<Logo … />`. Фавикон — `/brand/yargram.svg`
(простой круглый знак, для вкладки уместен).

### 🔥 Увеличение карточек при наведении (`.card-lift`)

Класс в `index.css`: `transform: scale(1.02)` + тень, `transition` 220 мс, `:focus-within` для
клавиатуры, выключено в `prefers-reduced-motion`. Навешен на карточки «Возможности», разделы
`Features`, пункты `Limits`, карточку выпуска `Releases`, блок призыва и мокап переписки.
🔥 `scale`, а не размеры: соседние карточки не «прыгают» от пересчёта раскладки.
⚠️ Не ставить `.card-lift` на **тот же** узел, что `animate-float`/`animate-fade-up` — обе задают
`transform`, и одно гасит другое (у мокапа переписки это разнесено на два элемента).

### 🔥 Тема: цвета только через CSS-переменные

В `tailwind.config.ts` цвета идут **через `rgb(var(--…))`**, не жёсткими значениями:

```ts
colors: {
  page: 'rgb(var(--page) / <alpha-value>)', card: 'rgb(var(--card) / <alpha-value>)',
  ink: 'rgb(var(--title) / <alpha-value>)', body: 'rgb(var(--body) / <alpha-value>)',
  stroke: 'rgb(var(--stroke) / <alpha-value>)',
  brand: { DEFAULT: 'rgb(var(--accent) / <alpha-value>)', strong: …, soft: …, deep: … },
  success: 'rgb(var(--ok) / <alpha-value>)',
}
```

Иначе `ink: '#16232e'` остаётся тёмно-синим и на тёмной теме, и заголовки с текстом пропадают на
тёмном фоне. Сами палитры — в `src/index.css`, две, ключ — `data-theme` на `<html>`:

```css
:root { color-scheme: light; --page: 246 248 252; --card: 255 255 255; --title: 22 35 46;
        --body: 99 121 140; --stroke: 227 233 240; --accent: 51 144 236;
        --accent-strong: 35 121 207; --accent-deep: 27 95 158; --accent-soft: 232 242 253;
        --ok: 58 165 108; }
:root[data-theme='dark'] { color-scheme: dark; --page: 14 20 32; --card: 22 31 44;
        --title: 233 241 248; --body: 147 167 184; --stroke: 38 50 63; --accent: 82 165 241;
        --accent-strong: 105 180 246; --accent-deep: 137 195 246; --accent-soft: 30 48 70;
        --ok: 86 190 139; }
```

Первый экран рисуется градиентами (`.hero-glow`, `.hero-grid`) — без картинок; есть блок
`prefers-reduced-motion`.

## 🔥 Снимки и проверка

- ⚠️ **`--force-dark-mode` у Chrome показывает НЕ то**: он включает собственную инверсию, и «тёмная
  тема» на снимке выглядит не так, как её увидит человек. Тёмную тему снимать **настоящим кликом**:
  Chrome поднимается с `--remote-debugging-port`, кнопка находится по `aria-label` и нажимается через
  `Runtime.evaluate`, затем `Page.captureScreenshot`.
- 🔥 **Chrome в headless не прокручивает к `#hash`** при первой отрисовке, а
  `scrollIntoView({behavior:'smooth'})` возвращает `scrollY: 0` — на странице стоит
  `scroll-behavior: smooth`, и прыжок анимируется уже после ответа. Прокручивать
  `behavior: 'instant'`.
- ⚠️ Фоновый сервер и Chrome **умирают между вызовами** (`node runtime/serve-landing.mjs &` гибнет
  вместе с породившей его оболочкой → `net::ERR_CONNECTION_REFUSED`). Поднимать сервер и снимать
  снимок **в одном вызове**; `--screenshot` давать **абсолютным** путём (`--screenshot="C:\…"`), иначе
  «Системе не удается найти указанный путь».
- Тесты лендинга (`src/App.test.tsx`, `src/lib/appUrl.test.ts`, `src/lib/i18n.test.ts`,
  `src/components/LanguageSwitcher.test.tsx`) — 🔥 `beforeEach` чистит `document.body.innerHTML`,
  `localStorage` и `data-theme`: тело документа **общее на весь файл**, и второй `render(<App />)`
  даёт «Found multiple elements with the role "button"». `i18n.test.ts` проверяет равенство **формы**
  всех 6 словарей (отпечаток без значений) — ловит пропущенное поле в переводе. `App.test.tsx`
  содержит тест переключения языка на английский (проверяет `document.documentElement.lang`,
  `localStorage['yargram.landing.lang']` и что заголовок перерисовался).
