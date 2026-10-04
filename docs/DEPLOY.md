# Yargram на сервере (без своего ПК)

Сейчас Yargram работает на компьютере владельца: сервер и база поднимаются
файлом `Запустить Yargram.bat`, друзья заходят по адресу Radmin VPN. Это
документ о том, как перенести Yargram на арендованный сервер (VPS), чтобы он
работал круглосуточно, **даже когда компьютер выключен**, и чтобы звонки
работали в обычном интернете без VPN.

> **Нужна инструкция «нажми сюда — введи это»?** Она в **`docs/ИНСТРУКЦИЯ.md`**:
> там те же шаги, но разжёванные по пунктам с готовыми командами. Этот документ —
> справочник: почему так, и что делать, если что-то пошло не так.

> **Хостинг — Raven Host (free tier)?** Тогда отдельная инструкция —
> **`docs/ИНСТРУКЦИЯ_RAVEN.md`**: shared app-хостинг, JSON-хранилище вместо
> PostgreSQL, без звонков (нет UDP). Звонки возвращаются на VPS за $3.99/мес.

## Чек-лист переезда

Весь путь по порядку. Подробности — в разделах ниже, ссылки в скобках.
Отмечайте по мере выполнения: шаги, которые легко пропустить, помечены 🔥.

### До консоли

- [ ] Решить, будет ли **домен**. Есть домен → HTTPS через nginx + Let's Encrypt
      (часть 5А). Нет домена → Cloudflare Tunnel, но адрес будет меняться (часть 5Б).
- [ ] Приготовить **SSH-ключ** — по нему вход на сервер.
- [ ] 🔥 Приготовить **ключ шифрования**. `JWT_SECRET` можно придумать новый (сессии
      просто обнулятся), а 🔥 **`DB_ENCRYPTION_KEY` надо перенести тем же, что на
      прежней машине** — он лежит в `КЛЮЧ.txt` рядом с копией. Придумать новый нельзя:
      сообщения и файлы лежат в базе зашифрованными, и импорт кладёт их как есть, не
      перешифровывая. С другим ключом база примет данные без ошибки, но ни одно
      сообщение не прочитается (часть 3).

### В консоли Oracle (раздел «Если сервер — Oracle Cloud Always Free»)

- [ ] Создать инстанс: образ **Ubuntu 22.04/24.04**, форма **`VM.Standard.A1.Flex`**,
      2 OCPU / 12 ГБ, регион ближе к вам и к друзьям.
- [ ] 🔥 Публичный IP — **зарезервированный**, не эфемерный. Иначе адрес сменится и
      сломает `PUBLIC_ORIGIN`, сертификат и ссылку у друзей.
- [ ] 🔥 Открыть порты в **Security List**: `80/tcp`, `443/tcp`, `3478/tcp`,
      `3478/udp`, `49160–49200/udp`.
- [ ] Записать публичный IP и имя пользователя по умолчанию (`ubuntu`).

### На сервере

- [ ] Обновить систему и поставить **Node 22** (часть 1).
- [ ] Завести пользователя **`yargram`**: от `root` встроенная PostgreSQL не стартует (часть 1).
- [ ] 🔥 Открыть те же порты в **`iptables`** и сохранить правила: `ufw` его не
      перебивает, без этого сервер будет недоступен (раздел про Oracle).
- [ ] Клонировать репозиторий, `npm install --workspaces --include-workspace-root`,
      `npm run build` (часть 2). Ставить **с** dev-зависимостями: без них сборка не
      соберётся. `embedded-postgres` теперь в `dependencies`, поэтому база при этом
      не пострадает.
- [ ] 🔥 Создать базу **один раз вручную**: `node scripts/local-postgres.mjs`. Папки
      `runtime/` в репозитории нет, и без этого шага сервер молча встанет на пустую
      JSON-базу (часть 2).
- [ ] 🔥 Снять копию на прежней машине и перенести её: `database.json` +
      вложения в `apps/server/data/uploads`, затем `npm run db:import` (часть 2).
      Брать `apps/server/data/yargram.json` **нельзя** — это устаревший слепок.
