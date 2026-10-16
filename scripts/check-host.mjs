#!/usr/bin/env node
/**
 * Проверка боевого адреса Yargram: домен, HTTPS и раздача приложения.
 *
 * 🔥 Зачем отдельный скрипт. Диагностика «сайт отдаёт 502» руками каждый раз
 * занимает минут десять и требует помнить четыре команды с подменой `Host`.
 * Здесь они собраны вместе и, главное, сравниваются между собой: именно
 * сравнение ответов origin по HTTP и HTTPS сразу показывает причину.
 *
 * Разбор причин и лечение — `docs/ИНСТРУКЦИЯ_RAVEN.md`, раздел
 * «HTTPS 502 при включённом Cloudflare».
 *
 * Запуск:  node scripts/check-host.mjs
 * Опции:   --origin 147.124.213.50   адрес сервера (по умолчанию берётся из DNS)
 *          --host   yargram.site      проверяемый домен
 *          --port   19378             порт приложения на сервере
 */

import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const DOMAIN = arg("host", "yargram.site");
const APP_PORT = Number(arg("port", "19378"));

/**
 * Запрос с подменой `Host` и заголовков прокси.
 *
 * 🔥 Именно `node:http`/`node:https`, а не `fetch`: заголовок `Host` — запрещённый
 * для `fetch`, подставить его нельзя, а без подмены мы бы проверяли не тот
 * vhost. Проверка сертификата отключена намеренно (`rejectUnauthorized: false`):
 * нас интересует, что отвечает nginx, а не то, совпадает ли имя в сертификате.
 */
function probe({ url, host, proto, timeoutMs = 12000 }) {
  return new Promise((resolve) => {
    const target = new URL(url);
    const send = proto === "https" ? httpsRequest : httpRequest;
    const started = Date.now();

    const req = send(
      {
        hostname: target.hostname,
        port: target.port || (proto === "https" ? 443 : 80),
        path: target.pathname + target.search,
        method: "GET",
        headers: {
          Host: host,
          "User-Agent": "yargram-check-host",
          Accept: "text/html,application/json,*/*",
          // Как это делает прокси Cloudflare: сообщаем, что снаружи был HTTPS.
          "X-Forwarded-Proto": proto === "https" ? "https" : "http",
        },
        ...(proto === "https" ? { rejectUnauthorized: false } : {}),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location ?? "",
            server: res.headers.server ?? "",
            contentType: res.headers["content-type"] ?? "",
            // 🔥 600, а не 200: название «Yargram» в лендинге стоит после
            // метатегов, и на коротком срезе признак не находился — из-за этого
            // не срабатывал разбор причины. Размер взят с запасом.
            body: Buffer.concat(chunks).toString("utf8").slice(0, 600),
            ms: Date.now() - started,
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: `таймаут ${timeoutMs} мс`, ms: Date.now() - started });
    });
    req.on("error", (error) => {
      resolve({ status: 0, error: error.message, ms: Date.now() - started });
    });
    req.end();
  });
}

/** Живой ли это ответ приложения, а не заглушка прокси. */
function looksLikeApp(result) {
  return result.status === 200 && result.body.includes("Yargram");
}

function mark(result) {
  if (result.error) return `✗ ${result.error}`;
  return `${result.status}${result.server ? ` (${result.server})` : ""}`;
}

const problems = [];
const notes = [];

console.log("");
console.log(`Проверка Yargram — ${DOMAIN}`);
console.log("=".repeat(40 + DOMAIN.length));
console.log("");

// 1. DNS: куда ведёт домен.
let originIp = arg("origin", "");
try {
  const resolved = await lookup(DOMAIN, { all: true });
  const addresses = resolved.map((entry) => entry.address);
  console.log(`DNS ${DOMAIN}: ${addresses.join(", ")}`);

  // 🔥 Прокси Cloudflare узнаётся по его же подсетям. Это важно: при включённом
  // прокси DNS отдаёт адрес Cloudflare, а не сервера Raven, и проверять порт
  // приложения по этому адресу бессмысленно.
  const cloudflare = addresses.some(
    (address) =>
      address.startsWith("104.21.") ||
      address.startsWith("172.67.") ||
      address.startsWith("188.114.") ||
      address.startsWith("2a06:98c1:"),
  );
  console.log(`Прокси Cloudflare: ${cloudflare ? "включён" : "нет (DNS отдаёт сервер напрямую)"}`);
  if (cloudflare) {
    notes.push("Прокси Cloudflare включён — сертификат выдаёт Cloudflare.");
  } else {
    notes.push("Прокси Cloudflare выключен — TLS придётся держать самому серверу.");
  }

  if (!originIp) {
    const server = addresses.find((address) => !address.startsWith("2a06:98c1:"));
    originIp = cloudflare ? "" : server;
  }
} catch (error) {
  console.log(`DNS ${DOMAIN}: ✗ ${error.message}`);
  problems.push("Домен не разрешается в адрес — проверьте DNS-записи.");
}
console.log("");

