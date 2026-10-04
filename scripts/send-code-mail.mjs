import 'dotenv/config';

/**
 * Письмо с кодом — вручную, себе на ящик.
 *
 * Зачем: посмотреть, как письмо с кодом выглядит в настоящей почте (фон, плашка
 * с цифрами, перенос строк) и перебрать все три вида — регистрацию, вход и
 * сброс пароля, — не проходя каждый раз весь вход. Скрипт зовёт **тот же**
 * `MailService.sendCode`, что и сервер, поэтому в ящике будет ровно то письмо,
 * которое придёт при входе.
 *
 * Запуск: «Проверить письмо с кодом.bat» либо `npm run mail:code`.
 * С адресом и видом письма сразу: `npm run mail:code -- you@example.com reset`.
 *
 * Сервер для этого не нужен: код не проверяется, в базу ничего не пишется.
 * Можно печатать любые коды — реальный вход в Yargram этим не затрагивается.
 */

const root = new URL('..', import.meta.url).href;

/** Три вида письма — ровно те, что бывают при входе. */
const KINDS = [
  { purpose: 'register', title: 'Регистрация — «Подтверждение регистрации в Yargram»' },
  { purpose: 'login', title: 'Вход — «Код для входа в Yargram»' },
  { purpose: 'reset', title: 'Сброс пароля — «Сброс пароля в Yargram»' },
];

/** Сколько минут указать в письме. У сервера срок берётся из EMAIL_CODE_TTL. */
const MINUTES = Number(process.env.EMAIL_CODE_TTL_SECONDS || 600) / 60;

/*
 * Очередь строк на одном читателе stdin — как в set-mail-password.mjs.
 * Нужна, чтобы ввод работал и в терминале, и при перенаправлении (пайп,
 * вставка несколькими строками сразу).
 */
const pendingLines = [];
const lineWaiters = [];
let inputBuffer = '';
let inputClosed = false;

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
  let index = inputBuffer.indexOf('\n');
  while (index >= 0) {
    const line = inputBuffer.slice(0, index).replace(/\r$/, '');
    inputBuffer = inputBuffer.slice(index + 1);
    const waiter = lineWaiters.shift();
    if (waiter) waiter(line);
    else pendingLines.push(line);
    index = inputBuffer.indexOf('\n');
  }
});
// Конец ввода: будим всех ожидающих пустой строкой, чтобы вопросы не висели.
process.stdin.on('end', () => {
  inputClosed = true;
  while (lineWaiters.length) lineWaiters.shift()('');
});

function nextLine() {
  const ready = pendingLines.shift();
  if (ready !== undefined) return Promise.resolve(ready);
  // Ввод закрылся (Ctrl+Z, конец файла, перенаправление) — не ждём вечно:
  // иначе «зависший» top-level await роняет скрипт с невнятной ошибкой.
  if (inputClosed) return Promise.resolve('');
  return new Promise((resolve) => lineWaiters.push(resolve));
}

async function ask(prompt) {
  process.stdout.write(prompt);
  return (await nextLine()).trim();
}

/**
 * Вопрос с выбором. Принимает и цифру, и слово, и Enter — тогда возвращается
 * вариант по умолчанию (`fallback`). «Нет» возвращает null.
 */
