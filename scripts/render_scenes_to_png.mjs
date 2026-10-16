import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9394;
const CHROME_PROFILE = path.resolve('runtime/screenshot-preview/chrome-profile-scenes');
const SCENES_DIR = path.resolve('media/youtube/scenes');

async function main() {
  console.log('Запуск Chrome Headless для рендера master-кадров 1080p...');
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
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const scenes = [
    { html: 'scene1_intro.html', out: 's1_intro.png' },
    { html: 'scene2_landing.html', out: 's2_landing.png' },
    { html: 'scene3_chat.html', out: 's3_chat.png' },
    { html: 'scene4_poll.html', out: 's4_poll.png' },
    { html: 'scene5_responsive.html', out: 's5_responsive.png' },
    { html: 'scene6_outro.html', out: 's6_outro.png' },
  ];

  for (const s of scenes) {
    const fullPath = path.resolve(SCENES_DIR, s.html).replace(/\\/g, '/');
    console.log(`Рендер сцены ${s.out}...`);
    await send('Page.navigate', { url: `file:///${fullPath}` });
    await delay(1200);

    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const outTarget = path.resolve(SCENES_DIR, s.out);
    await writeFile(outTarget, Buffer.from(data, 'base64'));
    console.log(` -> Сохранено: ${outTarget}`);
  }

  socket.close();
  chrome.kill();
  console.log('Все 6 master-кадров успешно отрендерены!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
