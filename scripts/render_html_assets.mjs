import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9390;
const CHROME_PROFILE = path.resolve('runtime/screenshot-preview/chrome-profile-render');
const OUT_DIR = path.resolve('media/youtube');

async function main() {
  console.log('Запуск Chrome Headless для рендера ассетов...');
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

  const assets = [
    {
      file: 'avatar.html',
      width: 800,
      height: 800,
      scale: 1,
      out: 'channel_avatar_800x800.png'
    },
    {
      file: 'banner.html',
      width: 2560,
      height: 1440,
      scale: 1,
      out: 'channel_banner_2560x1440.png'
    },
    {
      file: 'thumbnail.html',
      width: 1280,
      height: 720,
      scale: 1,
      out: 'video_thumbnail_1280x720.png'
    }
  ];

  for (const item of assets) {
    const fullPath = path.resolve('media/youtube/templates', item.file).replace(/\\/g, '/');
    const fileUrl = `file:///${fullPath}`;
    console.log(`Рендер ${item.out} (${item.width}x${item.height})...`);

    await send('Emulation.setDeviceMetricsOverride', {
      width: item.width,
      height: item.height,
      deviceScaleFactor: item.scale,
      mobile: false,
    });

    await send('Page.navigate', { url: fileUrl });
    await delay(1200);

    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const outTarget = path.resolve(OUT_DIR, item.out);
    await writeFile(outTarget, Buffer.from(data, 'base64'));
    console.log(` -> Сохранено: ${outTarget}`);
  }

  socket.close();
  chrome.kill();
  console.log('Все статические ассеты успешно сгенерированы!');
}

main().catch(err => {
  console.error('Ошибка рендера:', err);
  process.exit(1);
});
