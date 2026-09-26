/* global document */
// Isolated real-device-path recording checks. Every API/socket request is intercepted.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const playwrightPath = process.env.PLAYWRIGHT_MODULE || 'C:/Users/Top1Nuk1/AppData/Local/npm-cache/_npx/420ff84f11983ee5/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const baseURL = process.env.PREVIEW_URL || 'https://26.53.76.128:3443';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const results = [];
const me = { id: 'recording-me', displayName: 'Recording Tester', username: 'recorder' };
const peer = { id: 'recording-peer', displayName: 'Recording Fixture', username: 'fixture' };
const conversation = { id: 'recording-chat', otherUser: peer, participants: [{ user: me }, { user: peer }], unreadCount: 0 };

async function fixture(label) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block', permissions: ['microphone', 'camera'], bypassCSP: process.env.BYPASS_CSP === '1' });
  const uploads = [], messages = [], errors = [], unexpected = [];
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/socket.io')) return route.abort();
    if (url.pathname.startsWith('/recording-fixture-media/')) {
      const upload = uploads.find(item => url.pathname.endsWith(item.id));
      return upload ? route.fulfill({ body: upload.bytes, contentType: upload.mimeType }) : route.fulfill({ status: 404 });
    }
    if (!/^\/api(?:\/|$)/.test(url.pathname)) {
      if (request.method() !== 'GET' && request.method() !== 'HEAD') {
        unexpected.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    }
    try {
      let body;
      if (url.pathname === '/api/uploads' && request.method() === 'POST') {
        const form = await new Response(request.postDataBuffer(), { headers: { 'content-type': request.headers()['content-type'] } }).formData();
        const file = form.get('file');
        assert.ok(file && typeof file.arrayBuffer === 'function', 'Upload contains file');
        const upload = {
          id: `${label}-upload-${uploads.length + 1}`, kind: url.searchParams.get('kind'),
          mediaKind: url.searchParams.get('mediaKind'), durationSeconds: Number(url.searchParams.get('durationSeconds')),
          originalName: file.name, mimeType: file.type, size: file.size,
          bytes: Buffer.from(await file.arrayBuffer()),
        };
        upload.url = `${baseURL}/recording-fixture-media/${upload.id}`;
        uploads.push(upload);
        const { bytes, ...attachment } = upload;
        body = { attachment };
      } else if (url.pathname.endsWith('/messages') && request.method() === 'POST') {
        const input = request.postDataJSON();
        const attachments = input.attachmentIds.map(id => {
          const upload = uploads.find(item => item.id === id);
          assert.ok(upload, 'Message references mocked uploaded attachment');
          const { bytes, ...attachment } = upload;
          return attachment;
        });
        const message = { id: `${label}-message-${messages.length + 1}`, conversationId: conversation.id, senderId: me.id, sender: me, text: '', attachments, createdAt: new Date().toISOString(), readBy: [me.id] };
        messages.push(message);
        body = { message };
      } else if (url.pathname === '/api/auth/me') body = { user: me };
      else if (url.pathname === '/api/conversations') body = { conversations: [conversation] };
      else if (url.pathname.endsWith('/messages')) body = { messages };
      else if (url.pathname.endsWith('/read')) body = { receipt: { conversationId: conversation.id, userId: me.id, messageIds: [] } };
      else if (url.pathname.endsWith('/blocked')) body = { users: [] };
      else if (url.pathname === `/api/users/${peer.id}`) body = { user: peer };
      else {
        unexpected.push(`${request.method()} ${url.pathname}`);
        body = {};
      }
      return route.fulfill({ json: body });
    } catch (error) {
      errors.push(error.message);
      return route.fulfill({ status: 500, json: { message: error.message } });
    }
  });
  await context.addInitScript(() => {
    localStorage.setItem('yargram.accessToken', 'isolated-recording-fixture');
    localStorage.setItem('yargram.theme', 'light');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.getByRole('button').filter({ hasText: peer.displayName }).first().click();
  await page.getByRole('button', { name: 'Голосовое сообщение', exact: true }).waitFor();
  return { context, page, uploads, messages, errors, unexpected, label };
}

async function start(f, mode) {
  if (mode === 'video_circle') await f.page.getByRole('button', { name: 'Переключить на видеокружок', exact: true }).click();
  await f.page.getByRole('button', { name: mode === 'voice' ? 'Голосовое сообщение' : 'Записать видеокружок', exact: true }).click();
  await f.page.getByRole('button', { name: 'Остановить запись и отправить', exact: true }).waitFor();
  if (mode === 'video_circle') {
    const preview = f.page.getByLabel('Предпросмотр видеокружка', { exact: true });
    await preview.waitFor();
    await f.page.waitForFunction(() => {
      const video = document.querySelector('video[aria-label="Предпросмотр видеокружка"]');
      return video?.srcObject?.getVideoTracks().some(track => track.readyState === 'live') && video.videoWidth > 0;
    });
  }
}

async function verify(f, mode, minimum, maximum) {
  const deadline = Date.now() + 20000;
  while (!f.messages.length && Date.now() < deadline) await delay(100);
  assert.equal(f.uploads.length, 1, `${f.label}: exactly one upload`);
  assert.equal(f.messages.length, 1, `${f.label}: exactly one created message`);
  const upload = f.uploads[0];
  assert.equal(upload.kind, 'file');
  assert.equal(upload.mediaKind, mode);
  assert.ok(Number.isFinite(upload.durationSeconds) && upload.durationSeconds >= minimum && upload.durationSeconds <= maximum, `${f.label}: duration ${upload.durationSeconds}`);
  assert.match(upload.originalName, upload.mimeType.includes('mp4') ? /\.mp4$/ : /\.webm$/);
  assert.match(upload.mimeType, mode === 'voice' ? /^audio\// : /^video\//);
  assert.ok(upload.size > 0);
  const mediaDuration = await f.page.evaluate(({ url, mode }) => new Promise((resolve, reject) => {
    const media = document.createElement(mode === 'voice' ? 'audio' : 'video');
    const timer = setTimeout(() => reject(new Error('Media metadata timed out')), 10000);
    media.onloadedmetadata = () => { clearTimeout(timer); resolve(media.duration); media.removeAttribute('src'); media.load(); };
    media.onerror = () => { clearTimeout(timer); reject(new Error('Recorded media failed to load')); };
    media.src = url;
  }), { url: upload.url, mode });
  assert.ok(Number.isFinite(mediaDuration) && mediaDuration > 0, `${f.label}: embedded media duration ${mediaDuration}`);
  assert.ok(Math.abs(mediaDuration - upload.durationSeconds) < 1, 'Embedded duration agrees with upload metadata');
  assert.deepEqual(f.errors, [], `${f.label}: page/route errors`);
  assert.deepEqual(f.unexpected, [], `${f.label}: unrecognized mocked requests`);
  const result = { case: f.label, mediaKind: mode, durationSeconds: upload.durationSeconds, mediaDuration, filename: upload.originalName, bytes: upload.size, messages: f.messages.length };
  results.push(result);
  console.log('PASS', JSON.stringify(result));
}

try {
  const short = async mode => {
    const f = await fixture(`manual-${mode}`);
    try {
      await start(f, mode);
      await delay(1600);
      await f.page.getByRole('button', { name: 'Остановить запись и отправить', exact: true }).click();
      await verify(f, mode, 1, mode === 'voice' ? 15 : 60);
    } finally { await f.context.close(); }
  };
  await Promise.all([short('voice'), short('video_circle')]);
  const voice = await fixture('voice-beyond-60');
  const circle = await fixture('circle-auto-stop');
  await Promise.all([start(voice, 'voice'), start(circle, 'video_circle')]);
  console.log('Real 61.5-second simultaneous recording checks started (separate contexts).');
  await delay(61500);
  assert.equal(await voice.page.getByRole('button', { name: 'Остановить запись и отправить', exact: true }).isVisible(), true, 'Voice remains recording beyond 60 seconds');
  assert.equal(voice.uploads.length, 0, 'Voice has not automatically uploaded');
  assert.equal(voice.messages.length, 0, 'Voice has not automatically sent');
  assert.equal(await circle.page.getByRole('button', { name: 'Остановить запись и отправить', exact: true }).isVisible(), false, 'Circle automatically stopped');
  await voice.page.getByRole('button', { name: 'Остановить запись и отправить', exact: true }).click();
  await Promise.all([verify(voice, 'voice', 60.001, 90), verify(circle, 'video_circle', 59, 60)]);
  console.log(JSON.stringify({ passed: results.length, baseURL, bypassCSP: process.env.BYPASS_CSP === '1', results }, null, 2));
} finally {
  await browser.close();
}
