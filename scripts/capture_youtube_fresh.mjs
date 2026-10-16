import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 3100;
const CDP_PORT = 9388;
const BASE = `http://127.0.0.1:${PORT}`;
const APP = `${BASE}/app/`;
const DATA_DIR = path.resolve('runtime/screenshot-preview/data-yt-fresh');
const OUT_DIR = path.resolve('media/youtube/fresh_shots');
const CHROME_PROFILE = path.resolve('runtime/screenshot-preview/chrome-profile-yt');
const PASSWORD = 'correct horse battery staple';

async function main() {
  console.log('--- 1. Очистка старой директории данных стенда ---');
  try {
    await rm(DATA_DIR, { recursive: true, force: true });
  } catch {}
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  console.log('--- 2. Запуск локального сервера Yargram (порт 3100) ---');
  const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: 'C:/Games/YarGram',
    env: {
      ...process.env,
      HTTPS_PORT: '0',
      PORT: String(PORT),
      NODE_ENV: 'production',
      DATABASE_DRIVER: 'json',
      EMAIL_CONFIRMATION: 'false',
      DATA_DIR,
    },
    stdio: 'inherit',
  });

  server.on('error', (err) => {
    console.error('Ошибка сервера:', err);
  });

  // Ждем готовности сервера
  let serverReady = false;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch {}
    await delay(300);
  }
  if (!serverReady) {
    server.kill();
    throw new Error('Сервер не запустился на порту ' + PORT);
  }
  console.log('Сервер готов!');

  try {
    console.log('--- 3. Сидирование данных пользователей и сообщений ---');
    async function api(path, { method = 'POST', token, body } = {}) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
      return parsed;
    }

    async function register(email, displayName, username) {
      const res = await api('/api/auth/register', { body: { email, password: PASSWORD, displayName, username } });
      return { token: res.accessToken ?? res.token, user: res.user };
    }

    const alisa = await register('alisa@preview.test', 'Алиса', 'alisa');
    const bob = await register('bob@preview.test', 'Боб', 'bob');
    const mila = await register('mila@preview.test', 'Мила', 'mila');
    const mark = await register('mark@preview.test', 'Марк', 'mark');

    // Профили
    await api('/api/users/me', {
      method: 'PATCH',
      token: alisa.token,
      body: { bio: 'Создатель Yargram 🚀 Добро пожаловать в бета-тест!', birthday: '2001-05-15' },
    });
    await api('/api/users/me', {
      method: 'PATCH',
      token: bob.token,
      body: { bio: 'Люблю чистый дизайн и быстрые интерфейсы ⚡', birthday: '1998-10-22' },
    });
    await api('/api/users/me', {
      method: 'PATCH',
      token: mila.token,
      body: { bio: 'Дизайнер 🎨 Создаю уют и красоту в чатах.', birthday: '2002-03-08' },
    });

    // Группа
    const group = await api('/api/groups', {
      token: alisa.token,
      body: {
        title: 'Yargram Community 🚀',
        description: 'Официальное сообщество ЗБТ 0.0.1. Обсуждение и новости.',
        memberIds: [bob.user.id, mila.user.id, mark.user.id],
      },
    });
    const groupId = group.conversation.id;

    // Сообщения в группе
    const m1 = await api(`/api/conversations/${groupId}/messages`, {
      token: alisa.token,
      body: { text: 'Всем привет! Мы официально открыли ЗБТ 0.0.1 Yargram 🎉' },
    });
    const m2 = await api(`/api/conversations/${groupId}/messages`, {
      token: bob.token,
      body: { text: 'Скорость отличная, всё открывается моментально и плавно ⚡' },
    });
    const m3 = await api(`/api/conversations/${groupId}/messages`, {
      token: mila.token,
      body: { text: 'Тёмная тема и обои Aurora просто восторг! 😍' },
    });

    // Реакции на сообщения
    try {
      await api(`/api/conversations/${groupId}/messages/${m1.message?.id || m1.id}/reactions`, {
        token: bob.token,
        body: { emoji: '🔥' },
      });
      await api(`/api/conversations/${groupId}/messages/${m1.message?.id || m1.id}/reactions`, {
        token: mila.token,
        body: { emoji: '❤️' },
      });
      await api(`/api/conversations/${groupId}/messages/${m2.message?.id || m2.id}/reactions`, {
        token: alisa.token,
        body: { emoji: '👍' },
      });
    } catch (e) {
      console.log('Реакции:', e.message);
    }

    // Личный диалог Алиса <-> Боб
    const direct = await api('/api/conversations/direct', {
      token: alisa.token,
      body: { userId: bob.user.id },
    });
    const directId = direct.conversation.id;
    await api(`/api/conversations/${directId}/messages`, {
      token: bob.token,
      body: { text: 'Привет! Релиз 0.0.1 готов к тестированию, проверяй ссылку https://yargram.site' },
    });
    await api(`/api/conversations/${directId}/messages`, {
      token: alisa.token,
      body: { text: 'Супер! Ссылки кликаются в новой вкладке, как и просили 🚀' },
    });

    // Непрочитанное сообщение от Милы (чтобы был бейдж)
    const directMila = await api('/api/conversations/direct', {
      token: mila.token,
      body: { userId: alisa.user.id },
    });
    await api(`/api/conversations/${directMila.conversation.id}/messages`, {
      token: mila.token,
      body: { text: 'Алиса, подготовила новые стикерпаки для релиза!' },
    });

    console.log('Данные успешно засеяны!');

    console.log('--- 4. Запуск Chrome Headless через CDP ---');
    const chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=1920,1080',
      'about:blank',
    ], { stdio: 'ignore' });

    let chromeReady = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (response.ok) { chromeReady = true; break; }
      } catch {}
      await delay(300);
    }
    if (!chromeReady) throw new Error('Chrome не запустился');

    const created = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
    const target = await created.json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('WS connection error'));
    });

    let nextId = 1;
    const pending = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    };

    function send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error(`${method} timeout`));
          }
        }, 25000);
      });
    }

    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }

    async function shot(filename) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const outPath = `${OUT_DIR}/${filename}`;
      await writeFile(outPath, Buffer.from(data, 'base64'));
      console.log(`[Скриншот сохранён]: ${outPath}`);
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 1. Лендинг (Hero)
    console.log('Снимаем лендинг...');
    await send('Page.navigate', { url: `${BASE}/` });
    await delay(2500);
    // Применяем темную тему на лендинге
    await evaluate(`(() => {
      localStorage.setItem('yargram.landing.theme', 'dark');
      document.documentElement.classList.add('dark');
    })()`);
    await delay(500);
    await shot('01_landing_hero.png');

    // Прокручиваем лендинг к преимуществам
    await evaluate(`window.scrollTo({ top: 750, behavior: 'instant' })`);
    await delay(600);
    await shot('02_landing_features.png');

    // 2. Вход в App под Алисой
    console.log('Переходим в приложение...');
    await send('Page.navigate', { url: APP });
    await delay(2000);
    await evaluate(`(() => {
      localStorage.setItem('yargram.accessToken', ${JSON.stringify(alisa.token)});
      localStorage.setItem('yargram.onboardingDone', '1');
      localStorage.setItem('yargram.theme', 'dark');
      localStorage.setItem('yargram.themes', JSON.stringify({ activeId: 'dark', custom: [] }));
      localStorage.setItem('yargram.themes.' + ${JSON.stringify(alisa.user.id)}, JSON.stringify({ activeId: 'dark', custom: [] }));
      document.documentElement.classList.add('dark');
    })()`);
    await send('Page.navigate', { url: APP });
    await delay(3500);

    // Скриншот основного экрана (группа Yargram Community)
    console.log('Снимаем группу в темной теме...');
    await evaluate(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const grp = btns.find(b => b.textContent.includes('Yargram Community'));
      if (grp) grp.click();
    })()`);
    await delay(1500);
    await shot('03_app_chat_group.png');

    // Создаем опрос через интерфейс в группе
    console.log('Создаем опрос...');
    try {
      await evaluate(`(() => {
        const btn = document.querySelector('button[aria-label="Создать опрос"]');
        if (btn) btn.click();
      })()`);
      await delay(800);

      await evaluate(`(() => {
        const setVal = (sel, val) => {
          const el = document.querySelector(sel);
          if (el) {
            const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            proto.set.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        };
        setVal('[aria-label="Текст вопроса"]', 'Что ждёте в ЗБТ 0.0.1? 🔥');
        setVal('[aria-label="Добавить ответ"]', 'Супер скорость и минимализм ⚡');
        setVal('[aria-label="Вариант 2"]', 'Стикеры, опросы и реакции 🎉');
      })()`);
      await delay(600);
      await evaluate(`(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Создать');
        if (btn) btn.click();
      })()`);
      await delay(1500);

      // Голосуем за 1 вариант
      await evaluate(`(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Супер скорость'));
        if (btn) btn.click();
      })()`);
      await delay(1000);
      await shot('04_app_poll_active.png');
    } catch (e) {
      console.warn('Не удалось создать опрос:', e.message);
    }

    // Переходим в диалог с Бобом
    console.log('Снимаем диалог с Бобом...');
    await evaluate(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const bobBtn = btns.find(b => b.textContent.includes('Боб') && !b.textContent.includes('Community'));
      if (bobBtn) bobBtn.click();
    })()`);
    await delay(1200);
    await shot('05_app_direct_chat.png');

    // Открываем панель стикеров / эмодзи
    console.log('Снимаем пикер стикеров / реакций...');
    try {
      await evaluate(`(() => {
        const btn = document.querySelector('button[aria-label="Стикеры и гифки"]') ||
                    document.querySelector('button[aria-label="Добавить эмодзи"]') ||
                    document.querySelector('button[title*="стикер"]');
        if (btn) btn.click();
      })()`);
      await delay(1000);
      await shot('06_app_stickers_picker.png');
      // Закрываем модалку по Escape
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
      await delay(500);
    } catch (e) {
      console.warn('Пикер:', e.message);
    }

    // Открываем профиль
    console.log('Снимаем профиль пользователя...');
    try {
      await evaluate(`(() => {
        const menuBtn = document.querySelector('button[aria-label="Открыть меню"]') ||
                        document.querySelector('button[title*="Меню"]') ||
                        document.querySelector('button[aria-label="Настройки"]') ||
                        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Настройки'));
        if (menuBtn) menuBtn.click();
      })()`);
      await delay(800);
      await evaluate(`(() => {
        const profileBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Мой профиль') || b.textContent.includes('Профиль'));
        if (profileBtn) profileBtn.click();
      })()`);
      await delay(1000);
      await shot('07_app_profile_modal.png');
    } catch (e) {
      console.warn('Профиль:', e.message);
    }

    // 3. Мобильный вид (iPhone / Android)
    console.log('Снимаем мобильный вид (414x896)...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 414,
      height: 896,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send('Page.navigate', { url: APP });
    await delay(2500);
    await evaluate(`document.documentElement.classList.add('dark')`);
    await delay(300);
    await shot('08_app_mobile_chat.png');

    console.log('--- Все скриншоты успешно получены! ---');
    socket.close();
    chrome.kill();
  } finally {
    console.log('Останавливаем сервер стенда...');
    server.kill();
  }
}

main().catch(err => {
  console.error('Ошибка выполнения:', err);
  process.exit(1);
});