- [ ] Заполнить `.env`: `PUBLIC_ORIGIN`, `JWT_SECRET`, `DB_ENCRYPTION_KEY`,
      `TRUST_PROXY=loopback`, почта (часть 3).
- [ ] Поставить **systemd**-юнит и запустить: `systemctl enable --now yargram` (часть 4).
- [ ] Настроить **HTTPS** — nginx + certbot либо `cloudflared` (часть 5).
- [ ] Поднять **coturn** и пересобрать веб с `VITE_TURN_*`: без этого звонки в
      интернете работать не будут (часть 6).
- [ ] 🔥 Настроить **копии**: cron на `scripts/backup.mjs` и вывоз
      `runtime/backups` **с сервера** (часть 8). Это главная защита от того, что
      инстанс заберут.

### Проверка (часть «Что проверить после переезда»)

- [ ] `curl -s https://адрес/api/health` → `{"status":"ok"}`.
- [ ] Регистрация с новой почты: письмо с кодом приходит, вход завершается.
- [ ] Звонок между разными сетями (один — мобильный интернет, второй — домашний
      Wi-Fi); в `chrome://webrtc-internals` в кандидатах есть `relay`.
- [ ] Файл на 90 МБ доходит.
- [ ] «Активные сеансы» показывают `https://…`, а не `http://…`.
- [ ] `sudo reboot` — Yargram поднимается сам.

### После

- [ ] Прислать друзьям новый адрес.
- [ ] Проверить через сутки, что копия снялась и уехала с сервера.

## Два сайта из одного сервера

Проект отдаёт **две страницы** с одного адреса:

| Адрес  | Что это | Откуда берётся |
| ------ | ------- | -------------- |
| `/`    | Лендинг: название, описание возможностей, значки, скриншот-мокап и кнопка «Открыть Yargram» | `apps/landing`, сборка в `apps/landing/dist` |
| `/app` | Сам веб-Ярграм: переписка, звонки, настройки | `apps/web`, сборка в `apps/web/dist` |

Разделение нужно потому, что **обе страницы — одностраничные приложения**, и
оба отдают свой `index.html` на любой внутренний путь. Если посадить их на один
корень, лендинг перекроет приложение. Поэтому сборка приложения идёт с базовым
путём `/app` (см. `base` в `apps/web/vite.config.ts`), а сервер разводит их по
путям в `apps/server/src/app.ts`.

**Лендинг можно вынести отдельно.** Он статический: ни Node, ни базы ему не
нужно, поэтому годится Cloudflare Pages, GitHub Pages или любой хостинг
статики. В этом случае:

- адрес приложения задаётся лендингу переменной `VITE_APP_URL` на сборке
  (`VITE_APP_URL=https://yargram.example.com/app npm run build --workspace @yargram/landing`);
- без неё лендинг ведёт на относительный `/app` — вариант по умолчанию, когда
  оба сайта живут на одном сервере.

**Чего это стоит.** Бесплатного варианта с нормальными ресурсами не существует:
Hugging Face Spaces с сентября 2026 требует платный план для Docker/Gradio
Spaces, а единственный настоящий «навсегда бесплатный» — Oracle Cloud Always
Free, и у него в августе 2026 ARM-инстансы урезали с 4 OCPU / 24 ГБ до
2 OCPU / 12 ГБ. Для ЗБТ на 3–7 человек хватит и этого. Если бюджет есть, VPS за
€3–4/мес (4 ГБ / 2 vCPU) снимает почти все риски ниже.

---

## Что понадобится

- **Сервер.** Ubuntu 22.04 или 24.04, 2 vCPU, 2 ГБ RAM, 20 ГБ диска минимум.
  Для звонков важен **публичный IPv4** — он же адрес для `coturn`.
- **Домен (желательно, но не обязателен).** С доменом адрес постоянный и HTTPS
  настоящий. Без домена тоже работает: Cloudflare Tunnel выдаёт адрес вида
  `https://имя.trycloudflare.com`, но он **меняется при каждом запуске**, и
  друзьям придётся присылать ссылку заново.
- **Доступ по SSH** и права `sudo`.

Три вещи, которые нужно решить заранее:

