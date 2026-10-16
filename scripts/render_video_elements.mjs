import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9392;
const CHROME_PROFILE = path.resolve('runtime/screenshot-preview/chrome-profile-elem');
const OUT_DIR = path.resolve('media/youtube/elements');

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log('Запуск Chrome Headless для рендера элементов видео...');
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${CHROME_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) break;
    } catch {}
    await delay(300);
  }

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
      }, 20000);
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const fullPath = path.resolve('media/youtube/templates/video_elements.html').replace(/\\/g, '/');
  await send('Page.navigate', { url: `file:///${fullPath}` });
  await delay(1500);

  const elements = [
    { id: '#landing-wrap .desktop-mockup', out: 'mockup_landing.png' },
    { id: '#chat-wrap .desktop-mockup', out: 'mockup_chat.png' },
    { id: '#poll-wrap .desktop-mockup', out: 'mockup_poll.png' },
    { id: '#phone-wrap .phone-mockup', out: 'mockup_phone.png' },
  ];

  for (const el of elements) {
    const box = await send('Runtime.evaluate', {
      expression: `(() => {
        const node = document.querySelector(${JSON.stringify(el.id)});
        if (!node) return null;
        node.scrollIntoView({ block: 'center' });
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`,
      returnByValue: true
    });

    if (!box.result.value) {
      console.warn('Не найден элемент:', el.id);
      continue;
    }
    const rect = box.result.value;

    const clip = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      scale: 1,
    };

    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      clip,
    });

    const outPath = path.resolve(OUT_DIR, el.out);
    await writeFile(outPath, Buffer.from(data, 'base64'));
    console.log(`[Сохранён элемент]: ${outPath}`);
  }

  socket.close();
  chrome.kill();
  console.log('Элементы видео готовы!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