async function askChoice(prompt, options, { fallback = null } = {}) {
  for (;;) {
    const answer = (await ask(prompt)).toLowerCase();
    // Пустой ввод — согласие с вариантом по умолчанию.
    if (!answer) {
      if (fallback) return fallback;
      console.log('  Выберите вариант цифрой.');
      continue;
    }
    if (/^(n|no|нет|не|н)$/.test(answer)) return null;
    if (/^(y|yes|да|д|ok|ок|окей)$/.test(answer)) return fallback ?? options[0].value;
    for (const option of options) {
      if (option.keys.some((key) => key === answer)) return option.value;
    }
    console.log('  Не понял ответ. Введите номер варианта или слово из скобок.');
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Проверка адреса — до сетевых настроек: на опечатку лучше указать сразу. */
function normalizeEmail(value) {
  const email = value.trim().replace(/^<|>$/g, '');
  if (EMAIL_RE.test(email)) return { email, guessed: false };
  return { email, guessed: true };
}

/** Шесть цифр, как у сервера: первый символ может быть нулём. */
function randomCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

/** Пароль в консоль не печатаем: скрипт могут запускать при свидетелях. */
function mask(value) {
  if (!value) return '—';
  return value.length <= 4 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`;
}

/** Подсказки по типовым отказам SMTP — те же, что у проверки почты. */
function hintFor(message) {
  const text = message.toLowerCase();
  if (text.includes('not verified') || text.includes('sender domain not verified')) {
    return 'Адрес отправителя не подтверждён. В кабинете провайдера добавьте его в Sending → Verified Senders (Single sender emails) или подтвердите домен.';
  }
  if (text.includes('535') || text.includes('invalid login') || text.includes('username and password not accepted')) {
    return 'Логин или пароль не приняты. Проверьте MAIL_USER/MAIL_PASS. У Gmail и Яндекса обычный пароль от ящика не работает — нужен пароль приложения (см. ИНСТРУКЦИЯ_ПОЧТА.txt).';
  }
  if (text.includes('greeting never received') || text.includes('greeting')) {
    return 'Соединение установилось, но SMTP-сервер не ответил приветствием. Так выглядит блокировка исходящей почты: её режут провайдер, VPN, корпоративная сеть или файрвол. Проверьте с другой сети (например, с домашнего интернета) — настройки тут ни при чём.';
  }
  if (text.includes('etimedout') || text.includes('esocket') || text.includes('timeout')) {
    return 'Соединение не прошло. Порт 25 обычно закрыт провайдером — попробуйте 587 или 2525.';
  }
  if (text.includes('enotfound') || text.includes('eai_again')) {
    return 'Хост не найден. Проверьте MAIL_HOST (у Gmail — smtp.gmail.com).';
  }
  if (text.includes('self signed') || text.includes('certificate')) {
    return 'Проблема с TLS-сертификатом. Для порта 465 поставьте MAIL_SECURE=true, для 587/2525 — false.';
  }
  return '';
}

async function askKind() {
  console.log('Какое письмо отправить?');
  KINDS.forEach((kind, index) => console.log(`  ${index + 1}. ${kind.title}`));
  console.log('');
  const value = await askChoice(
    'Номер письма (Enter — вход): ',
    [
      { value: 'login', keys: ['1', 'login', 'вход', 'войти'] },
      { value: 'register', keys: ['2', 'register', 'регистрация', 'регистрации'] },
      { value: 'reset', keys: ['3', 'reset', 'сброс', 'пароль'] },
    ],
    { fallback: 'login' },
  );
  return value ?? 'login';
}

async function askCode() {
  const answer = await ask('Код в письме (Enter — случайный): ');
  if (!answer) return randomCode();
  const digits = answer.replace(/\D/g, '');
  if (digits.length !== 6) {
    console.log(`  Нужно шесть цифр, а введено «${answer}» — беру случайный код.`);
    return randomCode();
  }
  return digits;
}

async function main() {
  // Разбор аргументов: `npm run mail:code -- адрес вид код`. Любое из трёх
  // можно не указывать — тогда спросим. Адрес узнаём по «@», код — по шести
  // цифрам, вид — по слову из списка; всё остальное считаем видом и потом
  // переспросим, если не совпало.
  const args = process.argv.slice(2).filter((value) => !value.startsWith('-'));
  const emailArg = args.find((value) => value.includes('@')) ?? '';
  const codeArg = args.find((value) => !value.includes('@') && /^\d{6}$/.test(value)) ?? '';
  const used = new Set([emailArg, codeArg].filter(Boolean));
  // Первый оставшийся аргумент — вид письма. Если адрес не распознан («@» нет),
  // а непонятный аргумент всего один, человек, скорее всего, опечатался в
  // адресе: скажем прямо, а не спросим почту и вид заново.
  const rest = args.filter((value) => !used.has(value));
  const kindArg = emailArg ? (rest[0] ?? '') : '';
  const mistypedAddress = !emailArg && rest.length === 1 ? rest[0] : '';

  // Настройки почты и MailService берём из **собранного** сервера (`dist`), а
  // не из `src`: запуск не зависит от транспиляции на лету, но требует
  // `npm run build`. Заодно это гарантия, что письмо собирает тот самый код,
  // которым пользуется сервер.
  let MailService;
  let loadConfig;
  try {
    ({ MailService } = await import(new URL('apps/server/dist/services/mail-service.js', root).href));
    ({ loadConfig } = await import(new URL('apps/server/dist/config.js', root).href));
  } catch (error) {
    console.error(`Не нашёл собранный сервер: ${error.message}`);
    console.error('Сначала соберите проект: npm run build');
    process.exit(1);
  }

  let mail;
  try {
    mail = loadConfig().mail;
  } catch (error) {
    console.error(`Не удалось прочитать настройки: ${error.message}`);
    console.error('Проверьте блок MAIL_* в .env в корне проекта.');
    process.exit(1);
  }
  // Основной ящик: письмо уйдёт с него, если он рабочий. Запасные подхватит
  // сам сервис, но здесь достаточно знать первый — для подсказок и подписи.
  const primary = mail.accounts[0];

  console.log('Письмо с кодом — вручную, себе на ящик');
  console.log('Серверу это письмо не нужно: код никуда не сохраняется и не проверяется.');
  console.log('');

  if (mail.driver === 'none') {
    console.error('MAIL_DRIVER=none — почта выключена, отправлять некуда.');
    console.error('Включите отправку: «Вписать пароль почты.bat» выставит MAIL_DRIVER=smtp.');
    process.exit(1);
  }
  if (mail.driver === 'console') {
    console.warn('MAIL_DRIVER=console — письмо не уйдёт в сеть, а напечатается ниже.');
    console.warn('Для настоящей отправки: «Вписать пароль почты.bat» (MAIL_DRIVER=smtp).');
    console.warn('');
  }

  // Адрес. Из аргумента, иначе спросим (можно согласиться на адрес отправителя).
  if (mistypedAddress) {
    console.error(`«${mistypedAddress}» не похоже на адрес почты — в нём нет «@».`);
    console.error('Подсказка: npm run mail:code -- vashe@адрес.ru вход');
    process.exit(1);
  }
  let email = emailArg.trim();
  if (!email) {
    const suggested = primary?.user || primary?.from;
    const answer = await ask(
      suggested ? `Ваша почта (Enter — ${suggested}): ` : 'Ваша почта: ',
    );
    email = answer || suggested || '';
  }
  if (!email) {
    console.error('Адрес не указан — отправлять некуда.');
    process.exit(1);
  }
  const { email: clean, guessed } = normalizeEmail(email);
  email = clean;
  if (guessed) {
    console.error(`«${email}» не похоже на адрес почты — проверьте опечатку.`);
    process.exit(1);
  }

  // Вид письма.
  let purpose = kindArg.trim().toLowerCase();
  if (purpose) {
    const alias = { регистрация: 'register', регистрации: 'register', вход: 'login', войти: 'login', сброс: 'reset', пароль: 'reset' };
    purpose = alias[purpose] ?? purpose;
    if (!KINDS.some((kind) => kind.purpose === purpose)) {
      console.log(`  Неизвестный вид письма «${kindArg}» — спрошу.`);
      console.log('');
      purpose = await askKind();
    }
  } else {
    purpose = await askKind();
  }

  // Код. Из аргумента, иначе спросим; `--random` пропускает вопрос.
  const code = codeArg || (process.argv.includes('--random') ? randomCode() : await askCode());

  const kind = KINDS.find((item) => item.purpose === purpose);
  console.log('');
  console.log('Настройки почты из .env:');
  console.log(`  драйвер : ${mail.driver}`);
  console.log(`  хост    : ${mail.host ?? '—'}`);
  console.log(`  порт    : ${mail.port}${mail.secure ? ' (SSL)' : ' (STARTTLS)'}`);
  console.log(`  логин   : ${primary?.user ?? '—'}`);
  console.log(`  пароль  : ${mask(primary?.pass)}`);
  console.log(`  от кого : ${mail.fromName} <${primary?.from ?? '—'}>`);
  for (const spare of mail.accounts.slice(1)) {
    console.log(`  запасной: ${spare.user} (пароль ${mask(spare.pass)})`);
  }
  if (mail.accounts.length > 1) {
    // Скрипт проверяет первую отправку, поэтому письмо уйдёт с основного ящика.
    // Повторы в приложении уходят со следующего — здесь этого не увидеть.
    console.log(`  порядок : первая отправка с «${primary.user}», повтор в приложении — со следующего`);
  }
  console.log('');
  console.log(`Отправляю на ${email}: ${kind.title}`);
  console.log(`  код     : ${code}  (действует ${Math.round(MINUTES)} мин. — как в письме)`);
  console.log('');

  try {
    await new MailService(mail).sendCode({
      to: email,
      code,
      minutes: Math.max(1, Math.round(MINUTES)),
      purpose,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Не удалось отправить: ${message}`);
    const hint = hintFor(message);
    if (hint) console.error(`\n${hint}`);
    process.exit(1);
  }

  console.log('Готово. Проверьте ящик — и папку «Спам», если письма не видно.');
  console.log('Если видны картинки не сразу: у Gmail и Outlook есть кнопка');
  console.log('«Показать изображения» — но код в письме обычный текст, его видно и без неё.');
}

await main();
// Выходим явно: на stdin висит обработчик ввода, и без этого процесс в
// терминале остаётся живым после последнего вопроса.
process.exit(0);
