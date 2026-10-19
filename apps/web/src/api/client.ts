import type {
  AdminAccount,
  AdminAccountsFilter,
  AdminAccountsMark,
  AdminAccountsScope,
  AdminGroup,
  AdminStats,
  Attachment,
  AttachmentKind,
  AuthResult,
  EmailCodeChallenge,
  EmailCodePurpose,
  ChatFolder,
  Conversation,
  ConversationDraft,
  GroupEvent,
  GroupMember,
  GroupPermissions,
  LoginInput,
  Message,
  PaginatedItems,
  PollSettings,
  RegisterInput,
  ReadReceipt,
  ReportReason,
  ScheduledMessage,
  UpdateProfileInput,
  FavoriteNote,
  User,
  MediaSummary,
  FriendshipState,
  FriendsOverview,
  SessionOverview,
  StickerPack,
} from '../types';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: unknown;
}

interface RawAuthResult {
  accessToken?: string;
  token?: string;
  user?: User;
}

interface RawCollection<T> {
  items?: T[];
  users?: T[];
  conversations?: T[];
  messages?: T[];
  packs?: T[];
  gifs?: T[];
  nextCursor?: string | null;
}

interface RawConversationResult extends Partial<Conversation> {
  conversation?: Conversation;
  created?: boolean;
}

interface RawMessageResult extends Partial<Message> {
  message?: Message;
}

interface RawAttachmentResult extends Partial<Attachment> {
  attachment?: Attachment;
}

interface SendMessageInput {
  text?: string;
  attachmentIds?: string[];
  replyToId?: string;
  forwardedFromId?: string;
  /** Присланный набор: сообщение идёт без текста и файлов. */
  stickerPackId?: string;
  /**
   * 🔥 Отправляемые стикеры — именно id, а не файлы. Встроенные стикеры вовсе
   * не лежат на сервере как вложения (это файлы сборки), а пользовательский
   * файл может быть удалён вместе со стикером; готовые адреса сервер собирает
   * заново при каждой отдаче сообщения.
   */
  stickerIds?: string[];
}

export interface UploadOptions {
  mediaKind?: 'voice' | 'video_circle' | 'gif';
  durationSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

interface RawReceiptResult {
  receipt: ReadReceipt;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => undefined);
  }

  const text = await response.text();
  return text || undefined;
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object') {
    const object = payload as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail']) {
      if (typeof object[key] === 'string' && object[key]) return object[key];
      const nested = object[key];
      if (nested && typeof nested === 'object') {
        const nestedMessage = (nested as Record<string, unknown>).message;
        if (typeof nestedMessage === 'string' && nestedMessage) return nestedMessage;
      }
    }
  }
  return fallback;
}

const DEVICE_ID_KEY = 'yargram.device_id';
const DEVICE_NAME_KEY = 'yargram.device_name';

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'browser-device';
  }
}

export function getStoredDeviceName(): string | null {
  try {
    return localStorage.getItem(DEVICE_NAME_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredDeviceName(name: string | null): void {
  try {
    if (name && name.trim()) {
      localStorage.setItem(DEVICE_NAME_KEY, name.trim());
    } else {
      localStorage.removeItem(DEVICE_NAME_KEY);
    }
  } catch {}
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const deviceId = getOrCreateDeviceId();
  headers.set('X-Device-Id', deviceId);
  const deviceName = getStoredDeviceName();
  if (deviceName) {
    headers.set('X-Device-Name', encodeURIComponent(deviceName));
  }
  headers.set('Cache-Control', 'no-cache, no-store');
  headers.set('Pragma', 'no-cache');

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      cache: options.cache ?? 'no-store',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Не удалось связаться с сервером. Проверьте подключение.', 0, error);
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, `Ошибка сервера (${response.status})`), response.status, payload);
  }

  return payload as T;
}

function uploadForm<T>(
  path: string,
  token: string,
  fieldName: string,
  file: File,
  options: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append(fieldName, file, file.name);

    const abort = () => xhr.abort();
    options.signal?.addEventListener('abort', abort, { once: true });

    xhr.open('POST', path);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    xhr.addEventListener('load', () => {
      options.signal?.removeEventListener('abort', abort);
      let payload: unknown;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        payload = xhr.responseText || undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100);
        resolve(payload as T);
        return;
      }
      reject(new ApiError(errorMessage(payload, `Ошибка загрузки (${xhr.status})`), xhr.status, payload));
    });
    xhr.addEventListener('error', () => {
      options.signal?.removeEventListener('abort', abort);
      reject(new ApiError('Не удалось загрузить файл. Проверьте подключение.', 0));
    });
    xhr.addEventListener('abort', () => {
      options.signal?.removeEventListener('abort', abort);
      reject(new DOMException('Загрузка отменена.', 'AbortError'));
    });
    xhr.send(form);
  });
}