// 2. Как домен отвечает снаружи.
const viaHttp = await probe({ url: `http://${DOMAIN}/`, host: DOMAIN, proto: "http" });
const viaHttps = await probe({ url: `https://${DOMAIN}/`, host: DOMAIN, proto: "https" });

console.log("Снаружи, через браузерный адрес:");
console.log(`  http://${DOMAIN}/   -> ${mark(viaHttp)}`);
console.log(`  https://${DOMAIN}/  -> ${mark(viaHttps)}`);
console.log("");

// 3. Что отвечает сам сервер — по HTTP и HTTPS.
// Здесь и находится причина: если по HTTP он жив, а по HTTPS нет, дело в
// сертификате на стороне сервера, а не в приложении.
let originHttp = null;
let originHttps = null;
if (originIp) {
  console.log(`Сам сервер ${originIp} (с подменой Host):`);
  originHttp = await probe({
    url: `http://${originIp}/`,
    host: DOMAIN,
    proto: "http",
  });
  originHttps = await probe({
    url: `https://${originIp}/`,
    host: DOMAIN,
    proto: "https",
  });
  const appPort = await probe({
    url: `http://${originIp}:${APP_PORT}/api/health`,
    host: DOMAIN,
    proto: "http",
  });
  console.log(`  порт 80    -> ${mark(originHttp)}`);
  console.log(`  порт 443   -> ${mark(originHttps)}`);
  console.log(`  порт ${APP_PORT} -> ${mark(appPort)}${appPort.status === 200 ? " (приложение живо)" : ""}`);
  console.log("");

  if (appPort.status !== 200) {
    problems.push(
      `Приложение не отвечает на порту ${APP_PORT}. Нажмите Start в панели Raven и проверьте Console.`,
    );
  }
} else {
  console.log("Адрес сервера неизвестен — пропускаю прямую проверку.");
  console.log("Укажите его вручную: node scripts/check-host.mjs --origin <IP>");
  console.log("");
  notes.push("Для полной диагностики нужен --origin <IP сервера>.");
}

// 4. Вывод.
if (looksLikeApp(viaHttps)) {
  console.log("ИТОГ: HTTPS работает — приложение открывается по защищённому адресу.");
} else if (originHttp && looksLikeApp(originHttp) && originHttps?.status === 502) {
  // 🔥 Это и есть искомый диагноз, и он опирается на два факта разом: по HTTP
  // сервер отдаёт само приложение (а не заглушку), а по HTTPS — ошибку. Одного
  // «502 на 443» мало: его отдаёт и выключенное приложение.
  console.log("ИТОГ: причина найдена — режим SSL/TLS в Cloudflare.");
  console.log("");
  console.log("  Через Cloudflare сайт отвечает по HTTP, а по HTTPS — нет.");
  console.log("  И при этом сам сервер по порту 80 отдаёт приложение (200),");
  console.log("  а по порту 443 — 502. Значит Cloudflare в режиме Full стучится");
  console.log("  на порт 443, где сертификата вашего домена нет.");
  console.log("");
  console.log("  Лечение (только в панели Cloudflare):");
  console.log("    1. SSL/TLS → Overview → режим Flexible");
  console.log("    2. Edge Certificates → Always Use HTTPS → включить");
  console.log("");
  problems.push("Cloudflare в режиме Full: переключите SSL/TLS на Flexible.");
} else if (viaHttp.status === 0 || viaHttps.status === 0) {
  console.log("ИТОГ: сервер не отвечает — похоже, приложение выключено.");
  problems.push("Сайт недоступен целиком: проверьте, запущено ли приложение в панели.");
} else if (viaHttps.status === 502) {
  console.log("ИТОГ: 502 на HTTPS. Подробности — docs/ИНСТРУКЦИЯ_RAVEN.md.");
} else {
  console.log(`ИТОГ: HTTPS отвечает кодом ${viaHttps.status}.`);
}

// 5. Файлы приложения для установки как программы.
console.log("");
console.log("Раздача приложения (по рабочему адресу):");
const base = looksLikeApp(viaHttps) ? `https://${DOMAIN}` : `http://${DOMAIN}`;
for (const [path, expected] of [
  ["/app", "text/html"],
  ["/app/manifest.webmanifest", "manifest"],
  ["/app/sw.js", "javascript"],
  ["/app/brand/icon-192.png", "image/png"],
  ["/app/brand/icon-512.png", "image/png"],
]) {
  const result = await probe({ url: `${base}${path}`, host: DOMAIN, proto: base.startsWith("https") ? "https" : "http" });
  const ok = result.status === 200 && result.contentType.includes(expected.replace("manifest", "manifest"));
  console.log(`  ${ok ? "✓" : "✗"} ${path} -> ${mark(result)}`);
  if (!ok) notes.push(`Не отдаётся ${path} — установка приложения не сработает.`);
}

if (notes.length) {
  console.log("");
  for (const note of notes) console.log(`  · ${note}`);
}

if (problems.length) {
  console.log("");
  console.log("ЧТО ДЕЛАТЬ:");
  for (const problem of problems) console.log(`  ! ${problem}`);
}

console.log("");
process.exit(problems.length ? 1 : 0);
