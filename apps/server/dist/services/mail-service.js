import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
/** Имя картинки-значка внутри письма. */
const LOGO_CID = "yargram-logo";
/**
 * Имя файла со значком для письма.
 *
 * `logo-plate` — логотип целиком: иконка на мягкой плашке рядом со словом
 * «Yargram». Одно имя и в репозитории, и на рабочем столе: так файл проще
 * найти и заменить.
 */
const LOGO_FILE = "logo-plate.png";
/** Короткое описание ошибки для лога: у ошибок nodemailer бывает пустой текст. */
function describeError(error) {
    if (error instanceof Error)
        return error.message || error.name;
    return String(error);
}
/**
 * Значок Yargram для письма.
 *
 * 🔥 Порядок путей важен. Первым идёт **свой** каталог рядом с модулем
 * (`dist/assets` у собранного сервера) — так сборка самодостаточна: её можно
 * унести вместе с `dist` и картинка доедет. Вторым — репозиторный
 * `assets` на два уровня выше: он нужен в разработке, когда модуль лежит в
 * `src/services`.
 *
 * Оба пути ищем от файла, а не от рабочего каталога: сервер запускают из разных
 * мест (`Запустить Yargram.bat` — из корня проекта), и `process.cwd()` тут врёт.
 *
 * Файла может не быть — тогда письмо уйдёт без картинки, но с надписью
 * «Yargram» вёрсткой: важнее доставить код, чем картинку.
 */
function readLogo() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        resolve(here, "assets", LOGO_FILE), // dist/services → dist/assets (сборка)
        resolve(here, "..", "..", "assets", LOGO_FILE), // src/services → apps/server/assets
        resolve(here, "..", "..", "..", "assets", LOGO_FILE), // запасной вариант
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate))
            return readFileSync(candidate);
    }
    return null;
}
/** Заголовок письма — по назначению кода. */
const SUBJECTS = {
    register: "Подтверждение регистрации в Yargram",
    login: "Код для входа в Yargram",
    reset: "Сброс пароля в Yargram",
};
/** Что делать с кодом — одной фразой, чтобы письмо не выглядело подозрительно. */
const INTRO = {
    register: "Вы регистрируетесь в Yargram. Введите этот код, чтобы подтвердить почту:",
    login: "Вы входите в Yargram. Введите этот код, чтобы завершить вход:",
    reset: "Вы сбрасываете пароль в Yargram. Введите этот код, чтобы задать новый пароль:",
};
/** Строка-заголовок в таблице деталей под кодом. */
const DETAIL_LABEL = {
    register: "Зачем",
    login: "Зачем",
    reset: "Зачем",
};
const DETAIL_TEXT = {
    register: "Регистрация в Yargram",
    login: "Вход в Yargram",
    reset: "Сброс пароля в Yargram",
};
/**
 * Письмо с кодом.
 *
 * Код набран **текстом**, а не картинкой, и это осознанное решение: картинку
 * нельзя выделить и скопировать, а многие почты ещё и прячут изображения, пока
 * человек не нажмёт «показать». Поэтому «плашка» нарисована вёрсткой —
 * скруглённый прямоугольник с фоном, — а цифры остаются обычным текстом поверх
 * неё: и выглядит как картинка, и копируется.
 *
 * Из-за этого же вёрстка намеренно простая: без SVG и без фоновых изображений,
 * которые вырезает Outlook, и без внешних ссылок, из-за которых письмо попадает
 * в спам. Переносится везде, включая тёмную тему почтового клиента.
 *
 * Значок Yargram — единственная картинка в письме, и она **вложена внутрь**
 * (`cid:`), а не подгружается по ссылке: своего публичного адреса у проекта нет,
 * поэтому внешний файл почта просто не нашла бы. Рядом с картинкой стоит та же
 * надпись текстом: клиенты, которые прячут изображения до «показать», всё равно
 * покажут, от кого письмо.
 */