1. **Откуда возьмётся HTTPS.** Браузер разрешает камеру и микрофон только на
   защищённом соединении, поэтому без HTTPS звонков не будет вовсе. Варианты:
   Cloudflare Tunnel (бесплатно, без домена) или nginx + Let's Encrypt (нужен
   домен). Оба описаны ниже.
2. **Откуда возьмётся TURN.** Он обязателен для звонков в интернете, см.
   отдельный раздел. Без него звонки будут работать только между участниками
   одной локальной сети.
3. **Лимит файлов у Cloudflare.** Тело запроса через туннель на бесплатном
   тарифе ограничено 100 МБ. Это в точности совпадает с лимитом вложения в
   Yargram (100 МиБ), поэтому файл у границы может не пройти. Если это мешает,
   ставьте nginx без туннеля или поднимите лимит на платном тарифе.

---

## Если сервер — Oracle Cloud Always Free

Наш выбор. Части 1–8 ниже подходят без изменений, но у Oracle есть свои
особенности, о которых лучше знать **до** создания инстанса.

**Что дают.** Ampere A1 (процессор ARM, то есть `aarch64`): **2 OCPU и 12 ГБ
памяти** — этого Yargram хватает с большим запасом. Диск: загрузочный том от
47 ГБ, всего бесплатно 200 ГБ. Есть ещё до двух микро-инстансов AMD, они не
нужны.

**Что уже проверено в проекте.** В `package-lock.json` лежит
`@embedded-postgres/linux-arm64` — значит встроенная PostgreSQL на ARM
заведётся, и ставить отдельную не придётся. Node 22 и `coturn` для `arm64` тоже
есть в обычных репозиториях. Менять в проекте ничего не нужно.

### 🔥 Две ловушки, которые решают исход

**1. Свободной ёмкости может не быть.** A1 выдаётся из общего пула, и в
популярных регионах создание падает с ошибкой «Out of host capacity». Это не
ошибка настройки: помогает другая зона доступности или другая попытка позже.
Отсюда практический вывод — **не рассчитывайте, что удалённый инстанс удастся
пересоздать сразу**.

**2. Простаивающий инстанс Oracle может забрать.** Официально: если за
**7 дней** одновременно CPU по 95-му процентилю ниже 20 %, сеть ниже 20 % и
память ниже 20 % (последнее — только для A1), инстанс считается простаивающим.
Мессенджер на 3–7 человек под это описание подходит идеально: Node и
PostgreSQL занимают сотни мегабайт из 12 ГБ, а сеть почти не нагружена.
**Риск настоящий, а не теоретический.**

Что с этим делать:

- **Копии обязаны уезжать с сервера** (часть 8) — это главное. Если инстанс
  заберут, переписка и файлы останутся у вас, а не пропадут вместе с ним.
- Не полагайтесь на Oracle как на единственное место. Переезд на другой VPS
  описан в частях 1–8 и занимает один вечер.
- Переход на **Pay As You Go** правило простоя **не отменяет**. Он даёт другое:
  лучшие шансы получить ёмкость и доступ к поддержке. Бесплатные ресурсы после
  перехода остаются бесплатными, но включается риск случайно создать платный —
  поэтому сразу поставьте бюджет и оповещение в разделе Billing.

### Создание инстанса

1. **Образ — Ubuntu 22.04 или 24.04**, не Oracle Linux: инструкция ниже под
   Ubuntu, и в Oracle Linux другие имена пакетов.
2. **Форма — `VM.Standard.A1.Flex`**, 2 OCPU / 12 ГБ. Если 2 OCPU не помещается,
   берите 1 OCPU / 6 ГБ — Yargram хватит и этого.
3. 🔥 **Публичный IP — зарезервированный** (Reserved public IP), а не эфемерный.
   Иначе адрес сменится при перезапуске, и вместе с ним сломаются
   `PUBLIC_ORIGIN`, сертификат и ссылка у друзей.
4. **Регион — ближе к вам и к друзьям.** От этого напрямую зависит качество
   звонков: медиа идёт через TURN, и каждый лишний прыжок слышно.
5. SSH-ключ сохраните — по нему будет вход.

