/* global document, innerWidth */
// Visual smoke check with isolated browser fixtures; no real account/data writes.
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = process.env.PREVIEW_URL || 'https://26.236.251.44:3443';
await mkdir('runtime/design-preview', { recursive: true });
await page.goto(url);
await page.getByRole('button', { name: 'Войти в Yargram', exact: true }).waitFor();
await page.screenshot({ path: 'runtime/design-preview/login.png', fullPage: true });
const me = { id: 'preview-me', displayName: 'Александр', username: 'alex', email: 'preview@example.test' };
const peer = { id: 'preview-peer', displayName: 'Мария', username: 'maria', online: true };
const messages = [
  { id: 'm1', conversationId: 'preview-chat', senderId: peer.id, sender: peer, text: 'Привет! Как тебе обновлённый Yargram?', createdAt: new Date().toISOString(), readBy: [me.id, peer.id] },
  { id: 'm2', conversationId: 'preview-chat', senderId: me.id, sender: me, text: 'Мне нравится. Стало проще находить чаты и читать сообщения ✨', createdAt: new Date().toISOString(), readBy: [me.id, peer.id] },
  { id: 'm3', conversationId: 'preview-chat', senderId: peer.id, sender: peer, text: 'Давай вечером обсудим планы на выходные ☕', createdAt: new Date().toISOString(), readBy: [me.id] },
];
const conversation = { id: 'preview-chat', otherUser: peer, participants: [{ user: me }, { user: peer }], lastMessage: messages.at(-1), unreadCount: 2 };
await context.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  let body = {};
  if (path.endsWith('/auth/me')) body = { user: me };
  else if (path.endsWith('/conversations')) body = { conversations: [conversation] };
  else if (path.endsWith('/messages')) body = { messages };
  else if (path.endsWith('/read')) body = { receipt: { conversationId: conversation.id, userId: me.id, messageIds: [] } };
  else if (path.endsWith('/users/preview-peer')) body = { user: peer };
  else if (path.endsWith('/blocked')) body = { users: [] };
  return route.fulfill({ json: body });
});
await context.route('**/socket.io/**', route => route.abort());
await page.evaluate(() => { localStorage.setItem('yargram.accessToken', 'isolated-preview'); localStorage.setItem('yargram.theme', 'light'); });
await page.reload();
await page.getByRole('button').filter({ hasText: 'Мария' }).first().click();
await page.getByText(messages[0].text, { exact: true }).waitFor();
await page.screenshot({ path: 'runtime/design-preview/desktop-light.png', fullPage: true });
await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
await page.screenshot({ path: 'runtime/design-preview/desktop-dark.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'runtime/design-preview/mobile-chat.png', fullPage: true });
await page.getByRole('button', { name: 'Назад к диалогам' }).click();
await page.screenshot({ path: 'runtime/design-preview/mobile-list.png', fullPage: true });
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) errors.push('Mobile horizontal overflow');
await page.setViewportSize({ width: 1440, height: 960 });
await page.getByRole('button', { name: 'Меню профиля', exact: true }).click();
await page.getByRole('button', { name: 'Настройки', exact: true }).click();
await page.getByRole('button', { name: 'Приватность', exact: true }).click();
await page.getByRole('switch', { name: /Показывать время посещения/ }).waitFor();
await page.screenshot({ path: 'runtime/design-preview/settings-privacy.png', fullPage: true });
await page.getByRole('button', { name: 'Оформление', exact: true }).click();
await page.screenshot({ path: 'runtime/design-preview/settings-appearance.png', fullPage: true });
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log('Visual checks passed: login, desktop light/dark, mobile chat/list; no page errors.');
