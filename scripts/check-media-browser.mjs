/* global MediaRecorder, document */
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  await page.goto(process.env.PREVIEW_URL || 'https://26.236.251.44:3443');
  const result = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = e => chunks.push(e.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start(250);
    await new Promise(resolve => setTimeout(resolve, 2200));
    recorder.stop(); await stopped;
    stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => { audio.onloadedmetadata = resolve; audio.onerror = reject; });
    const initialDuration = Number.isFinite(audio.duration) ? audio.duration : 'unknown';
    URL.revokeObjectURL(audio.src);
    return { bytes: blob.size, initialDuration, mimeType: recorder.mimeType, data: Array.from(new Uint8Array(await blob.arrayBuffer())) };
  });
  const me = { id: 'media-me', displayName: 'Проверка записи' };
  const peer = { id: 'media-peer', displayName: 'Тест медиа' };
  const attachment = { id: 'old-voice', kind: 'file', ownerId: peer.id, fileName: 'Голосовое сообщение.webm', mimeType: 'audio/webm', size: result.bytes, url: '/api/uploads/old-voice', createdAt: new Date().toISOString() };
  const message = { id: 'media-message', conversationId: 'media-chat', senderId: peer.id, text: '', attachments: [attachment], createdAt: new Date().toISOString() };
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/uploads/old-voice')) return route.fulfill({ body: Buffer.from(result.data), contentType: 'audio/webm' });
    const body = path.endsWith('/auth/me') ? { user: me } : path.endsWith('/conversations') ? { conversations: [{ id: 'media-chat', otherUser: peer, members: [me, peer], lastMessage: message }] } : path.endsWith('/messages') ? { messages: [message] } : path.endsWith('/read') ? { receipt: { conversationId: 'media-chat', userId: me.id, messageIds: [] } } : {};
    return route.fulfill({ json: body });
  });
  await context.route('**/socket.io/**', route => route.abort());
  await page.evaluate(() => localStorage.setItem('yargram.accessToken', 'isolated-media-preview'));
  await page.reload();
  await page.getByRole('button').filter({ hasText: 'Тест медиа' }).first().click();
  const slider = page.getByRole('slider', { name: 'Перемотка голосового сообщения' });
  await slider.waitFor().catch(async error => { console.log(await page.locator('body').innerText()); throw error; });
  await page.waitForFunction(() => Number(document.querySelector('input[aria-label="Перемотка голосового сообщения"]')?.max) > 1.5).catch(async error => { console.log(await page.locator('audio').evaluate(a => ({duration:a.duration,ready:a.readyState,src:a.currentSrc,error:a.error?.message}))); console.log(await slider.getAttribute('max')); throw error; });
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio');
    return audio && audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 1.5
      && audio.seekable.length > 0 && audio.seekable.end(audio.seekable.length - 1) > 1.5;
  });
  await slider.fill('1');
  await page.waitForFunction(() => !document.querySelector('audio')?.seeking);
  const seek = await page.locator('audio').evaluate(audio => ({ current: audio.currentTime, src: audio.currentSrc, duration: audio.duration, seekable: Array.from({ length: audio.seekable.length }, (_, i) => [audio.seekable.start(i), audio.seekable.end(i)]) }));
  console.log('afterSeek', JSON.stringify(seek));
  await page.getByRole('button', { name: 'Слушать голосовое сообщение' }).click();
  const playback = await page.locator('audio').evaluate(audio => ({ duration: audio.duration, current: audio.currentTime, source: audio.currentSrc, paused: audio.paused }));
  if (!Number.isFinite(playback.duration) || playback.duration < 1.5 || playback.current < 0.8 || playback.current > 1.8) throw new Error('Voice repair/seek failed: '+JSON.stringify(playback));
  console.log(JSON.stringify({ bytes: result.bytes, rawDuration: result.initialDuration, repairedDuration: playback.duration, seekPosition: playback.current, blobSource: playback.source.startsWith('blob:') }));
} finally { await browser.close(); }