### 🔥 Порты открываются в ДВУХ местах

Это ловушка номер один у Oracle: **облачный файрвол и файрвол внутри машины
независимы**, и открыть нужно оба.

**В облаке:** Networking → Virtual Cloud Networks → ваша VCN → Security Lists →
Default Security List → Add Ingress Rules. Нужны: `80/tcp`, `443/tcp`,
`3478/tcp`, `3478/udp`, `49160–49200/udp`.

**На машине:** образы Ubuntu у Oracle идут с собственным `iptables`, который
пропускает только SSH. `ufw` его не перебивает — правила нужно добавить прямо в
`iptables`, **перед** закрывающим правилом `REJECT`:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3478 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 3478 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 49160:49200 -j ACCEPT

sudo apt install -y iptables-persistent
sudo netfilter-persistent save     # иначе правила исчезнут после перезагрузки
```

Проверка, что всё открылось (с **другой** машины, не с сервера):

```bash
curl -s http://<ПУБЛИЧНЫЙ_IP>/api/health    # {"status":"ok",...}
```

Если не отвечает — сначала смотрите Security List, потом `sudo iptables -L INPUT -n --line-numbers`.
Обе причины выглядят одинаково: «соединение не устанавливается».

### Дальше — части 1–8 без изменений

С поправками по мелочи: `node --version` на ARM должен показать `v22.x`;
в части 6 `coturn` ставится из обычного репозитория; в части 8 вместо `scp` можно
взять любой удобный способ, важно только, чтобы копии оказались **вне** Oracle.

---

## Часть 1. Подготовка сервера

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential

# Node.js 22: Yargram требует >= 20
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # должно быть v22.x
```

Заведите отдельного пользователя — от `root` встроенная PostgreSQL
отказывается стартовать:

```bash
sudo adduser --disabled-password --gecos "" yargram
sudo usermod -aG sudo yargram
sudo su - yargram
```

## Часть 2. Код и сборка

```bash
git clone <адрес-репозитория> ~/yargram
cd ~/yargram
npm install --workspaces --include-workspace-root
npm run build
```

**Своя база на Linux работает как есть.** Yargram поднимает встроенную
PostgreSQL через `embedded-postgres`, и в `package-lock.json` лежат бинарники и
под `linux-x64`, и под `linux-arm64` — то есть и обычный сервер, и ARM-инстанс
Oracle A1. Ставить отдельный PostgreSQL и менять драйвер не нужно: скрипты
`scripts/local-postgres.mjs` и `scripts/ensure-postgres.mjs` написаны
кросс-платформенно.

⚠️ **`embedded-postgres` — зависимость времени работы, а не сборки.** Раньше он
числился в `devDependencies`; это была ошибка: `scripts/local-postgres.mjs`
импортирует его напрямую, а `scripts/ensure-postgres.mjs` (его запускает systemd
через `ExecStartPre`) поднимает базу. На сервере с `npm install --omit=dev`
приложение осталось бы **без базы**. Теперь пакет в `dependencies`, и
`--omit=dev` безопасен. Если видите свежий `package-lock.json` — проверить
одной командой:

```bash
node -e "console.log(require('./package-lock.json').packages['apps/server'].dependencies['embedded-postgres'])"
# должно напечатать версию, а не undefined
```

⚠️ **Но папки `runtime/` на сервере нет.** Она целиком в `.gitignore`: там
лежат пароль базы (`runtime/postgres/connection.json`), её данные, сертификаты
и копии. Поэтому после клонирования нужно создать базу **один раз вручную** —
иначе сервер поднимется на пустой JSON-базе из `apps/server/data/yargram.json`,
и вы не заметите подмены.

```bash
mkdir -p runtime/postgres
node scripts/local-postgres.mjs
# Напечатает: Local PostgreSQL ready on 127.0.0.1:55432.
# Connection saved to runtime/postgres/database.env. — оставьте это окно открытым.
```

Скрипт сгенерирует случайный пароль, создаст кластер и базу `yargram`, а
готовый `DATABASE_URL` положит в `runtime/postgres/database.env`. В `Ctrl+C`
он останавливает базу, **данные не удаляя** — дальше её будет поднимать
systemd.