function buildCodeHtml(input) {
    const { code, minutes, purpose, withLogo } = input;
    // Шапка письма: картинка со значком, если её удалось приложить, и всегда —
    // текстовая надпись, чтобы письмо читалось и без изображений.
    const header = withLogo
        ? [
            '<p style="margin:0 0 20px">',
            `<img src="cid:${LOGO_CID}" width="200" height="40" alt="Yargram" `,
            'style="display:block;width:200px;height:auto;max-width:100%;border:0;outline:none">',
            "</p>",
        ].join("")
        : '<p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#3390ec">Yargram</p>';
    return [
        '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        "</head>",
        '<body style="margin:0;padding:24px 12px;background:#edf1f6">',
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">',
        "<tr><td align=\"center\">",
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:480px;background:#ffffff;border-radius:16px">',
        '<tr><td style="padding:32px 28px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#18232d">',
        header,
        `<p style="margin:0 0 20px;color:#70808d;font-size:13px">${SUBJECTS[purpose]}</p>`,
        `<p style="margin:0 0 20px">${INTRO[purpose]}</p>`,
        // Плашка с кодом. Разрядку между цифрами делает `letter-spacing`, а не
        // пробелы: пробелы попали бы в буфер обмена вместе с кодом. Сам код —
        // обычный текст, поэтому выделяется и копируется.
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 20px">',
        "<tr>",
        '<td align="center" valign="middle" height="86" ',
        'style="height:86px;padding:0 28px;background:#ebf3fc;border:1px solid #cfe4f9;border-radius:16px;',
        'font:700 40px/86px Arial,Helvetica,sans-serif;color:#3390ec;letter-spacing:8px;white-space:nowrap">',
        code,
        "</td>",
        "</tr>",
        "</table>",
        '<p style="margin:0 0 4px;color:#70808d;font-size:13px">Код действует ' + minutes + " мин.</p>",
        '<p style="margin:0 0 20px;color:#70808d;font-size:13px">Никому его не сообщайте — сотрудники Yargram код не спрашивают.</p>',
        '<p style="margin:0;padding-top:16px;border-top:1px solid #e2e7eb;color:#70808d;font-size:13px">',
        "Если вы не запрашивали код — просто проигнорируйте это письмо, ничего не произойдёт.",
        "</p>",
        "<p style=\"margin:16px 0 0\">",
        '<span style="display:inline-block;padding:8px 14px;background:#f2f5f8;border-radius:10px;font-size:13px;color:#4a5b68">',
        `${DETAIL_LABEL[purpose]}: ${DETAIL_TEXT[purpose]}`,
        "</span>",
        "</p>",
        "</td></tr>",
        "</table>",
        '<p style="margin:16px 0 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#93a1ad">',
        "Письмо отправлено автоматически, отвечать на него не нужно.",
        "</p>",
        "</td></tr></table>",
        "</body></html>",
    ].join("");
}
/**
 * Отправка писем с кодом подтверждения.
 *
 * Три драйвера: `smtp` — настоящая отправка через nodemailer, `console` —
 * печатает письмо в лог (разработка и тесты, когда SMTP не нужен), `none` —
 * молча считает письмо доставленным. Провайдер меняется переменными env, а не
 * кодом: SMTP2GO, Яндекс, Gmail, Brevo и всё прочее настраиваются одинаково —
 * хост, порт, логин, пароль. Драйвер `console` стоит по умолчанию, поэтому
 * сервер запускается и без настроенной почты, а код видно в логе.
 *
 * 🔥 Ящиков может быть несколько, и это не роскошь, а страховка. Google умеет
 * отозвать пароль приложения или запереть ящик — и тогда код перестанет
 * приходить, а без кода в Yargram не войти вообще (подтверждение требуется и
 * при входе). Поэтому настроенные ящики перебираются по порядку: не смог
 * первый — письмо уходит со второго.
 *
 * 🔥 Два разных случая, и путать их нельзя.
 *
 * 1. **Ящик отказал** (неверный пароль, блокировка, нет сети). Это видно сразу:
 *    SMTP возвращает ошибку. Ждать человека тут нельзя — письмо уходит со
 *    следующего ящика **в том же запросе**, код приходит как обычно.
 *
 * 2. **Ящик принял письмо, а оно не дошло** (улетело в спам, потерялось,
 *    ящик тихо ограничили). Ошибки нет, и узнать об этом сервер не может.
 *    Единственный сигнал — человек нажал «отправить снова». Вот тут и нужен
 *    поворот: повторная отправка уходит **с другого ящика**, иначе она
 *    повторила бы тот же путь в ту же папку «Спам».
 *
 * Поэтому: первый код всегда уходит с основного ящика, а каждая повторная
 * отправка — со следующего. Порядок задаётся `rotate`.
 */
