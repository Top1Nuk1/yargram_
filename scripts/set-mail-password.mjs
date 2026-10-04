import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Вписывает пароль приложения в .env — вместо ручной правки файла.
 *
 * Зачем отдельный скрипт, а не .bat с `set /p`: пароль приложения Google — это
 * 16 символов, и cmd с его кодовой страницей легко портит ввод и вывод. Здесь
 * ввод идёт без эха (в консоли пароль не остаётся), а файл переписывается
 * с сохранением BOM и переводов строк, иначе dotenv перестанет его читать.
 *
 * Запуск: «Вписать пароль почты.bat» либо `node scripts/set-mail-password.mjs`.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');

const HINT = 'Пароль приложения Google — 16 букв, без пробелов. Обычный пароль от ящика не подойдёт.';

/*
 * Очередь строк на одном читателе stdin.
 *
 * Соблазнительно читать «по одному промису на строку», но так теряется ввод:
 * при перенаправлении (пайп, вставка) несколько строк приходят одним куском, и
 * читатель, забравший первую, выбрасывает остаток. Поэтому буферизуем и отдаём
 * строки по мере спроса — работает и в терминале, и в пайпе одинаково.
 */
const pendingLines = [];
const lineWaiters = [];
let inputBuffer = '';
// В raw-режиме (скрытый ввод) те же символы приходят и сюда. Буферизовать их
// нельзя: иначе пароль приклеится к следующему ответу и «n» превратится в
// «<пароль>n» — ответ на вопрос про тестовое письмо перестанет распознаваться.
let capturingHidden = false;

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (capturingHidden) return;
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

function nextLine() {
  const ready = pendingLines.shift();
  if (ready !== undefined) return Promise.resolve(ready);
  return new Promise((resolve) => lineWaiters.push(resolve));
}

/** Обычный вопрос — ответ виден, как в любой консоли. */
async function ask(prompt) {
  process.stdout.write(prompt);
  return (await nextLine()).trim();
}

/** Скрытый ввод: символы не печатаются и не остаются в истории консоли. */
async function askHidden(prompt) {
  process.stdout.write(prompt);
  // Не терминал (ввод перенаправлен) — эха и так нет, берём строку из очереди.
  if (!process.stdin.isTTY) return (await nextLine()).trim();

  const stdin = process.stdin;
  capturingHidden = true;
  stdin.setRawMode(true);
  stdin.resume();
  try {
    let value = '';
    for (;;) {
      const chunk = await new Promise((resolve) => stdin.once('data', resolve));
      let finished = false;
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') {
          finished = true;
          break;
        }
        // Ctrl+C в raw-режиме системой не обрабатывается — выходим сами.
        if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
      if (finished) break;
    }
    process.stdout.write('\n');
    return value.trim();
  } finally {
    capturingHidden = false;
    stdin.setRawMode(false);
  }
}

/**
 * Подставляет значение в строку .env. Меняем строку ЦЕЛИКОМ (`КЛЮЧ=.*`), иначе
 * старое значение остаётся хвостом: `MAIL_DRIVER=smtp` + `smtp` = `smtpsmtp`.
 * И только настоящий ключ: в файле есть закомментированный `# MAIL_PASS=…`
 * из запасного блока SMTP2GO, его трогать нельзя.
 */
function setKey(body, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(body)) {
    // Замена через функцию: иначе `$&` в пароле сработал бы как подстановка.
    return body.replace(pattern, () => `${key}=${value}`);
  }
  return `${body.replace(/\s*$/, '')}\n${key}=${value}\n`;
}

