/**
 * Откуда человек вошёл. Yargram — это сайт, поэтому сеанс описывают парой
 * «сайт + браузер»: по ней в списке сеансов видно не «какое-то устройство»,
 * а конкретно `https://yargram.ru` и `Chrome, Windows`.
 */
/**
 * Порядок важен: Edge, Opera и Яндекс пишут в User-Agent и своё имя, и
 * `Chrome`, поэтому их проверяем первыми. Safari упоминается внутри Chrome —
 * значит Chrome идёт раньше.
 */
const BROWSERS = [
    [/Edg\//i, "Edge"],
    [/OPR\//i, "Opera"],
    [/YaBrowser\//i, "Yandex Browser"],
    [/Firefox\//i, "Firefox"],
    [/Chrome\//i, "Chrome"],
    [/Safari\//i, "Safari"],
];
const SYSTEMS = [
    [/Windows/i, "Windows"],
    [/Android/i, "Android"],
    [/(iPhone|iPad|iPod)/i, "iOS"],
    [/Mac OS X|Macintosh/i, "macOS"],
    [/Linux/i, "Linux"],
];
function firstMatch(source, patterns) {
    for (const [pattern, name] of patterns) {
        if (pattern.test(source))
            return name;
    }
    return "";
}
/**
 * «Chrome, Windows». Названия браузеров и систем пишем латиницей — так их и
 * показывают в интерфейсе на любом языке, перевод тут только мешал бы.
 */
export function describeUserAgent(userAgent) {
    const source = (userAgent ?? "").trim();
    if (!source)
        return "";
    return [firstMatch(source, BROWSERS), firstMatch(source, SYSTEMS)]
        .filter((part) => part !== "")
        .join(", ");
}
/**
 * Сайт, с которого пришёл запрос. Берём origin, затем referer (его хост),
 * затем сам хост: браузер не всегда шлёт `Origin`, а без него сеанс остался
 * бы вовсе без названия.
 */
export function siteFrom(origin, referer, host, protocol = "http") {
    const direct = (origin ?? "").trim();
    if (direct && direct !== "null" && /^https?:\/\//i.test(direct))
        return direct.replace(/\/+$/, "");
    const from = (referer ?? "").trim();
    const parsed = /^(https?:\/\/[^/]+)/i.exec(from);
    if (parsed)
        return parsed[1] ?? "";
    const name = (host ?? "").trim();
    return name ? `${protocol}://${name}` : "";
}
//# sourceMappingURL=session-context.js.map