function toAuthResult(result: RawAuthResult): AuthResult {
  const accessToken = result.accessToken ?? result.token;
  if (!accessToken) throw new ApiError('Сервер не вернул токен доступа.', 500, result);
  return { accessToken, user: result.user };
}

/**
 * Вход и регистрация отвечают либо токеном, либо требованием кода из письма —
 * это зависит от настройки `EMAIL_CONFIRMATION` на сервере, поэтому клиент
 * обязан уметь и то, и другое.
 */
async function authenticate(
  path: string,
  input: LoginInput | RegisterInput,
): Promise<AuthResult | EmailCodeChallenge> {
  const result = await request<RawAuthResult & Partial<EmailCodeChallenge>>(path, {
    method: 'POST',
    body: input,
  });
  if (result.status === 'code_sent') {
    return {
      status: 'code_sent',
      email: result.email ?? '',
      purpose: result.purpose ?? 'login',
      expiresInSeconds: result.expiresInSeconds ?? 600,
    };
  }
  return toAuthResult(result);
}

const EMPTY_MEDIA_SUMMARY: MediaSummary = {
  photos: 0,
  videos: 0,
  files: 0,
  audio: 0,
  voice: 0,
  videoCircles: 0,
  gifs: 0,
  links: 0,
};

export const api = {
  register(input: RegisterInput) {
    return authenticate('/api/auth/register', input);
  },

  login(input: LoginInput) {
    return authenticate('/api/auth/login', input);
  },

  /** Код из письма принят — сервер выдаёт токен. */
  confirmCode(input: { email: string; code: string; purpose: EmailCodePurpose }) {
    return request<RawAuthResult>('/api/auth/confirm-code', { method: 'POST', body: input }).then(toAuthResult);
  },

  /** Повторная отправка: прежний код сгорает, действует свежий. */
  resendCode(input: { email: string; purpose: EmailCodePurpose }) {
    return request<EmailCodeChallenge>('/api/auth/resend-code', { method: 'POST', body: input });
  },

  requestPasswordReset(email: string) {
    return request<EmailCodeChallenge>('/api/auth/reset-password/request', {
      method: 'POST',
      body: { email },
    });
  },

  resetPassword(input: { email: string; code: string; password: string }) {
    return request<RawAuthResult>('/api/auth/reset-password/confirm', { method: 'POST', body: input }).then(
      toAuthResult,
    );
  },

  me(token: string, signal?: AbortSignal) {
    return request<User | { user: User }>('/api/auth/me', { token, signal }).then((result) =>
      'user' in result ? result.user : result,
    );
  },

  updateProfile(token: string, input: UpdateProfileInput) {
    return request<User | { user: User }>('/api/users/me', {
      method: 'PATCH',
      token,
      body: input,
    }).then((result) => ('user' in result ? result.user : result));
  },

  users(token: string, query: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ q: query, limit: '20' });
    return request<RawCollection<User>>(`/api/users?${params}`, { token, signal }).then(
      (result): PaginatedItems<User> => ({ items: result.users ?? result.items ?? [] }),
    );
  },

  user(token: string, userId: string, signal?: AbortSignal) {
    return request<User | { user: User }>(`/api/users/${encodeURIComponent(userId)}`, {
      token,
      signal,
    }).then((result) => ('user' in result ? result.user : result));
  },

  /** Сколько чего лежит в переписке — чтобы профиль показывал только непустые разделы медиа. */
  mediaSummary(token: string, userId: string, signal?: AbortSignal) {
    return request<{ summary?: MediaSummary }>(
      `/api/users/${encodeURIComponent(userId)}/media-summary`,
      { token, signal },
    ).then((result) => result.summary ?? EMPTY_MEDIA_SUMMARY);
  },

  upload(token: string, file: File, kind: Exclude<AttachmentKind, 'avatar'>, options?: UploadOptions) {
    const params = new URLSearchParams({ kind });
    if (options?.mediaKind) params.set('mediaKind', options.mediaKind);
    if (options?.durationSeconds !== undefined) params.set('durationSeconds', String(options.durationSeconds));
    return uploadForm<RawAttachmentResult>(`/api/uploads?${params}`, token, 'file', file, options).then(
      (result) => result.attachment ?? (result as Attachment),
    );
  },

  updateAvatar(token: string, file: File, options?: UploadOptions) {
    return uploadForm<User | { user: User }>('/api/users/me/avatar', token, 'avatar', file, options).then(
      (result) => ('user' in result ? result.user : result),
    );
  },

  deleteAvatar(token: string) {
    return request<User | { user: User }>('/api/users/me/avatar', {
      method: 'DELETE',
      token,
    }).then((result) => ('user' in result ? result.user : result));
  },

  updateBanner(token: string, file: File, options?: UploadOptions) {
    return uploadForm<User | { user: User }>('/api/users/me/banner', token, 'banner', file, options).then(
      (result) => ('user' in result ? result.user : result),
    );
  },

  deleteBanner(token: string) {
    return request<User | { user: User }>('/api/users/me/banner', {
      method: 'DELETE',
      token,
    }).then((result) => ('user' in result ? result.user : result));
  },

  conversations(token: string, signal?: AbortSignal) {
    return request<RawCollection<Conversation>>('/api/conversations', { token, signal }).then(
      (result): PaginatedItems<Conversation> => ({ items: result.conversations ?? result.items ?? [] }),
    );
  },

  savedConversation(token: string) {
    return request<{ conversation: Conversation; created: boolean }>('/api/conversations/saved', {
      method: 'POST', token,
    }).then((result) => result.conversation);
  },

  createDirect(token: string, userId: string) {
    return request<RawConversationResult>('/api/conversations/direct', {
      method: 'POST',
      token,
      body: { userId },
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  // ---- Поддержка ----
  //
  // Кнопки бота уходят кодом действия, а не сообщением: в истории не остаётся
  // служебных «нажатий», а сам человек видит только осмысленную переписку.

  /** Открыть переписку с ботом поддержки: сервер создаёт её и показывает меню. */
  openSupport(token: string) {
    return request<RawConversationResult>('/api/support', { token }).then(
      (result) => result.conversation ?? (result as Conversation),
    );
  },

  /** Нажатие кнопки бота. */
  sendSupportAction(token: string, conversationId: string, action: string) {
    return request<{ ok: boolean }>('/api/support/actions', {
      method: 'POST',
      token,
      body: { conversationId, action },
    });
  },

  // ---- Группы ----

  createGroup(
    token: string,
    input: { title: string; description?: string; avatarUrl?: string | null; memberIds?: string[] },
  ) {
    return request<RawConversationResult>('/api/groups', { method: 'POST', token, body: input }).then(
      (result) => result.conversation ?? (result as Conversation),
    );
  },

  joinGroup(token: string, code: string) {
    return request<RawConversationResult>('/api/groups/join', {
      method: 'POST',
      token,
      body: { code },
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  groupMembers(token: string, groupId: string, query?: string, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (query?.trim()) params.set('q', query.trim());
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{ members?: GroupMember[] }>(
      `/api/groups/${encodeURIComponent(groupId)}/members${suffix}`,
      { token, signal },
    ).then((result): GroupMember[] => result.members ?? []);
  },

  groupHistory(token: string, groupId: string, signal?: AbortSignal) {
    return request<{ events?: GroupEvent[] }>(
      `/api/groups/${encodeURIComponent(groupId)}/history`,
      { token, signal },
    ).then((result): GroupEvent[] => result.events ?? []);
  },

  updateGroup(
    token: string,
    groupId: string,
    input: { title?: string; description?: string; avatarUrl?: string | null },
  ) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}`, {
      method: 'PATCH',
      token,
      body: input,
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  addGroupMembers(token: string, groupId: string, userIds: string[]) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}/members`, {
      method: 'POST',
      token,
      body: { userIds },
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  removeGroupMember(token: string, groupId: string, userId: string) {
    return request<RawConversationResult>(
      `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE', token },
    ).then((result) => result.conversation ?? (result as Conversation));
  },

  leaveGroup(token: string, groupId: string) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}/leave`, {
      method: 'POST',
      token,
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  setGroupAdmin(
    token: string,
    groupId: string,
    userId: string,
    admin: boolean,
    permissions?: GroupPermissions,
  ) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}/admins`, {
      method: 'POST',
      token,
      body: { userId, admin, ...(permissions ? { permissions } : {}) },
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  setGroupPermissions(token: string, groupId: string, permissions: GroupPermissions) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}/permissions`, {
      method: 'PUT',
      token,
      body: { permissions },
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  restrictGroupMember(
    token: string,
    groupId: string,
    userId: string,
    input: { permissions?: GroupPermissions; mutedUntil?: string | null },
  ) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}/restrict`, {
      method: 'POST',
      token,
      body: { userId, ...input },
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  createPoll(
    token: string,
    conversationId: string,
    body: {
      question: string;
      description?: string;
      options: string[];
      settings?: Partial<PollSettings>;
    },
  ) {
    return request<{ message: Message }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/polls`,
      { method: 'POST', token, body },
    ).then((result) => result.message as unknown as Message);
  },

  votePoll(token: string, messageId: string, optionIds: string[]) {
    return request<{ message: Message }>(
      `/api/messages/${encodeURIComponent(messageId)}/poll/vote`,
      { method: 'POST', token, body: { optionIds } },
    ).then((result) => result.message as unknown as Message);
  },

  addPollOption(token: string, messageId: string, text: string) {
    return request<{ message: Message }>(
      `/api/messages/${encodeURIComponent(messageId)}/poll/options`,
      { method: 'POST', token, body: { text } },
    ).then((result) => result.message as unknown as Message);
  },

  closePoll(token: string, messageId: string) {
    return request<{ message: Message }>(
      `/api/messages/${encodeURIComponent(messageId)}/poll/close`,
      { method: 'POST', token },
    ).then((result) => result.message as unknown as Message);
  },

  setGroupMemberTag(token: string, groupId: string, userId: string, tag: string) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}/tag`, {
      method: 'PUT',
      token,
      body: { userId, tag },
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  regenerateGroupInvite(token: string, groupId: string) {
    return request<RawConversationResult>(`/api/groups/${encodeURIComponent(groupId)}/invite`, {
      method: 'POST',
      token,
    }).then((result) => result.conversation ?? (result as Conversation));
  },

  messages(token: string, conversationId: string, signal?: AbortSignal) {
    return request<RawCollection<Message>>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      { token, signal },
    ).then((result): PaginatedItems<Message> => ({ items: result.messages ?? result.items ?? [] }));
  },

  searchMessages(token: string, conversationId: string, query: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ q: query });
    return request<RawCollection<Message>>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages?${params}`,
      { token, signal },
    ).then((result): PaginatedItems<Message> => ({ items: result.messages ?? result.items ?? [] }));
  },

  sendMessage(token: string, conversationId: string, text: string, replyToId?: string) {
    return request<RawMessageResult>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      token,
      body: { text, ...(replyToId ? { replyToId } : {}) },
    }).then((result) => result.message ?? (result as Message));
  },

  sendRichMessage(token: string, conversationId: string, input: SendMessageInput) {
    return request<RawMessageResult>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      token,
      body: input,
    }).then((result) => result.message ?? (result as Message));
  },

  markRead(token: string, conversationId: string) {
    return request<RawReceiptResult>(
      `/api/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'POST', token },
    ).then((result) => result.receipt);
  },

  editMessage(token: string, conversationId: string, messageId: string, text: string) {
    return request<RawMessageResult>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'PATCH', token, body: { text } },
    ).then((result) => result.message ?? (result as Message));
  },

  deleteMessage(token: string, conversationId: string, messageId: string) {
    return request<{ messageId: string; conversation: Conversation }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
      { method: 'DELETE', token },
    );
  },

  pinMessage(token: string, conversationId: string, messageId: string) {
    return request<{ pinnedMessage: Message }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/pin`,
      { method: 'PUT', token, body: { messageId } },
    ).then((result) => result.pinnedMessage);
  },

  unpinMessage(token: string, conversationId: string) {
    return request<{ pinnedMessage: null }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/pin`,
      { method: 'DELETE', token },
    );
  },

  pinMessageV2(token: string, conversationId: string, messageId: string) {
    return request<{ pinnedMessages?: Message[]; conversation?: Conversation }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/pins/${encodeURIComponent(messageId)}`,
      { method: 'PUT', token },
    );
  },

  unpinMessageV2(token: string, conversationId: string, messageId: string) {
    return request<{ pinnedMessages?: Message[]; conversation?: Conversation }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/pins/${encodeURIComponent(messageId)}`,
      { method: 'DELETE', token },
    );
  },

  setReaction(token: string, conversationId: string, messageId: string, emoji: string) {
    return request<RawMessageResult>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: 'POST', token, body: { emoji } },
    ).then((result) => result.message ?? (result as Message));
  },

  removeReaction(token: string, conversationId: string, messageId: string) {
    return request<RawMessageResult>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      { method: 'DELETE', token },
    ).then((result) => result.message ?? (result as Message));
  },

  addFavorite(token: string, conversationId: string, messageId: string) {
    return request<RawMessageResult>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/favorite`,
      { method: 'PUT', token },
    ).then((result) => result.message ?? (result as Message));
  },

  removeFavorite(token: string, conversationId: string, messageId: string) {
    return request<RawMessageResult>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/favorite`,
      { method: 'DELETE', token },
    ).then((result) => result.message ?? (result as Message));
  },

  favorites(token: string, signal?: AbortSignal) {
    return request<RawCollection<Message>>('/api/favorites', { token, signal }).then(
      (result): PaginatedItems<Message> => ({ items: result.messages ?? result.items ?? [] }),
    );
  },

  getNotes(token: string, signal?: AbortSignal) {
    return request<RawCollection<FavoriteNote>>('/api/favorites/notes', { token, signal }).then(
      (result): PaginatedItems<FavoriteNote> => ({ items: result.items ?? [] }),
    );
  },
  addNote(token: string, content: string) {
    return request<{ note: FavoriteNote }>('/api/favorites/notes', {
      method: 'POST',
      token,
      body: { content },
    }).then((result) => result.note);
  },
  updateNote(token: string, noteId: string, content: string) {
    return request<{ note: FavoriteNote }>(`/api/favorites/notes/${encodeURIComponent(noteId)}`,
      { method: 'PUT', token, body: { content } }).then((result) => result.note);
  },
  deleteNote(token: string, noteId: string) {
    return request<void>(`/api/favorites/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE', token });
  },



  forwardMessage(token: string, conversationId: string, messageId: string, targetConversationId: string) {
    return request<RawMessageResult>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/forward`,
      { method: 'POST', token, body: { targetConversationId } },
    ).then((result) => result.message ?? (result as Message));
  },

  // Drafts
  drafts(token: string, signal?: AbortSignal) {
    return request<{ drafts?: ConversationDraft[] }>('/api/drafts', { token, signal }).then(
      (result): ConversationDraft[] => result.drafts ?? [],
    );
  },
  saveDraft(token: string, conversationId: string, input: { text: string; attachmentIds?: string[]; replyToId?: string | null }) {
    return request<{ draft: ConversationDraft | null }>(`/api/drafts/${encodeURIComponent(conversationId)}`, {
      method: 'PUT', token, body: input,
    }).then((result) => result.draft);
  },
  clearDraft(token: string, conversationId: string) {
    return request<void>(`/api/drafts/${encodeURIComponent(conversationId)}`, { method: 'DELETE', token });
  },

  // Folders
  folders(token: string, signal?: AbortSignal) {
    return request<{ folders?: ChatFolder[] }>('/api/folders', { token, signal }).then(
      (result): ChatFolder[] => result.folders ?? [],
    );
  },
  createFolder(token: string, input: { name: string; conversationIds?: string[]; icon?: string | null }) {
    return request<{ folder: ChatFolder }>('/api/folders', { method: 'POST', token, body: input })
      .then((result) => result.folder);
  },
  updateFolder(token: string, folderId: string, input: { name?: string; position?: number; conversationIds?: string[]; icon?: string | null }) {
    return request<{ folder: ChatFolder }>(`/api/folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', token, body: input })
      .then((result) => result.folder);
  },
  deleteFolder(token: string, folderId: string) {
    return request<void>(`/api/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE', token });
  },

  // Scheduled messages
  scheduledMessages(token: string, signal?: AbortSignal) {
    return request<{ scheduled?: ScheduledMessage[] }>('/api/scheduled', { token, signal }).then(
      (result): ScheduledMessage[] => result.scheduled ?? [],
    );
  },
  scheduleMessage(token: string, conversationId: string, input: { text?: string; attachmentIds?: string[]; replyToId?: string; sendAt: string }) {
    return request<{ scheduled: ScheduledMessage }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/scheduled`,
      { method: 'POST', token, body: input },
    ).then((result) => result.scheduled);
  },
  updateScheduledMessage(token: string, scheduledId: string, input: { text?: string; attachmentIds?: string[]; sendAt?: string }) {
    return request<{ scheduled: ScheduledMessage }>(`/api/scheduled/${encodeURIComponent(scheduledId)}`, { method: 'PATCH', token, body: input })
      .then((result) => result.scheduled);
  },
  cancelScheduledMessage(token: string, scheduledId: string) {
    return request<{ scheduled: ScheduledMessage }>(`/api/scheduled/${encodeURIComponent(scheduledId)}`, { method: 'DELETE', token })
      .then((result) => result.scheduled);
  },

  updateConversationSettings(
    token: string,
    conversationId: string,
    input: { archived?: boolean; mutedUntil?: string | null },
  ) {
    return request<Conversation | { conversation: Conversation }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/settings`,
      { method: 'PATCH', token, body: input },
    ).then((result) => ('conversation' in result ? result.conversation : result));
  },

  blockUser(token: string, userId: string) {
    return request<{ blocked?: boolean; user?: User }>(`/api/users/${encodeURIComponent(userId)}/block`, {
      method: 'PUT',
      token,
    });
  },

  unblockUser(token: string, userId: string) {
    return request<{ blocked?: boolean; user?: User }>(`/api/users/${encodeURIComponent(userId)}/block`, {
      method: 'DELETE',
      token,
    });
  },

  /** Друзья, входящие и исходящие заявки — одним запросом для экрана «Друзья». */
  friends(token: string, signal?: AbortSignal) {
    return request<FriendsOverview>('/api/friends', { token, signal });
  },

  /** Заявка в друзья. Взаимная заявка сразу делает людей друзьями. */
  addFriend(token: string, userId: string) {
    return request<{ state: FriendshipState }>(`/api/friends/${encodeURIComponent(userId)}`, {
      method: 'POST',
      token,
    }).then((result) => result.state);
  },

  acceptFriend(token: string, userId: string) {
    return request<{ state: FriendshipState }>(`/api/friends/${encodeURIComponent(userId)}/accept`, {
      method: 'POST',
      token,
    }).then((result) => result.state);
  },

  declineFriend(token: string, userId: string) {
    return request<{ state: FriendshipState }>(`/api/friends/${encodeURIComponent(userId)}/decline`, {
      method: 'POST',
      token,
    }).then((result) => result.state);
  },

  /** Удаление из друзей. Заодно снимаются неотвеченные заявки в обе стороны. */
  removeFriend(token: string, userId: string) {
    return request<{ state: FriendshipState }>(`/api/friends/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      token,
    }).then((result) => result.state);
  },

  /** Активные сеансы: откуда и чем человек заходил в аккаунт. */
  sessions(token: string, signal?: AbortSignal) {
    return request<SessionOverview>('/api/sessions', { token, signal });
  },

  /** Вход с нового сайта подтверждён: «это был я». */
  acknowledgeSession(token: string, sessionId: string) {
    return request<SessionOverview>(`/api/sessions/${encodeURIComponent(sessionId)}/acknowledge`, {
      method: 'POST',
      token,
    });
  },

  /** Переименовать устройство/сеанс. */
  renameSession(token: string, sessionId: string, name: string) {
    return request<SessionOverview>(`/api/sessions/${encodeURIComponent(sessionId)}/rename`, {
      method: 'PATCH',
      token,
      body: { name },
    });
  },

  /** Завершить один сеанс. Свой — всегда, чужой — через сутки после входа. */
  terminateSession(token: string, sessionId: string) {
    return request<SessionOverview>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      token,
    });
  },

  /** Завершить все сеансы, кроме текущего. */
  terminateOtherSessions(token: string) {
    return request<SessionOverview>('/api/sessions', { method: 'DELETE', token });
  },

  /**
   * Знак «Yargram» на своём аккаунте приложения. Сервер пропускает только
   * аккаунт, помеченный приложением владельцем; остальным отвечает отказом.
   */
  setAppBadge(token: string, badge: 'yargram' | null) {
    return request<User | { user: User }>('/api/app/badge', {
      method: 'POST',
      token,
      body: { badge },
    }).then((result) => ('user' in result ? result.user : result));
  },

  /** Владелец помечает аккаунт приложением или снимает пометку. */
  /**
   * Точный поиск аккаунта для админ-панели по основному или доп. нику.
   * В отличие от `users()`, не исключает самого ищущего, поэтому владелец
   * может найти здесь свой же аккаунт.
   */
  adminLookup(token: string, handle: string, signal?: AbortSignal) {
    return request<{ user: User | null }>('/api/admin/lookup', {
      method: 'POST',
      token,
      body: { handle },
      signal,
    }).then((result) => result.user);
  },

  adminSetApp(token: string, userId: string, isApp: boolean) {    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/app`, {
      method: 'POST',
      token,
      body: { isApp },
    }).then((result) => ('user' in result ? result.user : result));
  },

  adminGrant(token: string, userId: string, input: { targetUserId?: string; targetUsername?: string; isVerified?: boolean; badge?: 'yargram' | null; usernames?: string[]; adminUserIds?: string[] }) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/grant`, {
      method: 'POST', token, body: input,
    }).then((result) => ('user' in result ? result.user : result));
  },

  /** Заморозка/разморозка аккаунта — только владелец. */
  adminFreeze(token: string, userId: string, frozen: boolean) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/freeze`, {
      method: 'POST', token, body: { frozen },
    }).then((result) => ('user' in result ? result.user : result));
  },

  /**
   * Отметка SCAM — только владелец. Пока она стоит, рядом с именем горит
   * красная рамка, а описание заменяется предупреждением о мошенничестве.
   */
  adminSetScam(token: string, userId: string, scam: boolean) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/scam`, {
      method: 'POST', token, body: { scam },
    }).then((result) => ('user' in result ? result.user : result));
  },

  /**
   * Отметка FAKE — тоже только владелец. Механика та же, что у SCAM, но рамка
   * рядом с именем говорит о подделке под официальный аккаунт.
   */
  adminSetFake(token: string, userId: string, fake: boolean) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/fake`, {
      method: 'POST', token, body: { fake },
    }).then((result) => ('user' in result ? result.user : result));
  },

  /**
   * Список служебных ботов — только владелец. Отдельно от `adminAccounts`:
   * там список обзорный и отфильтрованный вручную, а ботов на установке
   * единицы, и нужен именно их перечень целиком.
   */
  adminBots(token: string) {
    return request<{ accounts: AdminAccount[] }>('/api/admin/bots', { token }).then(
      (result): AdminAccount[] => result.accounts ?? [],
    );
  },

  /**
   * Метка «BOT»: служебный аккаунт, в который нельзя войти. Ставится и
   * снимается владельцем.
   */
  adminSetBot(token: string, userId: string, isBot: boolean) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/bot`, {
      method: 'POST', token, body: { isBot },
    }).then((result) => ('user' in result ? result.user : result));
  },

  /**
   * Сводка по всей установке — только владелец: сколько всего аккаунтов и
   * групп. По спискам этого не узнать: поиск по людям ограничен подстрокой и
   * пределом выдачи, а в беседах каждая группа считается отдельной записью.
   */
  adminStats(token: string) {
    return request<{ stats: AdminStats }>('/api/admin/stats', { token }).then(
      (result) => result.stats,
    );
  },

  /**
   * Список аккаунтов для админ-панели — только владелец. Отдельно от
   * `users()`: там поиск по людям, который исключает самого ищущего и не
   * отдаёт удалённых, а владельцу нужны и они.
   */
  adminAccounts(
    token: string,
    query: string,
    filter: AdminAccountsFilter,
    marks: AdminAccountsMark[] = [],
    scope: AdminAccountsScope = 'any',
  ) {
    const params = new URLSearchParams({ q: query, filter, marks: marks.join(','), scope });
    return request<{ accounts: AdminAccount[] }>(`/api/admin/accounts?${params}`, { token }).then(
      (result): AdminAccount[] => result.accounts ?? [],
    );
  },

  /**
   * Поиск групп для админ-панели — только владелец. Владелец Yargram помечает
   * саму группу, поэтому её ищут по названию, коду ссылки-приглашения или id.
   */
  adminSearchGroups(token: string, query: string) {
    const params = new URLSearchParams({ q: query });
    return request<{ groups: AdminGroup[] }>(`/api/admin/groups?${params}`, { token }).then(
      (result): AdminGroup[] => result.groups ?? [],
    );
  },

  /**
   * Знаки группы: галочка, значок Yargram и отметка SCAM. Пока стоит отметка,
   * рядом с названием горит красная рамка, а описание группы заменяется
   * предупреждением о мошенничестве.
   */
  adminSetGroupMarks(
    token: string,
    groupId: string,
    input: { isVerified?: boolean; badge?: 'yargram' | null; scam?: boolean },
  ) {
    return request<{ group: AdminGroup }>(`/api/admin/groups/${encodeURIComponent(groupId)}/marks`, {
      method: 'POST', token, body: input,
    }).then((result) => result.group);
  },

  /**
   * Удаление аккаунта — только владелец. История переписки остаётся у
   * собеседников, сам аккаунт помечается удалённым (почта остаётся занятой).
   */
  adminDeleteUser(token: string, userId: string) {
    return request<{ ok?: boolean }>(`/api/admin/${encodeURIComponent(userId)}`, {
      method: 'DELETE', token,
    }).then(() => true);
  },

  /** Возврат («разбан») удалённого аккаунта — только владелец. */
  adminRestoreUser(token: string, userId: string) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/restore`, {
      method: 'POST', token, body: {},
    }).then((result) => ('user' in result ? result.user : result));
  },

  adminList(token: string) {
    return request<{ users: User[] }>('/api/admin/users', { token }).then(
      (result): User[] => result.users ?? [],
    );
  },

  adminAssign(token: string, userId: string) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/assign`, {
      method: 'PUT', token,
    }).then((result) => ('user' in result ? result.user : result));
  },

  adminUnassign(token: string, userId: string) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/assign`, {
      method: 'DELETE', token,
    }).then((result) => ('user' in result ? result.user : result));
  },

  blockedUsers(token: string, signal?: AbortSignal) {
    return request<RawCollection<User>>('/api/users/me/blocked', { token, signal }).then(
      (result): PaginatedItems<User> => ({ items: result.users ?? result.items ?? [] }),
    );
  },

  reportUser(token: string, userId: string, reason: ReportReason, details?: string) {
    return request<{ reportId?: string; ok?: boolean }>(`/api/users/${encodeURIComponent(userId)}/report`, {
      method: 'POST',
      token,
      body: { reason, ...(details?.trim() ? { details: details.trim() } : {}) },
    });
  },

  // ---- Стикеры, наборы и гифки ----

  stickerPacks(token: string, signal?: AbortSignal) {
    return request<RawCollection<StickerPack>>('/api/sticker-packs', { token, signal }).then(
      (result): StickerPack[] => result.packs ?? result.items ?? [],
    );
  },

  stickerPack(token: string, packId: string, signal?: AbortSignal) {
    return request<{ pack: StickerPack }>(
      `/api/sticker-packs/${encodeURIComponent(packId)}`,
      { token, signal },
    ).then((result) => result.pack);
  },

  createStickerPack(token: string, body: { title: string; emoji?: string }) {
    return request<{ pack: StickerPack }>('/api/sticker-packs', {
      method: 'POST',
      token,
      body,
    }).then((result) => result.pack);
  },

  updateStickerPack(
    token: string,
    packId: string,
    body: { title?: string; emoji?: string },
  ) {
    return request<{ pack: StickerPack }>(
      `/api/sticker-packs/${encodeURIComponent(packId)}`,
      { method: 'PATCH', token, body },
    ).then((result) => result.pack);
  },

  deleteStickerPack(token: string, packId: string) {
    return request<void>(`/api/sticker-packs/${encodeURIComponent(packId)}`, {
      method: 'DELETE',
      token,
    });
  },

  /**
   * Добавить стикер в набор. Файл уже загружен отдельным запросом (`kind=sticker`),
   * здесь только ссылка на него.
   */
  addStickerToPack(token: string, packId: string, attachmentId: string, emoji?: string) {
    return request<{ pack: StickerPack }>(
      `/api/sticker-packs/${encodeURIComponent(packId)}/stickers`,
      {
        method: 'POST',
        token,
        body: { attachmentId, ...(emoji?.trim() ? { emoji: emoji.trim() } : {}) },
      },
    ).then((result) => result.pack);
  },

  removeStickerFromPack(token: string, packId: string, stickerId: string) {
    return request<{ pack: StickerPack }>(
      `/api/sticker-packs/${encodeURIComponent(packId)}/stickers/${encodeURIComponent(stickerId)}`,
      { method: 'DELETE', token },
    ).then((result) => result.pack);
  },

  /** Пригласить в набор: сообщение в беседу, получателям набор добавляется. */
  shareStickerPack(token: string, packId: string, conversationId: string) {
    return request<{ message: Message }>(
      `/api/sticker-packs/${encodeURIComponent(packId)}/share`,
      { method: 'POST', token, body: { conversationId } },
    ).then((result) => result.message);
  },

  installStickerPack(token: string, packId: string) {
    return request<{ pack: StickerPack }>(
      `/api/sticker-packs/${encodeURIComponent(packId)}/install`,
      { method: 'POST', token },
    ).then((result) => result.pack);
  },

  uninstallStickerPack(token: string, packId: string) {
    return request<void>(`/api/sticker-packs/${encodeURIComponent(packId)}/install`, {
      method: 'DELETE',
      token,
    });
  },

  /** Библиотека гифок: загруженное можно слать снова. */
  gifs(token: string, signal?: AbortSignal) {
    return request<RawCollection<Attachment>>('/api/gifs', { token, signal }).then(
      (result): Attachment[] => result.gifs ?? result.items ?? [],
    );
  },
};