export class MailService {
    options;
    /** Сколько держать отказавший ящик в стороне от старта. */
    static RETRY_AFTER_MS = 10 * 60_000;
    /** Ящики с готовыми транспортами: основной первым, запасные следом. */
    ready;
    /**
     * Ящик, который отправил последнее письмо. `-1` — ещё ничего не отправляли.
     * По нему считается, с кого начинать повторную отправку.
     */
    lastUsedIndex = -1;
    /**
     * Ящики, которые только что отказали: `индекс → до какого времени не трогать`.
     *
     * 🔥 Зачем. Без этого сломанный основной ящик стоил бы таймаута на **каждом**
     * письме: сначала стучимся в него, ждём десять секунд, потом идём к запасному.
     * Отказавший ящик пропускаем как стартовый на `RETRY_AFTER_MS`, но совсем не
     * вычёркиваем: через десять минут его снова попробуют — пароль могли вернуть.
     */
    failedUntil = new Map();
    constructor(options) {
        this.options = options;
        // Транспорт нужен, только если есть куда отправлять: без хоста драйвер
        // `smtp` вырождается в печать в лог, как `console`.
        const canSend = options.driver === "smtp" && Boolean(options.host);
        this.ready = canSend
            ? options.accounts.map((account) => ({
                account,
                transporter: nodemailer.createTransport({
                    host: options.host,
                    port: options.port,
                    // `secure` — это SSL сразу (порт 465). На 587 и 2525 он false:
                    // nodemailer сам поднимет STARTTLS, если сервер его предлагает.
                    secure: options.secure,
                    auth: { user: account.user, pass: account.pass },
                    // Почта не должна подвешивать вход: если релей не отвечает,
                    // лучше получить ошибку, чем ждать минуту.
                    connectionTimeout: 10_000,
                    greetingTimeout: 10_000,
                    socketTimeout: 15_000,
                }),
            }))
            : [];
    }
    /**
     * С какого ящика начинать перебор.
     *
     * Обычная отправка всегда начинается с **основного** (`0`) — он «лицо»
     * проекта, и подменять его без нужды не надо. Повторная (`rotate`) — со
     * следующего после того, который отправил прошлое письмо: ради этого она и
     * затевается.
     *
     * Из стартовых пропускаются те, что отказали меньше `RETRY_AFTER_MS` назад.
     * Если отказали все — возвращаем `from` как есть: перебор ниже всё равно
     * обойдёт все ящики, а падать в «нет ни одного» из-за одной лишь отметки нельзя.
     */
    chooseStart(rotate) {
        const total = this.ready.length;
        const now = Date.now();
        const from = rotate ? (this.lastUsedIndex + 1 + total) % total : 0;
        for (let step = 0; step < total; step += 1) {
            const index = (from + step) % total;
            if ((this.failedUntil.get(index) ?? 0) <= now)
                return index;
        }
        return from;
    }
    /**
     * Отправляет письмо. `rotate` — это повторная отправка: начать со следующего
     * ящика, а не с основного. Перебор внутри одного вызова остаётся в любом
     * случае, поэтому отказ ящика не превращается в «письмо не пришло».
     */
    async send(mail, options = {}) {
        if (this.options.driver === "none")
            return;
        if (this.ready.length === 0) {
            // Драйвер `console` (или smtp без хоста/ящиков): письмо уходит в лог.
            console.info(`[mail] → ${mail.to} — ${mail.subject}\n${mail.text}`);
            return;
        }
        const total = this.ready.length;
        const start = this.chooseStart(options.rotate === true);
        const order = Array.from({ length: total }, (_, step) => (start + step) % total);
        if (options.rotate === true && total > 1) {
            console.info(`[mail] повторная отправка — начинаем с ящика ${this.ready[start].account.user}`);
        }
        let lastError = null;
        for (const index of order) {
            const entry = this.ready[index];
            try {
                await entry.transporter.sendMail({
                    from: `${this.options.fromName} <${entry.account.from}>`,
                    to: mail.to,
                    subject: mail.subject,
                    text: mail.text,
                    ...(mail.html ? { html: mail.html } : {}),
                    ...(mail.attachments?.length
                        ? {
                            attachments: mail.attachments.map((attachment) => ({
                                cid: attachment.cid,
                                filename: attachment.filename,
                                content: attachment.content,
                                contentType: attachment.contentType,
                            })),
                        }
                        : {}),
                });
                this.failedUntil.delete(index);
                if (index !== this.lastUsedIndex && index !== 0) {
                    console.info(`[mail] письмо ушло с запасного ящика ${entry.account.user}`);
                }
                this.lastUsedIndex = index;
                return;
            }
            catch (error) {
                lastError = error;
                this.failedUntil.set(index, Date.now() + MailService.RETRY_AFTER_MS);
                console.warn(`[mail] ящик ${entry.account.user} не отправил письмо: ${describeError(error)}`);
            }
        }
        // Ни один ящик не сработал — молчать нельзя: человек ждёт код.
        throw new Error(`Письмо не ушло: не сработал ни один из ${total} настроенных ящиков`, {
            cause: lastError,
        });
    }
    /**
     * Письмо с кодом. Текстовая версия — для клиентов без HTML (и для
     * антиспам-фильтров: письмо с одной картинкой и без текста выглядит
     * подозрительно), HTML — то, что видит человек.
     */
    async sendCode(input) {
        const { to, code, minutes, purpose, rotate } = input;
        const text = [
            "Здравствуйте!",
            "",
            INTRO[purpose],
            "",
            `    ${code}`,
            "",
            `Код действует ${minutes} мин. Никому его не сообщайте — сотрудники Yargram код не спрашивают.`,
            "Если вы не запрашивали код — просто проигнорируйте это письмо.",
            "",
            "— Yargram",
        ].join("\n");
        const logo = readLogo();
        const html = buildCodeHtml({ code, minutes, purpose, withLogo: logo !== null });
        await this.send({
            to,
            subject: SUBJECTS[purpose],
            text,
            html,
            ...(logo
                ? {
                    attachments: [
                        {
                            cid: LOGO_CID,
                            filename: "yargram.png",
                            content: logo,
                            contentType: "image/png",
                        },
                    ],
                }
                : {}),
        }, rotate ? { rotate: true } : {});
    }
}
//# sourceMappingURL=mail-service.js.map