Дальше переносите данные. ⚠️ **Брать надо копию, а не `apps/server/data/yargram.json`**:
это устаревший слепок, его никто не читает — настоящие данные в PostgreSQL, и
выгружаются они скриптом копий. Сделайте копию на прежней машине
(`Сделать копию Yargram.bat` или `npm run backup`) и возьмите
`runtime/backups/<дата>_<время>/` — там `database.json` и `КЛЮЧ.txt`, плюс зеркало
вложений в `runtime/backups/uploads/`.

Пока база пуста, импорт выполняется один раз:

```bash
npm run db:import -- ~/yargram-backups/2026-10-03_0147/database.json
```

Вложения положите в `apps/server/data/uploads` (их импорт не переносит).

⚠️ Повторный импорт в уже заполненную базу отклоняется — это защита от
затирания данных, а не ошибка.

## Часть 3. Настройки (`.env`)

Скопируйте пример и заполните:

```bash
cp .env.example .env
nano .env
```

Обязательные значения:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# Публичный адрес: по нему друзья открывают Yargram.
# Это же значение используется для CORS и для печати ссылки в лаунчере.
PUBLIC_ORIGIN=https://yargram.example.com

JWT_SECRET=<32+ случайных символов>
DB_ENCRYPTION_KEY=<16+ случайных символов>

# За прокси (Cloudflare Tunnel или nginx) — доверяем заголовку X-Forwarded-Proto.
# Без этого вход по HTTPS запишется в «Активных сеансах» как http://…
TRUST_PROXY=loopback

MAIL_DRIVER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=yargram.support@gmail.com
MAIL_PASS=<пароль приложения>
MAIL_FROM=yargram.support@gmail.com
```

`JWT_SECRET` сгенерировать так:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

🔥 **А `DB_ENCRYPTION_KEY` генерировать нельзя — его нужно перенести.** Тексты
сообщений и файлы лежат в базе зашифрованными этим ключом (AES-256-GCM), а
`migrate-json.ts` переносит `payload` **как есть**, не перешифровывая. С новым
ключом импорт пройдёт без ошибки, но ни одно перенесённое сообщение не
прочитается, и заметите вы это не сразу. Возьмите значение из `КЛЮЧ.txt` рядом с
копией (или из `.env` прежней машины) — и сохраните в менеджере паролей: без
него нечитаемы и резервные копии.

Самый надёжный вариант — перенести `.env` с прежней машины целиком и поправить
в нём только `PUBLIC_ORIGIN` и `TRUST_PROXY`: тогда ключ и почтовые настройки
совпадут гарантированно.

`CORS_ORIGINS` можно не трогать: сервер считает запрос «своим», если хост
`Origin` совпал с хостом запроса, поэтому публичный адрес проходит сам.

## Часть 4. Запуск под systemd

Лаунчер `Запустить Yargram.bat` — это Windows-скрипт, на сервере его заменяет
юнит systemd. Создайте файл `/etc/systemd/system/yargram.service`:

```ini
[Unit]
Description=Yargram server
After=network.target

[Service]
Type=simple
User=yargram
WorkingDirectory=/home/yargram/yargram
# Своя PostgreSQL поднимается этим же скриптом перед стартом сервера.
ExecStartPre=/usr/bin/node scripts/ensure-postgres.mjs
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=always
RestartSec=5
StandardOutput=append:/home/yargram/yargram/runtime/yargram.log
StandardError=append:/home/yargram/yargram/runtime/yargram.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now yargram
sudo systemctl status yargram
curl -s localhost:3000/api/health   # {"status":"ok",...}
```

Для обновления после правок кода:

```bash
cd ~/yargram && git pull && npm install --workspaces --include-workspace-root && npm run build
sudo systemctl restart yargram
```

## Часть 5. HTTPS

### Вариант А. nginx + Let's Encrypt (нужен домен)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Сначала получите сертификат (nginx должен отвечать на 80 порту):

```bash
sudo certbot --nginx -d yargram.example.com
```

Затем `/etc/nginx/sites-available/yargram`:

```nginx
server {
    listen 443 ssl http2;
    server_name yargram.example.com;

    ssl_certificate     /etc/letsencrypt/live/yargram.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yargram.example.com/privkey.pem;

    # WebSocket нужен Socket.IO: сообщения, «печатает», presence.
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }

    # Файлы: лимит тела запроса должен совпасть с лимитом Yargram.
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/yargram /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