async function main() {
  let raw;
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    console.error(`Не нашёл ${envPath}`);
    console.error('Запускайте скрипт из корня проекта Yargram.');
    process.exit(1);
  }

  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  let body = bom ? raw.slice(1) : raw;
  const hadCrlf = body.includes('\r\n');
  if (hadCrlf) body = body.replace(/\r\n/g, '\n');

  console.log('Вписываем пароль приложения в .env');
  console.log(HINT);
  console.log('');

  // Ящиков может быть три: основной и два запасных. Если основной заблокируют,
  // письмо уйдёт со следующего — без этого код перестал бы приходить всем.
  console.log('Какой ящик настраиваем?');
  console.log('  1 — основной        (MAIL_USER / MAIL_PASS)');
  console.log('  2 — запасной        (MAIL_USER_2 / MAIL_PASS_2)');
  console.log('  3 — второй запасной (MAIL_USER_3 / MAIL_PASS_3)');
  const slotAnswer = (await ask('Номер (Enter — 1): ')).trim();
  const slot = slotAnswer === '2' ? 2 : slotAnswer === '3' ? 3 : 1;
  const suffix = slot === 1 ? '' : `_${slot}`;

  // У запасного ящика логина в .env ещё нет — спрашиваем адрес, иначе пароль
  // будет не к чему привязать.
  let address = '';
  if (slot !== 1) {
    address = (await ask('Адрес этого ящика (например, yargram.spare@gmail.com): ')).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      console.error('\nЭто не похоже на адрес почты — ничего не изменил.');
      process.exit(1);
    }
  }
  console.log('');

  const password = (await askHidden('Вставьте пароль (ввод скрыт) и нажмите Enter: ')).replace(/\s+/g, '');

  if (!password) {
    console.error('\nПусто — ничего не изменил.');
    process.exit(1);
  }
  if (!/^[A-Za-z]{16}$/.test(password)) {
    console.log('');
    console.log(`Внимание: это не похоже на пароль приложения Google — нужно ровно 16 букв, а введено ${password.length} символов.`);
    console.log('Проверьте, что скопирован именно пароль из https://myaccount.google.com/apppasswords,');
    console.log('а не обычный пароль от ящика: с обычным почта работать не будет.');
    const answer = await ask('Всё равно записать? (y/n): ');
    if (!/^(y|д|yes|да)$/i.test(answer)) {
      console.error('Отменено, файл не тронут.');
      process.exit(1);
    }
  }

  body = setKey(body, `MAIL_PASS${suffix}`, password);
  body = setKey(body, 'MAIL_DRIVER', 'smtp');
  if (slot !== 1) {
    body = setKey(body, `MAIL_USER${suffix}`, address);
    // Отправитель по умолчанию — сам ящик: Gmail подставляет адрес по логину.
    body = setKey(body, `MAIL_FROM${suffix}`, address);
  }
  await writeFile(envPath, bom + (hadCrlf ? body.replace(/\n/g, '\r\n') : body), 'utf8');

  // Перечитываем и сверяем, что записалось ровно то, что ввели (сам пароль не печатаем).
  const check = (await readFile(envPath, 'utf8')).replace(/\r\n/g, '\n');
  const savedPass = new RegExp(`^MAIL_PASS${suffix}=(.*)$`, 'm').exec(check);
  const savedDriver = /^MAIL_DRIVER=(.*)$/m.exec(check);
  const savedUser = slot === 1 ? null : new RegExp(`^MAIL_USER${suffix}=(.*)$`, 'm').exec(check);
  if (
    savedPass?.[1] !== password ||
    savedDriver?.[1] !== 'smtp' ||
    (slot !== 1 && savedUser?.[1] !== address)
  ) {
    console.error(
      `Проверка не прошла: в .env не то, что ожидалось. Откройте файл и посмотрите строки MAIL_PASS${suffix}/MAIL_DRIVER.`,
    );
    process.exit(1);
  }

  console.log('');
  console.log(
    slot === 1
      ? `Готово: MAIL_PASS записан (${password.length} символов), MAIL_DRIVER=smtp.`
      : `Готово: запасной ящик ${address} записан (пароль ${password.length} символов), MAIL_DRIVER=smtp.`,
  );
  console.log('EMAIL_CONFIRMATION не трогал — как было, так и осталось.');
  console.log('');

  const answer = await ask('Отправить тестовое письмо сейчас? (Enter — да, n — нет): ');
  if (/^(n|н|no|нет)$/i.test(answer)) {
    console.log('Хорошо. Проверить позже: npm run mail:test -- ваш@адрес');
    process.exit(0);
  }

  console.log('');
  const child = spawn(process.execPath, [join(root, 'scripts', 'test-mail.mjs')], {
    stdio: 'inherit',
    cwd: root,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

await main();
