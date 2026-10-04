import 'dotenv/config';
import { loadConfig } from '../apps/server/dist/config.js';
import { MailService } from '../apps/server/dist/services/mail-service.js';

/**
 * Проверка почты: отправляет тестовое письмо ровно теми же настройками, что и
 * сервер (тот же loadConfig и тот же MailService), поэтому если письмо дошло —
 * дойдёт и код подтверждения.
 *
 * Так можно проверить логин/пароль SMTP, не включая EMAIL_CONFIRMATION и не
 * рискуя запереть себя: пока код не требуется для входа, ошибку в почте никто
 * не заметит.
 *
 * Запуск (из корня проекта, после `npm run build`):
 *   node scripts/test-mail.mjs                 # шлём самому себе (адрес из .env)
 *   node scripts/test-mail.mjs you@example.com # или на конкретный адрес
 */
const argument = (process.argv[2] ?? '').trim();

/** Пароль в консоль не печатаем: скрипт могут запускать при свидетелях. */
function mask(value) {
  if (!value) return '—';
  return value.length <= 4 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`;
}

/** Подсказки по типовым отказам: без них ошибка SMTP ничего не объясняет. */
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
    return 'Хост не найден. Проверьте MAIL_HOST (у SMTP2GO — mail.smtp2go.com).';
  }
  if (text.includes('self signed') || text.includes('certificate')) {
    return 'Проблема с TLS-сертификатом. Для порта 465 поставьте MAIL_SECURE=true, для 587/2525 — false.';
  }
  return '';
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`Не удалось прочитать настройки: ${error.message}`);
    console.error('Проверьте блок MAIL_* в .env в корне проекта.');
    process.exit(1);
  }

  const mail = config.mail;
  const primary = mail.accounts[0];

  // Без аргумента шлём на адрес отправителя: так проверку можно запустить одной
  // командой, не вспоминая свой адрес.
  const to = argument || primary?.user || primary?.from;
  if (!to?.includes('@')) {
    console.error('Укажите адрес получателя: node scripts/test-mail.mjs you@example.com');
    process.exit(1);
  }

  console.log('Настройки почты из .env:');
  console.log(`  драйвер : ${mail.driver}`);
  console.log(`  хост    : ${mail.host ?? '—'}`);
  console.log(`  порт    : ${mail.port}${mail.secure ? ' (SSL)' : ' (STARTTLS)'}`);
  console.log(`  логин   : ${primary?.user ?? '—'}`);
  console.log(`  пароль  : ${mask(primary?.pass)}`);
  console.log(`  от кого : ${mail.fromName} <${primary?.from ?? '—'}>`);
  // Запасные ящики показываем отдельной строкой: иначе непонятно, почему
  // письмо вдруг ушло с другого адреса.
  for (const spare of mail.accounts.slice(1)) {
    console.log(`  запасной: ${spare.user} (пароль ${mask(spare.pass)})`);
  }
  if (mail.accounts.length > 1) {
    console.log(`  порядок : первый код с «${primary.user}», повторная отправка — со следующего`);
  }
  console.log('');

  if (mail.driver === 'none') {
    console.error('MAIL_DRIVER=none — почта выключена, отправлять некуда.');
    process.exit(1);
  }
  if (mail.driver === 'console') {
    console.warn('MAIL_DRIVER=console — письмо не уйдёт в сеть, а напечатается ниже.');
    console.warn('Для настоящей отправки: MAIL_DRIVER=smtp и заполненные MAIL_HOST/MAIL_USER/MAIL_PASS.');
    console.warn('');
  }

  if (!argument) console.log(`Адрес не указан — шлю на ${to} (взял из .env).`);
  console.log(`Отправляю тестовое письмо на ${to}…`);
  try {
    await new MailService(mail).send({
      to,
      subject: 'Yargram: проверка почты',
      text: [
        'Проверка почты Yargram.',
        '',
        'Если вы читаете это письмо — настройки MAIL_* верны, и код подтверждения будет доходить.',
        '',
        '— Yargram',
      ].join('\n'),
      html: [
        '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">',
        '<p>Проверка почты Yargram.</p>',
        '<p>Если вы читаете это письмо — настройки <b>MAIL_*</b> верны, и код подтверждения будет доходить.</p>',
        '<p style="color:#999">— Yargram</p>',
        '</div>',
      ].join(''),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Не удалось отправить: ${message}`);
    const hint = hintFor(message);
    if (hint) console.error(`\n${hint}`);
    process.exit(1);
  }

  console.log('Готово. Проверьте ящик — и папку «Спам», если письма не видно.');
}

await main();
