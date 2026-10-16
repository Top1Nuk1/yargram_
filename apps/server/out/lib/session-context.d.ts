/**
 * Откуда человек вошёл. Yargram — это сайт, поэтому сеанс описывают парой
 * «сайт + браузер»: по ней в списке сеансов видно не «какое-то устройство»,
 * а конкретно `https://yargram.ru` и `Chrome, Windows`.
 */
export type SessionContext = {
    /** Origin сайта, с которого открыт Yargram, например `https://yargram.ru`. */
    site: string;
    /** Браузер и система, например «Chrome, Windows». Пусто, если не распознали. */
    device: string;
    /** Постоянный идентификатор физического устройства / браузера. */
    deviceId?: string;
    /** Пользовательское имя устройства (например, «Домашний ПК»). */
    customDeviceName?: string | null;
};
/**
 * «Chrome, Windows». Названия браузеров и систем пишем латиницей — так их и
 * показывают в интерфейсе на любом языке, перевод тут только мешал бы.
 */
export declare function describeUserAgent(userAgent?: string): string;
/**
 * Сайт, с которого пришёл запрос. Берём origin, затем referer (его хост),
 * затем сам хост: браузер не всегда шлёт `Origin`, а без него сеанс остался
 * бы вовсе без названия.
 */
export declare function siteFrom(origin?: string, referer?: string, host?: string, protocol?: string): string;
