import type {
  Attachment,
  AttachmentKind,
  AuthResult,
  ChatFolder,
  Conversation,
  ConversationDraft,
  LoginInput,
  Message,
  PaginatedItems,
  RegisterInput,
  ReadReceipt,
  ReportReason,
  ScheduledMessage,
  UpdateProfileInput,
  FavoriteNote,
  User,
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
}

export interface UploadOptions {
  mediaKind?: 'voice' | 'video_circle';
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
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

async function authenticate(path: string, input: LoginInput | RegisterInput): Promise<AuthResult> {
  const result = await request<RawAuthResult>(path, { method: 'POST', body: input });
  const accessToken = result.accessToken ?? result.token;
  if (!accessToken) throw new ApiError('Сервер не вернул токен доступа.', 500, result);
  return { accessToken, user: result.user };
}

export const api = {
  register(input: RegisterInput) {
    return authenticate('/api/auth/register', input);
  },

  login(input: LoginInput) {
    return authenticate('/api/auth/login', input);
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
  createFolder(token: string, input: { name: string; conversationIds?: string[] }) {
    return request<{ folder: ChatFolder }>('/api/folders', { method: 'POST', token, body: input })
      .then((result) => result.folder);
  },
  updateFolder(token: string, folderId: string, input: { name?: string; position?: number; conversationIds?: string[] }) {
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

  adminGrant(token: string, userId: string, input: { targetUserId?: string; targetUsername?: string; isVerified?: boolean; badge?: 'yargram' | null; usernames?: string[]; adminUserIds?: string[] }) {
    return request<User | { user: User }>(`/api/admin/${encodeURIComponent(userId)}/grant`, {
      method: 'POST', token, body: input,
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
};