И укажите в `.env`: `TRUST_PROXY=loopback`, затем
`sudo systemctl restart yargram`.

### Вариант Б. Cloudflare Tunnel (без домена, бесплатно)

🔥 **На ARM-инстансе (Oracle A1) нужен `arm64`-вариант** — `amd64` на ARM не
запустится:

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
sudo install cloudflared /usr/local/bin/cloudflared
```

На обычном `x64`-сервере берите `cloudflared-linux-amd64`.

Быстрый туннель для проверки:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Он напечатает адрес вида `https://что-то.trycloudflare.com`. Откройте его — это
и есть Yargram. Затем пропустите адрес в `.env` (`PUBLIC_ORIGIN=…`),
поставьте `TRUST_PROXY=loopback` и перезапустите сервер.

⚠️ Три ограничения, которые нужно знать:

- **Адрес меняется при каждом запуске** `cloudflared`. Друзьям придётся
  присылать ссылку заново. Постоянный адрес требует своего домена и
  «именованного» туннеля (`cloudflared tunnel create`, привязка DNS-записи).
- **UDP не проходит.** Он нужен звонкам, см. следующий раздел — медиа придётся
  выводить мимо туннеля, через TURN.
- **Тело запроса ≤ 100 МБ** на бесплатном тарифе.

Туннель тоже стоит держать под systemd, иначе он умрёт вместе с сессией:

```bash
cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate
# TODO: оформить как отдельный юнит после того, как адрес станет постоянным.
```

## Часть 6. TURN для звонков (обязательно)

Без TURN часть собеседников не соединится никогда: `stun` только сообщает
браузеру его внешний адрес, а если NAT «симметричный» (мобильный интернет,
часть корпоративных сетей), нужен релей, который **перегоняет** медиапоток
через себя. Именно эту роль в текущей схеме играет Radmin VPN — после переезда
её заменяет `coturn`.

```bash
sudo apt install -y coturn
sudo sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

`/etc/turnserver.conf`:

```ini
listening-port=3478
fingerprint
lt-cred-mech
realm=yargram.example.com
user=yargram:<пароль>
# Диапазон портов для медиа нужно открыть в файрволе.
min-port=49160
max-port=49200
# Внешний адрес сервера — без него TURN не поймёт, какой адрес отдавать.
external-ip=<ПУБЛИЧНЫЙ_IP_СЕРВЕРА>
no-multicast-peers
```

```bash
sudo systemctl enable --now coturn
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 49160:49200/udp
```

Затем соберите веб-часть с адресом релея:

```bash
export VITE_TURN_URL="turn:<ПУБЛИЧНЫЙ_IP_СЕРВЕРА>:3478"
export VITE_TURN_USERNAME="yargram"
export VITE_TURN_CREDENTIAL="<пароль>"
npm run build --workspace @yargram/web
sudo systemctl restart yargram
```

Проверить, что релей виден, можно на `https://icetest.info` или в
`chrome://webrtc-internals` во время звонка: в списке кандидатов должен
появиться `relay`.

## Часть 7. Файрвол

