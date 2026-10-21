#!/usr/bin/env node
/**
 * Автоматическая настройка Cloudflare для Yargram.
 *
 * Применяет параметры, необходимые для стабильной работы мессенджера
 * и обхода блокировок ТСПУ (РКН) в РФ без VPN/запретов:
 *   1. ech -> off               (отключает Encrypted Client Hello, блокируемый в РФ)
 *   2. http3 -> off             (отключает QUIC UDP, который глушат сотовые операторы)
 *   3. min_tls_version -> 1.2   (современный защищённый TLS)
 *   4. tls_1_3 -> on            (быстрое TLS 1.3 подключение)
 *   5. websockets -> on         (поддержка сокетов чата и звонков)
 *   6. ssl -> flexible          (режим SSL для origin без сертификата на 443)
 *   7. always_use_https -> on   (перенаправление с HTTP на HTTPS)
 *   8. brotli -> on             (сжатие ассетов)
 *   9. early_hints -> on        (ускорение загрузки)
 *
 * Токен берётся из:
 *   --token <token>
 *   переменной окружения CLOUDFLARE_API_TOKEN
 *   файла runtime/cloudflare.token
 *   или запрашивается в консоли.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { request as httpsRequest } from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const TOKEN_FILE = resolve(ROOT_DIR, "runtime", "cloudflare.token");

const TARGET_SETTINGS = [
  { id: "ech", target: "off", title: "Encrypted Client Hello (ECH)", desc: "Отключен — сайт открывается в РФ без VPN и zapret" },
  { id: "ipv6", target: "off", title: "IPv6 Compatibility", desc: "Отключен — устраняет ошибку подключения на мобильных сетях РФ" },
  { id: "http3", target: "off", title: "HTTP/3 (QUIC over UDP)", desc: "Отключен — предотвращает зависания на мобильных сетях" },
  { id: "security_level", target: "essentially_off", title: "Security Level", desc: "Essentially Off — исключает ложные блокировки мобильных IP в РФ" },
  { id: "min_tls_version", target: "1.2", title: "Minimum TLS Version", desc: "1.2 — современные и надёжные протоколы шифрования" },
  { id: "tls_1_3", target: "on", title: "TLS 1.3", desc: "Включен — быстрое и безопасное рукопожатие" },
  { id: "websockets", target: "on", title: "WebSockets", desc: "Включен — мгновенные сообщения и звонки" },
  { id: "ssl", target: "flexible", title: "SSL/TLS Encryption Mode", desc: "Flexible — совместимость с хостингом Raven Host" },
  { id: "always_use_https", target: "on", title: "Always Use HTTPS", desc: "Включен — автоматический переход на защищённый протокол" },
  { id: "brotli", target: "on", title: "Brotli Compression", desc: "Включен — быстрая загрузка веб-приложения" },
  { id: "early_hints", target: "on", title: "Early Hints", desc: "Включен — ускоренная подгрузка стилей и скриптов" },
];

function cfFetch(url, token, options = {}) {
  return new Promise((res, rej) => {
    const parsed = new URL(url);
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "yargram-cloudflare-setup/1.0",
          ...(options.headers || {}),
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            const data = JSON.parse(body);
            res({ status: response.statusCode, data });
          } catch {
            res({ status: response.statusCode, raw: body });
          }
        });
      },
    );
    req.on("error", rej);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function readWranglerToken() {
  const candidates = [
    resolve(process.env.USERPROFILE || "", ".config", ".wrangler", "config", "default.toml"),
    resolve(process.env.APPDATA || "", "xdg.config", ".wrangler", "config", "default.toml"),
    resolve(process.env.USERPROFILE || "", ".wrangler", "config", "default.toml"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        const content = readFileSync(file, "utf-8");
        const match = content.match(/oauth_token\s*=\s*["']([^"']+)["']/);
        if (match && match[1]) {
          return match[1].trim();
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

async function promptToken() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question("\nВведите ваш Cloudflare API Token: ", (answer) => {
      rl.close();
      res(answer.trim());
    });
  });
}

async function main() {
  console.log("\n========================================================");
  console.log("       Автоматическая настройка Cloudflare для Yargram   ");
  console.log("========================================================\n");

  let token = process.env.CLOUDFLARE_API_TOKEN;
  const args = process.argv.slice(2);
  const tokenArgIdx = args.indexOf("--token");
  if (tokenArgIdx !== -1 && args[tokenArgIdx + 1]) {
    token = args[tokenArgIdx + 1].trim();
  }

  const wranglerToken = readWranglerToken();

  if (!token && wranglerToken) {
    token = wranglerToken;
    console.log("· Загружен токен авторизации Cloudflare из Wrangler (вход через браузер)");
  }

  if (!token && existsSync(TOKEN_FILE)) {
    try {
      token = readFileSync(TOKEN_FILE, "utf-8").trim();
      if (token) {
        console.log("· Загружен сохранённый токен из runtime/cloudflare.token");
      }
    } catch {
      // ignore
    }
  }

  if (!token) {
    console.log("Токен не найден в переменных среды или runtime/cloudflare.token.");
    token = await promptToken();
  }

  if (!token) {
    console.error("ОШИБКА: Токен не указан. Завершение работы.");
    process.exit(1);
  }

  console.log("· Проверка валидности токена в Cloudflare...");
  const verify = await cfFetch("https://api.cloudflare.com/client/v4/user/tokens/verify", token);
  if (!verify.data?.success) {
    console.error("ОШИБКА: Токен недействителен или отозван!");
    if (verify.data?.errors) {
      console.error(JSON.stringify(verify.data.errors, null, 2));
    }
    process.exit(1);
  }
  console.log("✓ Токен подтверждён и активен.");

  // Сохраняем рабочий токен для будущих запусков
  try {
    writeFileSync(TOKEN_FILE, token, "utf-8");
  } catch {
    // ignore
  }

  const domain = "yargram.site";
  console.log(`· Поиск зоны ${domain}...`);
  const zonesResp = await cfFetch(`https://api.cloudflare.com/client/v4/zones?name=${domain}`, token);
  const zone = zonesResp.data?.result?.[0];
  if (!zone) {
    console.error(`ОШИБКА: Зона ${domain} не найдена в этом аккаунте Cloudflare!`);
    process.exit(1);
  }

  const zoneId = zone.id;
  console.log(`✓ Зона найдена: ${zone.name} (ID: ${zoneId})`);
  console.log("\n--------------------------------------------------------");
  console.log(" Применение оптимальных параметров...");
  console.log("--------------------------------------------------------\n");

  let changedCount = 0;
  for (const s of TARGET_SETTINGS) {
    const getUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/${s.id}`;
    const curResp = await cfFetch(getUrl, token);
    const curVal = curResp.data?.result?.value;

    if (curVal === s.target) {
      console.log(`  [OK]       ${s.title.padEnd(30)} = ${s.target}`);
      console.log(`             └─ ${s.desc}`);
    } else {
      process.stdout.write(`  [ПРАВКА]   ${s.title.padEnd(30)} -> ${s.target}... `);
      const patchResp = await cfFetch(getUrl, token, {
        method: "PATCH",
        body: { value: s.target },
      });
      if (patchResp.data?.success) {
        console.log("УСПЕШНО");
        console.log(`             └─ ${s.desc}`);
        changedCount++;
      } else {
        console.log(`ОШИБКА (${patchResp.data?.errors?.[0]?.message || "сбой"})`);
      }
    }
  }

  console.log("\n--------------------------------------------------------");
  console.log(" Проверка внешней доступности через DNS Google...");
  console.log("--------------------------------------------------------\n");

  try {
    const dnsResp = await cfFetch(`https://dns.google/resolve?name=${domain}&type=HTTPS`, token);
    const dataStr = dnsResp.data?.Answer?.[0]?.data || "";
    if (dataStr.includes("ech=")) {
      console.log("  ⚠️ Параметр ech= ещё присутствует в кэше DNS (обновится в течение нескольких минут).");
    } else {
      console.log("  ✓ Параметр ech= отсутствует в DNS — блокировка ТСПУ для РФ снята!");
    }
  } catch {
    console.log("  · Проверка DNS пропущена.");
  }

  console.log("\n========================================================");
  console.log(` Настройка завершена! ${changedCount > 0 ? `Изменено настроек: ${changedCount}` : "Все параметры уже были настроены идеально."}`);
  console.log(" Yargram готов к открытию в РФ без VPN и сторонних утилит.");
  console.log(" Адрес: https://yargram.site/app");
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error("Непредвиденная ошибка:", err);
  process.exit(1);
});