На сервере нужны только 80, 443 и порты TURN. PostgreSQL слушает
`127.0.0.1:55432` и наружу не смотрит — это правильно, оставьте так.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp
sudo ufw allow 49160:49200/udp
sudo ufw enable
```

⚠️ **На Oracle Cloud этих правил недостаточно.** Образы Ubuntu там идут с
собственным `iptables`, который `ufw` не перебивает, плюс порты нужно открыть в
Security List в облаке. Готовые команды — в разделе «Если сервер — Oracle Cloud
Always Free» выше. Признак ошибки один и тот же: соединение просто не
устанавливается, хотя сервер запущен.

## Часть 8. Резервные копии — обязательно

У поставщика бесплатного сервера бэкапов, скорее всего, нет вовсе, а аккаунт
могут закрыть без предупреждения. Копии должны уезжать **за пределы сервера**:

```bash
crontab -e
# Каждый день в 4 утра
0 4 * * * cd /home/yargram/yargram && /usr/bin/node scripts/backup.mjs --quiet
```

Скрипт делает логический дамп базы и дополняет зеркало вложений, хранит копии
неделю. Затем **скачивайте папку `runtime/backups` к себе**:

```bash
# С локального компьютера, раз в неделю:
scp -r yargram@<сервер>:~/yargram/runtime/backups ./yargram-backups
```

⚠️ **Файл `КЛЮЧ.txt` из скачанной копии храните отдельно от неё.** Без него
копия нечитаема, но вместе с ней он делает её бесполезной для того, кто её
найдёт.

---

## Что проверить после переезда

1. `curl -s https://ваш-адрес/api/health` → `{"status":"ok"}`.
2. Регистрация с новой почты: письмо с кодом приходит, вход завершается.
3. Созвониться с друзей в разных сетях (один — мобильный интернет, второй —
   домашний Wi-Fi). В `chrome://webrtc-internals` должен быть `relay`.
4. Загрузить файл на 90 МБ — должен дойти. Файл на 100 МБ — может не пройти,
   если стоит Cloudflare Tunnel.
5. Открыть «Активные сеансы»: адрес должен быть `https://…`, а не `http://…`
   (это проверка, что `TRUST_PROXY` задан верно).
6. Перезагрузить сервер (`sudo reboot`): Yargram должен подняться сам.

## Известные ограничения

- **Приложение станет публичным.** `trycloudflare.com` открыт всем, кто знает
  адрес. Если это нежелательно, закройте регистрацию или поставьте пароль на
  вход. Cloudflare умеет `--allowed-mail` — вход по одноразовому коду на почту.
- **Почта — единая точка отказа входа.** Проверок `emailVerified` при входе нет,
  поэтому код нужен всегда. Два ящика уже настроены (`MAIL_USER`, `MAIL_USER_2`),
  но при проблеме с обоими выручает `MAIL_DRIVER=console` и код из журнала.
- **Пароли приложений Google.** Если Google отзовёт пароль, письма встанут.
  Держите второй ящик заполненным — он подхватывает отправку автоматически.
- **Web Push отсутствует.** Уведомления видны только при открытой вкладке.
- **Один процесс.** Presence и звонки живут в памяти процесса; запускать две
  копии сервера на одной базе нельзя.

## Если через Cloudflare

Три места, где Cloudflare и Yargram расходятся, — их лучше знать заранее.

1. **UDP через Cloudflare не проходит.** Туннель везёт HTTP и WebSocket, но не
   UDP, а медиа WebRTC — именно UDP. Поэтому звонки придётся вывести мимо
   туннеля: `coturn` на сервере с настоящим публичным IP и `VITE_TURN_*` при
   сборке (см. часть 6). Без этого звонки работать не будут, а переписка —
   будет.
2. **Лимит тела запроса 100 МБ** на бесплатном тарифе. Это ровно наш предел
   вложения (100 МиБ), то есть файл у границы может не пройти. Лечится nginx
   без туннеля либо платным тарифом.
3. **Адрес**. Именованный туннель с привязкой к домену даёт постоянный адрес;
   быстрый (`--url`) меняет адрес при каждом запуске, и друзьям придётся
   присылать ссылку заново.

Отдельно про лендинг: его **можно и стоит** положить на Cloudflare Pages — это
статика, она раздаётся бесплатно и без сервера. Тогда лендинг живёт на
`yargram.example.com`, а приложение остаётся на сервере; при сборке лендинга
укажите адрес приложения:

```bash
VITE_APP_URL=https://app.example.com/app npm run build --workspace @yargram/landing
```

⚠️ Если лендинг и приложение окажутся на **разных доменах**, добавьте домен
приложения в `CORS_ORIGINS` в `.env`: сервер считает своим только тот адрес, чей
хост совпал с хостом запроса, и с чужого домена запросы не пройдут.
