import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  Bookmark,
  Check,
  CheckCheck,
  Copy,
  FileUp,
  FolderArchive,
  Forward,
  Menu,
  MessageCircleMore,
  Mic,
  Moon,
  MoreHorizontal,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Plus,
  Reply,
  RotateCcw,
  Search,
  SendHorizontal,
  Smile,
  Star,
  StarOff,
  Sun,
  Trash2,
  UserRound,
  UsersRound,
  Video,
  Wifi,
  WifiOff,
  X,
  FolderPlus,
  Folder,
  Clock,
  FolderOpen,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { fixWebmDuration } from '@fix-webm-duration/fix';
import { api, ApiError } from '../../api/client';
import { Logo } from '../../components/Logo';
import { UserName } from '../../components/UserName';
import {
  Avatar,
  Button,
  ConversationSkeleton,
  IconButton,
  InlineError,
  MessageSkeleton,
  Spinner,
} from '../../components/ui';
import {
  applyAccountState,
  conversationAvatar,
  conversationTimestamp,
  conversationTitle,
  getConversationPeer,
  messageSenderId,
  sortConversations,
  sortMessages,
  updateConversationPresence,
  updateConversationProfile,
  updateMessageProfile,
} from '../../lib/conversation';
import { formatConversationTime, formatMessageTime } from '../../lib/format';
import { buildMessageGroups, groupAt, groupSpacing } from '../../lib/messageGroups';
import { updateUserPresence, type PresencePayload } from '../../lib/presence';
import { avatarProps } from '../../lib/user';
import {
  showBrowserNotification,
} from '../../lib/notifications';
import { playSound } from '../../lib/sounds';
import type { AccountStatePayload, Attachment, ChatFolder, Conversation, ConversationDraft, Message, MessageReaction, ReadReceipt, ScheduledMessage, ThemeMode, User } from '../../types';
import { CallOverlay } from '../calls/CallOverlay';
import { useWebRtcCall } from '../calls/useWebRtcCall';
import { ProfileModal } from '../profile/ProfileModal';
import { UserProfileSheet } from '../profile/UserProfileSheet';
import { AppSidebar, type SidebarAction } from '../sidebar/AppSidebar';
import { AttachmentDraftTray, ImageViewer, MessageAttachments, type DraftAttachment } from './AttachmentUi';
import {
  EmojiPicker,
  HighlightedText,
  PinnedMessagesBar,
  ReactionBar,
  SystemMessage,
} from './MessageExtras';
import {
  BlockedUsersModal,
  ForwardMessageModal,
  NotesModal,
} from './MessengerModals';
import {
  conversationIsMuted,
  conversationPins,
  formatLastSeen,
  isImageAttachment,
  isUserOnline,
  messageSummary,
  validateOutgoingFile,
} from './messengerUtils';
import { UserSearchModal } from './UserSearchModal';
import { ScheduledMessagesModal } from './ScheduledMessagesModal';

interface MessengerScreenProps {
  token: string;
  currentUser: User;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLogout: (sessionExpired?: boolean) => void;
  onUserUpdated: (user: User) => void;
}

type LoadingState = 'loading' | 'ready' | 'error';
type SocketState = 'connecting' | 'connected' | 'disconnected';
type ChatListMode = 'inbox' | 'archive' | `folder:${string}`;

interface DraftSyncPayload {
  conversationId: string | null;
  draft: ConversationDraft | null;
}

interface TypingPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

interface ReactionPayload {
  conversationId: string;
  messageId: string;
  reactions: MessageReaction[];
}

interface PinsPayload {
  conversationId: string;
  pinnedMessages?: Message[];
  message?: Message | null;
}

interface ImageViewerState {
  images: Attachment[];
  initialId: string;
}

function readableError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function upsertMessage(messages: Message[], message: Message): Message[] {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) return sortMessages([...messages, message]);
  const next = [...messages];
  next[index] = { ...next[index], ...message };
  return sortMessages(next);
}

function upsertScheduledMessage(
  items: ScheduledMessage[],
  scheduled: ScheduledMessage,
): ScheduledMessage[] {
  const without = items.filter((item) => item.id !== scheduled.id);
  return [...without, scheduled].sort((first, second) => first.sendAt.localeCompare(second.sendAt));
}

function upsertFolder(folders: ChatFolder[], folder: ChatFolder): ChatFolder[] {
  const without = folders.filter((item) => item.id !== folder.id);
  return [...without, folder].sort((first, second) => first.position - second.position);
}

function minScheduleValue(): string {
  const local = new Date(Date.now() + 10 * 60 * 1_000);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function formatScheduleTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function updateMessageReferences(messages: Message[], updated: Message): Message[] {
  return sortMessages(
    messages.map((message) => {
      const next = message.id === updated.id ? { ...message, ...updated } : message;
      return next.replyTo?.id === updated.id
        ? { ...next, replyTo: { ...next.replyTo, ...updated, replyTo: null } }
        : next;
    }),
  );
}

function applyReadReceipt(message: Message | null | undefined, receipt: ReadReceipt): Message | null | undefined {
  if (!message || !receipt.messageIds.includes(message.id)) return message;
  return {
    ...message,
    readBy: Array.from(new Set([...(message.readBy ?? []), receipt.userId])),
  };
}

function updateConversationMessage(conversation: Conversation, updated: Message): Conversation {
  return {
    ...conversation,
    lastMessage: conversation.lastMessage?.id === updated.id ? updated : conversation.lastMessage,
    pinnedMessage: conversation.pinnedMessage?.id === updated.id ? updated : conversation.pinnedMessage,
    pinnedMessages: conversation.pinnedMessages?.map((message) =>
      message.id === updated.id ? { ...message, ...updated } : message,
    ),
  };
}

function applyReactions(messages: Message[], payload: ReactionPayload): Message[] {
  return messages.map((message) =>
    message.id === payload.messageId ? { ...message, reactions: payload.reactions } : message,
  );
}

function messageImages(messages: Message[]): Attachment[] {
  return messages.flatMap((message) => message.attachments ?? []).filter(isImageAttachment);
}

function uniqueConversations(items: Conversation[]): Conversation[] {
  return sortConversations(
    Array.from(new Map(items.map((conversation) => [conversation.id, conversation])).values()),
  );
}

export function MessengerScreen({
  token,
  currentUser,
  theme,
  onToggleTheme,
  onLogout,
  onUserUpdated,
}: MessengerScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationState, setConversationState] = useState<LoadingState>('loading');
  const [conversationError, setConversationError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageState, setMessageState] = useState<LoadingState>('ready');
  const [messageError, setMessageError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('');
  const [listMode, setListMode] = useState<ChatListMode>('inbox');
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [scheduledListOpen, setScheduledListOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [folderCreateOpen, setFolderCreateOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderRenameOpen, setFolderRenameOpen] = useState(false);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [folderDeleteConfirm, setFolderDeleteConfirm] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [ownProfileOpen, setOwnProfileOpen] = useState(false);
  const [peerProfileOpen, setPeerProfileOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [socketState, setSocketState] = useState<SocketState>('connecting');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(() => new Set());
  const [pinIndex, setPinIndex] = useState(0);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  useEffect(() => {
    const style = document.documentElement.style;
    const color = currentUser.themeColor;
    if (color && /^#[\da-f]{6}$/i.test(color)) {
      const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
      style.setProperty('--brand', rgb.join(' '));
      style.setProperty('--brand-strong', rgb.map((channel) => Math.round(channel * 0.82)).join(' '));
    }
    return () => {
      style.removeProperty('--brand');
      style.removeProperty('--brand-strong');
    };
  }, [currentUser.themeColor]);

  const [notice, setNotice] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const [recordMode, setRecordMode] = useState<'voice' | 'video_circle'>('voice');
  const [recordPending, setRecordPending] = useState(false);
  const [recordPreview, setRecordPreview] = useState<MediaStream | null>(null);
  const recordingRequestRef = useRef(0);
  const recordConversationRef = useRef<string | null>(null);
  const recordModeRef = useRef<'voice' | 'video_circle'>('voice');
  const recordStoppedAtRef = useRef(0);
  const recordBytesRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef(0);
  const recordMimeRef = useRef('audio/webm');
  const voiceActiveRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const typingConversationRef = useRef<string | null>(null);
  const pendingScrollMessageRef = useRef<string | null>(null);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const serverDraftsRef = useRef(new Map<string, ConversationDraft>());
  const draftSaveTimerRef = useRef<number | null>(null);
  const webRtc = useWebRtcCall(socket);
  const { setCurrentUser: setCallCurrentUser } = webRtc;

  useEffect(() => {
    setCallCurrentUser(currentUser);
  }, [currentUser, setCallCurrentUser]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const selectedPeer = selectedConversation
    ? getConversationPeer(selectedConversation, currentUser.id)
    : null;
  const selectedPins = useMemo(() => conversationPins(selectedConversation), [selectedConversation]);
  // Границы дней и серий сообщений одного автора считаются за один проход,
  // чтобы список не пересчитывал даты для каждой строки отдельно.
  const messageGroups = buildMessageGroups(messages);
  // Направления блокировки разные: «я заблокировал» закрывает отправку и звонки,
  // а «меня заблокировали» — нет. Как в Telegram, заблокированный писать может,
  // просто собеседник эти сообщения не получит.
  const selectedBlockedByMe = Boolean(
    selectedConversation?.blockedByMe ??
      (selectedConversation?.blocked && selectedPeer?.blockedByMe) ??
      false,
  );
  const selectedBlockedByPeer = Boolean(selectedConversation?.blockedByPeer ?? false);
  const selectedBlocked = selectedBlockedByMe || selectedBlockedByPeer;
  const peerTyping = Boolean(selectedPeer && typingUserIds.has(selectedPeer.id));
  const pendingScheduled = useMemo(
    () =>
      scheduledMessages.filter(
        (item) => item.conversationId === selectedId && item.status === 'pending',
      ),
    [scheduledMessages, selectedId],
  );
  const activeFolder = listMode.startsWith('folder:')
    ? folders.find((folder) => folder.id === listMode.slice('folder:'.length)) ?? null
    : null;

  const loadConversations = useCallback(
    async (signal?: AbortSignal, quiet = false) => {
      if (!quiet) setConversationState('loading');
      setConversationError('');
      try {
        const result = await api.conversations(token, signal);
        setConversations(uniqueConversations(result.items));
        setConversationState('ready');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 401) {
          onLogout(true);
          return;
        }
        setConversationError(readableError(error, 'Не удалось загрузить диалоги.'));
        if (!quiet) setConversationState('error');
      }
    },
    [onLogout, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadConversations(controller.signal);
    return () => controller.abort();
  }, [loadConversations]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    draftAttachmentsRef.current = draftAttachments;
  }, [draftAttachments]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Folders, the scheduled queue and stored drafts are loaded with the session.
  useEffect(() => {
    const controller = new AbortController();
    void api.folders(token, controller.signal).then(setFolders).catch(() => {});
    void api.scheduledMessages(token, controller.signal).then(setScheduledMessages).catch(() => {});
    void api.drafts(token, controller.signal)
      .then((list) => {
        serverDraftsRef.current = new Map(list.map((item) => [item.conversationId, item]));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  // Restore the stored draft when the conversation changes.
  useEffect(() => {
    if (!selectedId) return;
    const stored = serverDraftsRef.current.get(selectedId);
    if (!stored) return;
    setDraft(stored.text);
    if (stored.replyToId) {
      const target = messagesRef.current.find((message) => message.id === stored.replyToId);
      if (target) setReplyingTo(target);
    }
  }, [selectedId]);

  // Persist the composer draft on the server a beat after typing pauses.
  useEffect(() => {
    const conversationId = selectedId;
    if (!conversationId || editingMessage) return undefined;
    const stored = serverDraftsRef.current.get(conversationId);
    const text = draft.trim();
    if (text === (stored?.text ?? '') && !replyingTo && !stored?.replyToId) return undefined;
    if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      void api
        .saveDraft(token, conversationId, { text, replyToId: replyingTo?.id ?? null })
        .then((savedDraft) => {
          if (savedDraft) serverDraftsRef.current.set(conversationId, savedDraft);
          else serverDraftsRef.current.delete(conversationId);
        })
        .catch(() => {});
    }, 600);
    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [draft, replyingTo, selectedId, editingMessage, token]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 2_800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    recordingRequestRef.current += 1;
    if (typingStopTimerRef.current !== null) window.clearTimeout(typingStopTimerRef.current);
    if (recordTimerRef.current !== null) window.clearTimeout(recordTimerRef.current);
    voiceActiveRef.current = false;
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    const recordStream = recordStreamRef.current;
    recordStreamRef.current = null;
    if (recordStream) for (const track of recordStream.getTracks()) track.stop();
    uploadControllersRef.current.forEach((controller) => controller.abort());
    draftAttachmentsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  const mergeReadReceipt = useCallback((receipt: ReadReceipt) => {
    setMessages((current) =>
      current.map((message) => applyReadReceipt(message, receipt) as Message),
    );
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === receipt.conversationId
          ? {
              ...conversation,
              lastMessage: applyReadReceipt(conversation.lastMessage, receipt) ?? null,
              pinnedMessage: applyReadReceipt(conversation.pinnedMessage, receipt) ?? null,
              pinnedMessages: conversation.pinnedMessages?.map(
                (message) => applyReadReceipt(message, receipt) as Message,
              ),
            }
          : conversation,
      ),
    );
  }, []);

  const markRead = useCallback(
    async (conversationId: string) => {
      if (document.visibilityState !== 'visible') return;
      try {
        mergeReadReceipt(await api.markRead(token, conversationId));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) onLogout(true);
      }
    },
    [mergeReadReceipt, onLogout, token],
  );

  useEffect(() => {
    let active = true;
    const realtimeSocket: Socket = io(window.location.origin, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4_000,
    });

    setSocket(realtimeSocket);
    setSocketState('connecting');
    realtimeSocket.on('connect', () => {
      if (!active) return;
      setSocketState('connected');
      void loadConversations(undefined, true);
      const conversationId = selectedIdRef.current;
      if (!conversationId) return;
      void api
        .messages(token, conversationId)
        .then((result) => {
          if (selectedIdRef.current !== conversationId) return;
          setMessages((current) => {
            const inFlight = current.filter(
              (message) => message.pending || message.failed,
            );
            const merged = [
              ...result.items,
              ...inFlight.filter(
                (message) => !result.items.some((item) => item.id === message.id),
              ),
            ];
            return sortMessages(merged);
          });
          void markRead(conversationId);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) onLogout(true);
        });
    });
    realtimeSocket.on('disconnect', () => active && setSocketState('disconnected'));
    realtimeSocket.on('connect_error', (error) => {
      if (!active) return;
      setSocketState('disconnected');
      // «frozen» и «no longer exists» — аккаунт заморозили или удалили прямо
      // во время сессии: сервер уже разорвал сокет, выходим и мы.
      if (/token|auth|jwt|unauthorized|frozen|deleted|no longer exists/i.test(error.message)) onLogout(true);
    });
    realtimeSocket.on('message:new', (message: Message) => {
      if (!active || !message?.id || !message.conversationId) return;
      const fromMe = messageSenderId(message) === currentUser.id;
      if (selectedIdRef.current === message.conversationId) {
        setMessages((current) => upsertMessage(current, message));
        if (!fromMe) void markRead(message.conversationId);
      }
      if (!fromMe) {
        const conversation = conversationsRef.current.find((item) => item.id === message.conversationId);
        if (!conversationIsMuted(conversation)) {
          playSound('message');
          const peer = conversation ? getConversationPeer(conversation, currentUser.id) : message.sender ?? message.author;
          showBrowserNotification({
            title: peer?.displayName ?? 'Новое сообщение в Yargram',
            body: messageSummary(message),
            avatarUrl: peer?.avatarUrl,
            conversationId: message.conversationId,
            onlyWhenHidden: true,
            onClick: () => setSelectedId(message.conversationId),
          });
        }
      }
      setConversations((current) => {
        const existing = current.find((conversation) => conversation.id === message.conversationId);
        if (!existing) {
          void loadConversations(undefined, true);
          return current;
        }
        return uniqueConversations(
          current.map((conversation) =>
            conversation.id === message.conversationId
              ? { ...conversation, lastMessage: message, updatedAt: message.createdAt }
              : conversation,
          ),
        );
      });
    });
    realtimeSocket.on('message:updated', (message: Message) => {
      if (!active || !message?.id || !message.conversationId) return;
      if (selectedIdRef.current === message.conversationId) {
        setMessages((current) => updateMessageReferences(current, message));
      }
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === message.conversationId
            ? updateConversationMessage(conversation, message)
            : conversation,
        ),
      );
      setEditingMessage((current) => (current?.id === message.id ? message : current));
      setReplyingTo((current) => (current?.id === message.id ? message : current));
    });
    realtimeSocket.on(
      'message:deleted',
      (payload: { conversationId: string; messageId: string }) => {
        if (!active || !payload?.conversationId || !payload.messageId) return;
        if (selectedIdRef.current === payload.conversationId) {
          setMessages((current) =>
            current
              .filter((message) => message.id !== payload.messageId)
              .map((message) =>
                message.replyTo?.id === payload.messageId ? { ...message, replyTo: null } : message,
              ),
          );
        }
        setEditingMessage((current) => (current?.id === payload.messageId ? null : current));
        setReplyingTo((current) => (current?.id === payload.messageId ? null : current));
        void loadConversations(undefined, true);
      },
    );
    realtimeSocket.on(
      'message:pinned',
      (payload: { conversationId: string; message: Message | null; pinnedMessages?: Message[] }) => {
        if (!active || !payload?.conversationId) return;
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === payload.conversationId
              ? {
                  ...conversation,
                  pinnedMessage: payload.message,
                  ...(payload.pinnedMessages ? { pinnedMessages: payload.pinnedMessages } : {}),
                }
              : conversation,
          ),
        );
      },
    );
    realtimeSocket.on('conversation:pins', (payload: PinsPayload) => {
      if (!active || !payload?.conversationId) return;
      setConversations((current) => current.map((conversation) =>
        conversation.id === payload.conversationId
          ? {
              ...conversation,
              pinnedMessages: payload.pinnedMessages ?? (payload.message ? [payload.message] : []),
              pinnedMessage: payload.pinnedMessages?.at(-1) ?? payload.message ?? null,
            }
          : conversation,
      ));
    });
    realtimeSocket.on('message:reaction', (payload: Message | ReactionPayload) => {
      if (!active || !payload) return;
      if ('id' in payload) {
        if (selectedIdRef.current === payload.conversationId) {
          setMessages((current) => updateMessageReferences(current, payload));
        }
        setConversations((current) => current.map((conversation) =>
          conversation.id === payload.conversationId ? updateConversationMessage(conversation, payload) : conversation,
        ));
      } else if (payload.messageId && Array.isArray(payload.reactions)) {
        if (selectedIdRef.current === payload.conversationId) {
          setMessages((current) => applyReactions(current, payload));
        }
        setConversations((current) => current.map((conversation) =>
          conversation.id === payload.conversationId
            ? updateConversationMessage(conversation, {
                ...(conversation.lastMessage?.id === payload.messageId
                  ? conversation.lastMessage
                  : conversation.pinnedMessages?.find((item) => item.id === payload.messageId)),
                id: payload.messageId,
                conversationId: payload.conversationId,
                text: '',
                createdAt: new Date(0).toISOString(),
                reactions: payload.reactions,
              } as Message)
            : conversation,
        ));
      }
    });
    realtimeSocket.on('typing:updated', (payload: TypingPayload) => {
      if (!active || !payload?.conversationId || !payload.userId || payload.userId === currentUser.id) return;
      if (payload.conversationId !== selectedIdRef.current) return;
      setTypingUserIds((current) => {
        const next = new Set(current);
        if (payload.isTyping) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
    });
    realtimeSocket.on('presence:updated', (payload: PresencePayload) => {
      if (!active || !payload?.userId) return;
      setConversations((current) => current.map((conversation) => updateConversationPresence(conversation, payload)));
      setMessages((current) => current.map((message) => {
        const sender = message.sender ? updateUserPresence(message.sender, payload) : message.sender;
        const author = message.author ? updateUserPresence(message.author, payload) : message.author;
        return { ...message, sender, author };
      }));
    });
    realtimeSocket.on('conversation:settings', (conversation: Conversation) => {
      if (!active || !conversation?.id) return;
      setConversations((current) => uniqueConversations(current.map((item) =>
        item.id === conversation.id ? { ...item, ...conversation } : item,
      )));
    });
    realtimeSocket.on('messages:read', (receipt: ReadReceipt) => {
      if (!active || !receipt?.conversationId || !Array.isArray(receipt.messageIds)) return;
      mergeReadReceipt(receipt);
    });
    realtimeSocket.on('profile:updated', (user: User) => {
      if (!active || !user?.id) return;
      setMessages((current) =>
        current.map((message) => updateMessageProfile(message, user) as Message),
      );
      setConversations((current) =>
        current.map((conversation) => updateConversationProfile(conversation, user)),
      );
    });
    realtimeSocket.on('account:state', (payload: AccountStatePayload) => {
      if (!active || !payload?.userId) return;
      // Заморозили или удалили меня — сессия больше недействительна.
      if (payload.userId === currentUser.id) {
        if (payload.frozen || payload.removed) onLogout(true);
        return;
      }
      const result = applyAccountState(conversationsRef.current, messagesRef.current, payload);
      setConversations(result.conversations);
      setMessages(result.messages);
    });
    realtimeSocket.on('folders:updated', (items: ChatFolder[]) => {
      if (!active || !Array.isArray(items)) return;
      setFolders([...items].sort((first, second) => first.position - second.position));
    });
    realtimeSocket.on('scheduled:updated', (scheduled: ScheduledMessage) => {
      if (!active || !scheduled?.id) return;
      setScheduledMessages((current) => upsertScheduledMessage(current, scheduled));
    });
    realtimeSocket.on('draft:updated', (payload: DraftSyncPayload) => {
      if (!active || !payload || typeof payload.conversationId !== 'string') return;
      if (payload.draft) serverDraftsRef.current.set(payload.conversationId, payload.draft);
      else serverDraftsRef.current.delete(payload.conversationId);
      if (payload.conversationId === selectedIdRef.current && payload.draft) {
        setDraft(payload.draft.text);
      }
    });

    return () => {
      active = false;
      setSocket((current) => (current === realtimeSocket ? null : current));
      realtimeSocket.disconnect();
    };
  }, [currentUser.id, loadConversations, markRead, mergeReadReceipt, onLogout, token]);

  const loadMessages = useCallback(
    async (conversationId: string, signal?: AbortSignal) => {
      setMessageState('loading');
      setMessageError('');
      try {
        const result = await api.messages(token, conversationId, signal);
        if (selectedIdRef.current === conversationId) {
          setMessages(sortMessages(result.items));
          setMessageState('ready');
          void markRead(conversationId);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 401) {
          onLogout(true);
          return;
        }
        if (selectedIdRef.current === conversationId) {
          setMessageError(readableError(error, 'Не удалось загрузить сообщения.'));
          setMessageState('error');
        }
      }
    },
    [markRead, onLogout, token],
  );

  useEffect(() => {
    setMessages([]);
    setDraft('');
    uploadControllersRef.current.forEach((controller) => controller.abort());
    uploadControllersRef.current.clear();
    setDraftAttachments((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    setReplyingTo(null);
    setEditingMessage(null);
    setMessageActionId(null);
    setReactionPickerId(null);
    setTypingUserIds(new Set());
    setChatSearch('');
    setChatSearchOpen(false);
    cancelVoiceRecording();
    if (!selectedId) {
      setMessageState('ready');
      return undefined;
    }
    const controller = new AbortController();
    void loadMessages(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (pinIndex >= selectedPins.length) setPinIndex(0);
  }, [pinIndex, selectedPins.length]);

  useEffect(() => {
    const query = chatSearch.trim();
    if (!chatSearchOpen || !selectedId || !query) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api.searchMessages(token, selectedId, query, controller.signal)
        .then((result) => {
          setMessages((current) => sortMessages([
            ...current,
            ...result.items.filter((message) => !current.some((item) => item.id === message.id)),
          ]));
          const first = result.items[0];
          if (first) {
            pendingScrollMessageRef.current = first.id;
            window.setTimeout(() => {
              document.getElementById(`message-${first.id}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            });
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setMessageError(readableError(error, 'Не удалось выполнить поиск.'));
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [chatSearch, chatSearchOpen, selectedId, token]);

  useEffect(() => {
    const messageId = pendingScrollMessageRef.current;
    if (!messageId || messageState !== 'ready') return;
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return;
    pendingScrollMessageRef.current = null;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [messageState, messages]);

  useEffect(() => {
    const readVisibleConversation = () => {
      const conversationId = selectedIdRef.current;
      if (conversationId && document.visibilityState === 'visible') void markRead(conversationId);
    };
    document.addEventListener('visibilitychange', readVisibleConversation);
    window.addEventListener('focus', readVisibleConversation);
    return () => {
      document.removeEventListener('visibilitychange', readVisibleConversation);
      window.removeEventListener('focus', readVisibleConversation);
    };
  }, [markRead]);

  useEffect(() => {
    if (messageState === 'ready') {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: messages.length > 1 ? 'smooth' : 'auto' });
    }
  }, [messageState, messages]);

  const visibleConversations = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('ru-RU');
    const activeFolder = listMode.startsWith('folder:')
      ? folders.find((folder) => folder.id === listMode.slice('folder:'.length))
      : null;
    return conversations.filter((conversation) => {
      if (Boolean(conversation.archived) !== (listMode === 'archive')) return false;
      if (activeFolder && !activeFolder.conversationIds.includes(conversation.id)) return false;
      const title = conversationTitle(conversation, currentUser.id).toLocaleLowerCase('ru-RU');
      const lastText = conversation.lastMessage?.text?.toLocaleLowerCase('ru-RU') ?? '';
      return !query || title.includes(query) || lastText.includes(query);
    });
  }, [conversations, currentUser.id, filter, folders, listMode]);

  function selectConversation(conversation: Conversation) {
    const previousTyping = typingConversationRef.current;
    if (previousTyping && socket?.connected) socket.emit('typing:stop', { conversationId: previousTyping });
    typingConversationRef.current = null;
    setSelectedId(conversation.id);
  }

  async function openSavedConversation() {
    try {
      const conversation = await api.savedConversation(token);
      setConversations((current) => uniqueConversations([...current.filter((item) => item.id !== conversation.id), conversation]));
      setListMode(conversation.archived ? 'archive' : 'inbox');
      setFilter('');
      selectConversation(conversation);
    } catch (error) {
      setNotice(readableError(error, 'Не удалось открыть Избранное.'));
    }
  }

  function handleCreatedConversation(conversation: Conversation) {
    setConversations((current) => uniqueConversations([conversation, ...current]));
    setSelectedId(conversation.id);
    setSearchOpen(false);
  }

  // Маршрутизация действий из боковой панели в стиле Telegram Desktop.
  function handleSidebarAction(action: SidebarAction) {
    setSidebarOpen(false);
    switch (action) {
      case 'profile':
        setOwnProfileOpen(true);
        return;
      case 'create-group':
      case 'create-channel':
      case 'calls':
        // В Yargram пока нет этих разделов — даём мягкую подсказку.
        setNotice('Этот раздел появится позже.');
        return;
      case 'blocked':
        setBlockedUsersOpen(true);
        return;
      case 'favorites':
        void openSavedConversation();
        return;
      case 'favorites-notes':
        setNotesOpen(true);
        return;
      case 'settings':
        setProfileOpen(true);
        return;
      case 'toggle-theme':
        onToggleTheme();
        return;
      case 'logout':
        onLogout(false);
        return;
    }
  }

  function stopTypingNow() {
    if (typingStopTimerRef.current !== null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    const conversationId = typingConversationRef.current;
    if (conversationId && socket?.connected) socket.emit('typing:stop', { conversationId });
    typingConversationRef.current = null;
  }

  function handleDraftChange(value: string) {
    const next = value.slice(0, 4_000);
    setDraft(next);
    if (!selectedId || !socket?.connected || editingMessage) return;
    if (!next.trim()) {
      stopTypingNow();
      return;
    }
    typingConversationRef.current = selectedId;
    socket.emit('typing:start', { conversationId: selectedId });
    if (typingStopTimerRef.current !== null) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(stopTypingNow, 3_000);
  }

  function updateDraftAttachment(localId: string, patch: Partial<DraftAttachment>) {
    setDraftAttachments((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  }

  async function uploadDraftAttachment(item: DraftAttachment) {
    uploadControllersRef.current.get(item.localId)?.abort();
    const controller = new AbortController();
    uploadControllersRef.current.set(item.localId, controller);
    updateDraftAttachment(item.localId, { status: 'uploading', progress: 0, error: undefined });
    try {
      const uploaded = await api.upload(token, item.file, item.kind, {
        signal: controller.signal,
        onProgress: (progress) => updateDraftAttachment(item.localId, { progress }),
      });
      updateDraftAttachment(item.localId, {
        status: 'uploaded',
        progress: 100,
        uploaded,
        error: undefined,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof ApiError && error.status === 401) {
        onLogout(true);
        return;
      }
      updateDraftAttachment(item.localId, {
        status: 'error',
        error: readableError(error, 'Не удалось загрузить файл.'),
      });
    } finally {
      uploadControllersRef.current.delete(item.localId);
    }
  }

  function queueDraftFiles(files: File[]) {
    if (files.length === 0) return;
    const freeSlots = Math.max(0, 10 - draftAttachments.length);
    if (freeSlots === 0) {
      setNotice('К одному сообщению можно прикрепить не более 10 файлов.');
      return;
    }

    const accepted: DraftAttachment[] = [];
    for (const file of files.slice(0, freeSlots)) {
      const validation = validateOutgoingFile(file);
      if (validation.error) {
        setNotice(validation.error);
        continue;
      }
      const localId = globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}-${Math.random()}`;
      accepted.push({
        localId,
        file,
        kind: validation.kind,
        progress: 0,
        status: 'ready',
        ...(validation.kind === 'image' ? { previewUrl: URL.createObjectURL(file) } : {}),
      });
    }
    if (files.length > freeSlots) setNotice('Лишние файлы не добавлены: максимум 10 вложений.');
    if (accepted.length === 0) return;
    setDraftAttachments((current) => [...current, ...accepted]);
    for (const item of accepted) void uploadDraftAttachment(item);
  }

  function handleSelectedFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    queueDraftFiles(files);
  }

  function removeDraftAttachment(localId: string) {
    uploadControllersRef.current.get(localId)?.abort();
    uploadControllersRef.current.delete(localId);
    setDraftAttachments((current) => {
      const removed = current.find((item) => item.localId === localId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.localId !== localId);
    });
  }

  function retryDraftAttachment(localId: string) {
    const item = draftAttachments.find((candidate) => candidate.localId === localId);
    if (item) void uploadDraftAttachment(item);
  }

  function clearDraftAttachments() {
    uploadControllersRef.current.forEach((controller) => controller.abort());
    uploadControllersRef.current.clear();
    setDraftAttachments((current) => {
      current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    const conversationId = selectedId;
    if (!conversationId || sending || selectedBlockedByMe) return;

    if (editingMessage) {
      if (!text && !(editingMessage.attachments?.length)) return;
      setSending(true);
      setMessageError('');
      try {
        const updated = await api.editMessage(token, conversationId, editingMessage.id, text);
        setMessages((current) => updateMessageReferences(current, updated));
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  lastMessage:
                    conversation.lastMessage?.id === updated.id ? updated : conversation.lastMessage,
                  pinnedMessage:
                    conversation.pinnedMessage?.id === updated.id ? updated : conversation.pinnedMessage,
                }
              : conversation,
          ),
        );
        setEditingMessage(null);
        setDraft('');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onLogout(true);
          return;
        }
        setMessageError(readableError(error, 'Не удалось изменить сообщение.'));
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
      return;
    }

    if (draftAttachments.some((item) => item.status === 'uploading' || item.status === 'ready')) {
      setNotice('Дождитесь окончания загрузки файлов.');
      return;
    }
    if (draftAttachments.some((item) => item.status === 'error')) {
      setNotice('Повторите загрузку неудачных файлов или удалите их.');
      return;
    }
    const uploadedAttachments = draftAttachments.flatMap((item) =>
      item.uploaded ? [item.uploaded] : [],
    );
    if (!text && uploadedAttachments.length === 0) return;

    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const replyTarget = replyingTo;
    const pendingMessage: Message = {
      id: pendingId,
      conversationId,
      senderId: currentUser.id,
      sender: currentUser,
      text,
      createdAt: new Date().toISOString(),
      pending: true,
      readBy: [currentUser.id],
      attachments: uploadedAttachments,
      ...(replyTarget ? { replyToId: replyTarget.id, replyTo: replyTarget } : {}),
    };
    setDraft('');
    clearDraftAttachments();
    stopTypingNow();
    setSending(true);
    setMessageError('');
    setMessages((current) => upsertMessage(current, pendingMessage));

    try {
      const message = await api.sendRichMessage(token, conversationId, {
        text,
        attachmentIds: uploadedAttachments.map((attachment) => attachment.id),
        ...(replyTarget ? { replyToId: replyTarget.id } : {}),
      });
      setMessages((current) => upsertMessage(current.filter((item) => item.id !== pendingId), message));
      setConversations((current) =>
        uniqueConversations(
          current.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, lastMessage: message, updatedAt: message.createdAt }
              : conversation,
          ),
        ),
      );
      setReplyingTo(null);
      playSound('sent');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout(true);
        return;
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === pendingId ? { ...message, pending: false, failed: true } : message,
        ),
      );
      setMessageError(readableError(error, 'Сообщение не отправлено.'));
      setReplyingTo(null);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  async function retryMessage(message: Message) {
    if (retryingId || !message.failed) return;
    setRetryingId(message.id);
    setMessageError('');
    try {
      const sent = await api.sendRichMessage(token, message.conversationId, {
        text: message.text,
        attachmentIds: message.attachments?.map((attachment) => attachment.id),
        ...(message.replyToId ? { replyToId: message.replyToId } : {}),
      });
      setMessages((current) => upsertMessage(current.filter((item) => item.id !== message.id), sent));
      setConversations((current) => uniqueConversations(current.map((conversation) =>
        conversation.id === sent.conversationId
          ? { ...conversation, lastMessage: sent, updatedAt: sent.createdAt }
          : conversation,
      )));
      playSound('sent');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, 'Повторная отправка не удалась.'));
    } finally {
      setRetryingId(null);
    }
  }

  function beginReply(message: Message) {
    setReplyingTo(message);
    setEditingMessage(null);
    setMessageActionId(null);
    textareaRef.current?.focus();
  }

  function beginEdit(message: Message) {
    setEditingMessage(message);
    setReplyingTo(null);
    setDraft(message.text);
    setMessageActionId(null);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(message.text.length, message.text.length);
    });
  }

  async function togglePin(message: Message) {
    const conversationId = selectedId;
    if (!conversationId) return;
    setMessageActionId(null);
    setMessageError('');
    try {
      const alreadyPinned = selectedPins.some((item) => item.id === message.id);
      const result = alreadyPinned
        ? await api.unpinMessageV2(token, conversationId, message.id)
        : await api.pinMessageV2(token, conversationId, message.id);
      const pinnedMessages = result.pinnedMessages ?? (
        alreadyPinned
          ? selectedPins.filter((item) => item.id !== message.id)
          : [...selectedPins, message]
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                pinnedMessages,
                pinnedMessage: pinnedMessages.at(-1) ?? null,
              }
            : conversation,
        ),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout(true);
        return;
      }
      setMessageError(readableError(error, 'Не удалось изменить закреплённое сообщение.'));
    }
  }

  async function toggleReaction(message: Message, emoji: string, active = false) {
    setReactionPickerId(null);
    try {
      const updated = active
        ? await api.removeReaction(token, message.conversationId, message.id)
        : await api.setReaction(token, message.conversationId, message.id, emoji);
      setMessages((current) => updateMessageReferences(current, updated));
      setConversations((current) => current.map((conversation) =>
        conversation.id === updated.conversationId
          ? updateConversationMessage(conversation, updated)
          : conversation,
      ));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, 'Не удалось изменить реакцию.'));
    }
  }

  async function toggleFavorite(message: Message) {
    setMessageActionId(null);
    const favorite = Boolean(message.isFavorite ?? message.favoritedByMe);
    try {
      const updated = favorite
        ? await api.removeFavorite(token, message.conversationId, message.id)
        : await api.addFavorite(token, message.conversationId, message.id);
      setMessages((current) => updateMessageReferences(current, updated));
      setNotice(favorite ? 'Удалено из Избранного.' : 'Добавлено в Избранное.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, 'Не удалось изменить Избранное.'));
    }
  }

  async function copyMessage(message: Message) {
    setMessageActionId(null);
    if (!message.text) {
      setNotice('В этом сообщении нет текста для копирования.');
      return;
    }
    try {
      await navigator.clipboard.writeText(message.text);
      setNotice('Текст скопирован.');
    } catch {
      const field = document.createElement('textarea');
      field.value = message.text;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      setNotice(copied ? 'Текст скопирован.' : 'Не удалось скопировать текст.');
    }
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name || folderBusy) return;
    setFolderBusy(true);
    try {
      const folder = await api.createFolder(token, { name });
      setFolders((current) => upsertFolder(current, folder));
      setFolderName('');
      setFolderCreateOpen(false);
      setListMode(`folder:${folder.id}`);
      setNotice(`Папка «${folder.name}» создана.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, 'Не удалось создать папку.'));
    } finally {
      setFolderBusy(false);
    }
  }

  async function toggleConversationFolder(conversationId: string, folderId: string) {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    const inFolder = folder.conversationIds.includes(conversationId);
    const conversationIds = inFolder
      ? folder.conversationIds.filter((id) => id !== conversationId)
      : [...folder.conversationIds, conversationId];
    try {
      const updated = await api.updateFolder(token, folderId, { conversationIds });
      setFolders((current) => upsertFolder(current, updated));
      setNotice(
        inFolder
          ? `Диалог убран из папки «${updated.name}».`
          : `Диалог добавлен в папку «${updated.name}».`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, 'Не удалось обновить папку.'));
    }
  }

  async function renameActiveFolder() {
    const folder = activeFolder;
    const name = folderRenameValue.trim();
    if (!folder || !name || folderBusy) return;
    setFolderBusy(true);
    try {
      const updated = await api.updateFolder(token, folder.id, { name });
      setFolders((current) => upsertFolder(current, updated));
      setFolderRenameOpen(false);
      setNotice(`Папка переименована в «${updated.name}».`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, 'Не удалось переименовать папку.'));
    } finally {
      setFolderBusy(false);
    }
  }

  async function deleteActiveFolder() {
    const folder = activeFolder;
    if (!folder || folderBusy) return;
    if (!folderDeleteConfirm) {
      setFolderDeleteConfirm(true);
      return;
    }
    setFolderBusy(true);
    try {
      await api.deleteFolder(token, folder.id);
      setFolders((current) => current.filter((item) => item.id !== folder.id));
      setListMode('inbox');
      setChatMenuOpen(false);
      setFolderRenameOpen(false);
      setNotice(`Папка «${folder.name}» удалена.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, 'Не удалось удалить папку.'));
    } finally {
      setFolderBusy(false);
      setFolderDeleteConfirm(false);
    }
  }

  function openSchedulePicker() {
    if (!selectedId || selectedBlockedByMe || sending) return;
    if (editingMessage) {
      setNotice('Отложить можно только новое сообщение.');
      return;
    }
    const text = draft.trim();
    const attachments = draftAttachments.flatMap((item) => (item.uploaded ? [item.uploaded] : []));
    if (!text && attachments.length === 0) {
      setNotice('Напишите сообщение, которое нужно отложить.');
      return;
    }
    setScheduleAt(minScheduleValue());
    setScheduleOpen(true);
  }

  async function scheduleMessage() {
    if (!selectedId || scheduleBusy) return;
    const text = draft.trim();
    const attachments = draftAttachments.flatMap((item) => (item.uploaded ? [item.uploaded] : []));
    const sendAt = new Date(scheduleAt).toISOString();
    setScheduleBusy(true);
    try {
      const scheduled = await api.scheduleMessage(token, selectedId, {
        ...(text ? { text } : {}),
        ...(attachments.length ? { attachmentIds: attachments.map((item) => item.id) } : {}),
        ...(replyingTo ? { replyToId: replyingTo.id } : {}),
        sendAt,
      });
      setScheduledMessages((current) => upsertScheduledMessage(current, scheduled));
      setScheduleOpen(false);
      setDraft('');
      clearDraftAttachments();
      setReplyingTo(null);
      serverDraftsRef.current.delete(selectedId);
      void api.clearDraft(token, selectedId).catch(() => {});
      setNotice(`Сообщение отправится ${formatScheduleTime(scheduled.sendAt)}.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, 'Не удалось запланировать сообщение.'));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function cancelScheduled(scheduledId: string) {
    try {
      const cancelled = await api.cancelScheduledMessage(token, scheduledId);
      setScheduledMessages((current) => upsertScheduledMessage(current, cancelled));
      setNotice('Отложенное сообщение отменено.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, 'Не удалось отменить сообщение.'));
    }
  }

  // NEW_CLIENT_HELPERS

  async function updateSelectedConversationSettings(
    input: { archived?: boolean; mutedUntil?: string | null },
    successMessage: string,
  ) {
    if (!selectedId) return;
    setChatMenuOpen(false);
    try {
      const updated = await api.updateConversationSettings(token, selectedId, input);
      setConversations((current) => uniqueConversations(current.map((conversation) =>
        conversation.id === updated.id ? { ...conversation, ...updated } : conversation,
      )));
      setNotice(successMessage);
      if (input.archived === true) setSelectedId(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, 'Не удалось изменить настройки диалога.'));
    }
  }

  function muteFor(milliseconds: number | 'forever') {
    const mutedUntil = milliseconds === 'forever'
      ? '9999-12-31T23:59:59.999Z'
      : new Date(Date.now() + milliseconds).toISOString();
    void updateSelectedConversationSettings(
      { mutedUntil },
      milliseconds === 'forever' ? 'Уведомления отключены навсегда.' : 'Уведомления временно отключены.',
    );
  }

  function handleBlockedChange(blocked: boolean, updatedUser?: User) {
    if (!selectedPeer) return;
    const user = { ...selectedPeer, ...updatedUser, blockedByMe: blocked };
    setConversations((current) => current.map((conversation) =>
      conversation.id === selectedId
        ? { ...updateConversationProfile(conversation, user), blocked }
        : conversation,
    ));
  }

  async function deleteMessage(message: Message) {
    const conversationId = selectedId;
    if (!conversationId) return;
    setMessageActionId(null);
    if (!window.confirm('Удалить это сообщение у обоих участников?')) return;
    setMessageError('');
    try {
      const result = await api.deleteMessage(token, conversationId, message.id);
      setMessages((current) =>
        current
          .filter((item) => item.id !== message.id)
          .map((item) => (item.replyTo?.id === message.id ? { ...item, replyTo: null } : item)),
      );
      setConversations((current) =>
        uniqueConversations(
          current.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, ...result.conversation } : conversation,
          ),
        ),
      );
      setEditingMessage((current) => (current?.id === message.id ? null : current));
      setReplyingTo((current) => (current?.id === message.id ? null : current));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout(true);
        return;
      }
      setMessageError(readableError(error, 'Не удалось удалить сообщение.'));
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const VOICE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

  async function startVoiceRecording() {
    if (!selectedId || selectedBlockedByMe || sending || recording || recordPending || editingMessage) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setNotice('Запись голоса доступна по HTTPS-адресу (порт 3443) в современном браузере.');
      return;
    }
    const conversationId = selectedId;
    const requestId = ++recordingRequestRef.current;
    recordConversationRef.current = conversationId;
    recordModeRef.current = recordMode;
    setRecordPending(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: recordMode === 'video_circle' ? { width: 480, height: 480, facingMode: 'user' } : false });
      if (requestId !== recordingRequestRef.current || selectedIdRef.current !== conversationId) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      recordStreamRef.current = stream;
      const candidates = recordMode === 'video_circle' ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : VOICE_MIME_TYPES;
      const mime = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordMimeRef.current = recorder.mimeType || mime || (recordMode === 'video_circle' ? 'video/webm' : 'audio/webm');
      recordChunksRef.current = [];
      recordBytesRef.current = 0;
      recordStoppedAtRef.current = 0;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordChunksRef.current.push(event.data);
          recordBytesRef.current += event.data.size;
          if (recordBytesRef.current >= 98 * 1024 * 1024 && recorder.state === 'recording') {
            setNotice('Запись остановлена: достигнут предел размера файла.');
            stopVoiceRecording();
          }
        }
      };
      recorder.onstop = () => void finalizeVoiceRecording();
      recordStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      voiceActiveRef.current = true;
      setRecording(true);
      setRecordPreview(recordMode === 'video_circle' ? stream : null);
      setRecordingSeconds(0);
      recorder.start(250);
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartedAtRef.current) / 1_000);
        setRecordingSeconds(elapsed);
        if (recordModeRef.current === 'video_circle' && elapsed >= 60) stopVoiceRecording();
      }, 250);
    } catch {
      if (requestId === recordingRequestRef.current) {
        cancelVoiceRecording();
        setNotice('Не удалось начать запись. Проверьте доступ к микрофону и камере.');
      }
    } finally {
      if (requestId === recordingRequestRef.current) setRecordPending(false);
    }
  }

  function stopVoiceRecording() {
    if (!recordStoppedAtRef.current) recordStoppedAtRef.current = Date.now();
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function cancelVoiceRecording() {
    recordingRequestRef.current += 1;
    setRecordPending(false);
    setRecordPreview(null);
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    voiceActiveRef.current = false;
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    const stream = recordStreamRef.current;
    recordStreamRef.current = null;
    if (stream) for (const track of stream.getTracks()) track.stop();
    recordChunksRef.current = [];
    setRecording(false);
    setRecordingSeconds(0);
  }

  async function finalizeVoiceRecording() {
    if (!voiceActiveRef.current) return;
    voiceActiveRef.current = false;
    const stream = recordStreamRef.current;
    recordStreamRef.current = null;
    mediaRecorderRef.current = null;
    const mode = recordModeRef.current;
    const conversationId = recordConversationRef.current;
    const requestId = recordingRequestRef.current;
    const durationMs = Math.max(1, (recordStoppedAtRef.current || Date.now()) - recordStartedAtRef.current);
    const durationSeconds = Math.min(durationMs / 1_000, mode === 'video_circle' ? 60 : Infinity);
    setRecordPreview(null);
    setRecording(false);
    setRecordingSeconds(0);
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    let blob = new Blob(recordChunksRef.current, { type: recordMimeRef.current });
    recordChunksRef.current = [];
    if (!conversationId || selectedIdRef.current !== conversationId) return;
    if (blob.size > 100 * 1024 * 1024) {
      setNotice('Запись превышает 100 МБ. Попробуйте более короткую запись.');
      return;
    }
    if (durationSeconds < 1 || blob.size === 0) {
      setNotice('Запись слишком короткая — повторите.');
      return;
    }
    setSending(true);
    setMessageError('');
    try {
      if (blob.type.includes('webm')) blob = await fixWebmDuration(blob, durationMs, { logger: false });
      if (requestId !== recordingRequestRef.current || selectedIdRef.current !== conversationId) return;
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const uploaded = await api.upload(
        token,
        new File([blob], `${mode === 'video_circle' ? 'Видеокружок' : 'Голосовое сообщение'} (${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}).${extension}`, { type: blob.type }),
        'file',
        { mediaKind: mode, durationSeconds },
      );
      if (requestId !== recordingRequestRef.current || selectedIdRef.current !== conversationId) return;
      const message = await api.sendRichMessage(token, conversationId, {
        attachmentIds: [uploaded.id],
      });
      if (selectedIdRef.current === conversationId) setMessages((current) => upsertMessage(current, message));
      setConversations((current) =>
        uniqueConversations(
          current.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, lastMessage: message, updatedAt: message.createdAt }
              : conversation,
          ),
        ),
      );
      playSound('sent');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout(true);
        return;
      }
      setMessageError(readableError(error, 'Голосовое сообщение не отправлено.'));
    } finally {
      setSending(false);
    }
  }

  const draftCanAcceptFiles = Boolean(selectedId && !selectedBlockedByMe && !sending);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draftCanAcceptFiles) return;
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!draftCanAcceptFiles) return;
    if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function handleDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    dragDepthRef.current = 0;
    setDragActive(false);
    if (!draftCanAcceptFiles) return;
    event.preventDefault();
    queueDraftFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  return (
    <main
      className="messenger-shell h-[100dvh] overflow-hidden bg-canvas text-ink"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-[95] grid place-items-center bg-brand/10 backdrop-blur-[2px]" role="presentation">
          <div className="flex flex-col items-center gap-3 rounded-[1.75rem] border-2 border-dashed border-brand/70 bg-elevated/95 px-12 py-10 text-center shadow-float">
            <FileUp className="h-10 w-10 text-brand" />
            <p className="text-lg font-semibold">Отпустите, чтобы прикрепить</p>
            <p className="text-sm text-muted">Файлы добавятся к сообщению</p>
          </div>
        </div>
      )}
      <div className="flex h-full w-full overflow-hidden bg-surface">
        <aside
          className={`${selectedId ? 'hidden md:flex' : 'flex'} chat-sidebar w-full shrink-0 flex-col border-line bg-surface md:w-[340px] md:border-r xl:w-[360px]`}
          aria-label="Список диалогов"
        >
          <header className="shrink-0 border-b border-line px-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-2">
            <div className="flex items-center justify-between gap-3">
              <Logo />
              <div className="flex items-center gap-1">
                <IconButton
                  label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                  onClick={onToggleTheme}
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </IconButton>
                <IconButton
                  label="Главное меню"
                  aria-expanded={sidebarOpen}
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </IconButton>
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Поиск по диалогам</span>
                <Search className="pointer-events-none absolute left-3.5 top-3 h-4.5 w-4.5 text-muted" />
                <input
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="h-11 w-full rounded-full border border-transparent bg-canvas pl-10 pr-9 text-sm outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
                  placeholder="Поиск"
                />
                {filter && (
                  <button
                    type="button"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-line/60"
                    onClick={() => setFilter('')}
                    aria-label="Очистить поиск"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <IconButton
                label="Новый диалог"
                className="h-11 w-11 bg-brand text-white rounded-full hover:bg-brand-strong hover:text-white"
                onClick={() => setSearchOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="mt-1 flex items-stretch gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${listMode === 'inbox' ? 'border-brand bg-brand-soft text-brand' : 'border-transparent text-muted hover:bg-canvas hover:text-ink'}`}
                onClick={() => setListMode('inbox')}
              >
                <MessageCircleMore className="mr-1 inline h-3.5 w-3.5" /> Чаты
              </button>
              {folders.map((folder) => {
                const active = listMode === `folder:${folder.id}`;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-brand bg-brand-soft text-brand' : 'border-transparent text-muted hover:bg-canvas hover:text-ink'}`}
                    onClick={() => setListMode(`folder:${folder.id}`)}
                    title={folder.name}
                  >
                    <Folder className="mr-1 inline h-3.5 w-3.5" />
                    <span className="max-w-24 truncate align-middle">{folder.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${listMode === 'archive' ? 'border-brand bg-brand-soft text-brand' : 'border-transparent text-muted hover:bg-canvas hover:text-ink'}`}
                onClick={() => setListMode('archive')}
              >
                <FolderArchive className="mr-1 inline h-3.5 w-3.5" /> Архив
              </button>
              <button
                type="button"
                className="shrink-0 rounded-full border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand"
                onClick={() => setFolderCreateOpen(true)}
                aria-label="Создать папку"
              >
                <FolderPlus className="inline h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          {folderCreateOpen && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2">
              <Folder className="h-4 w-4 shrink-0 text-brand" />
              <input
                autoFocus
                value={folderName}
                maxLength={40}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Название папки"
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createFolder();
                  if (event.key === 'Escape') {
                    setFolderCreateOpen(false);
                    setFolderName('');
                  }
                }}
              />
              <IconButton
                label="Сохранить папку"
                className="h-8 w-8"
                disabled={!folderName.trim() || folderBusy}
                onClick={() => void createFolder()}
              >
                <Check className="h-4 w-4" />
              </IconButton>
              <IconButton
                label="Отмена"
                className="h-8 w-8"
                onClick={() => {
                  setFolderCreateOpen(false);
                  setFolderName('');
                }}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {conversationState === 'loading' && <ConversationSkeleton />}
            {conversationState === 'error' && (
              <InlineError message={conversationError} onRetry={() => void loadConversations()} />
            )}
            {conversationState === 'ready' && conversations.length === 0 && (
              <div className="grid h-full min-h-[330px] place-items-center px-8 text-center">
                <div>
                  <span className="mx-auto grid h-20 w-20 place-items-center rounded-[1.7rem] bg-brand-soft text-brand">
                    <UsersRound className="h-9 w-9" />
                  </span>
                  <h2 className="mt-5 text-lg font-semibold">Начните разговор</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">Найдите участника Yargram и отправьте первое сообщение.</p>
                  <Button className="mt-5" onClick={() => setSearchOpen(true)}>
                    <Plus className="h-4 w-4" /> Новый диалог
                  </Button>
                </div>
              </div>
            )}
            {conversationState === 'ready' && conversations.length > 0 && visibleConversations.length === 0 && (
              <div className="px-8 py-16 text-center">
                <p className="font-semibold">{listMode === 'archive' && !filter ? 'Архив пуст' : 'Ничего не найдено'}</p>
                <p className="mt-1 text-sm text-muted">{listMode === 'archive' && !filter ? 'Архивированные диалоги появятся здесь.' : 'Попробуйте изменить запрос.'}</p>
              </div>
            )}
            {conversationState === 'ready' && visibleConversations.length > 0 && (
              <ul>
                {visibleConversations.map((conversation) => {
                  const title = conversationTitle(conversation, currentUser.id);
                  const peer = getConversationPeer(conversation, currentUser.id);
                  const active = selectedId === conversation.id;
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        className={`flex min-h-[76px] w-full items-center gap-3 px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${active ? 'bg-brand text-white' : 'hover:bg-canvas'}`}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => selectConversation(conversation)}
                      >
                        {conversation.type === 'saved' ? <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Bookmark className="h-6 w-6" /></span> : <Avatar
                          name={title}
                          src={conversationAvatar(conversation, currentUser.id)}
                          size="md"
                          online={peer && !conversation.blockedByPeer ? isUserOnline(peer) : undefined}
                          {...avatarProps(peer, title)}
                        />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1">
                    <UserName className="text-sm font-semibold" name={title} user={peer} />
                  </span>
                            <span className={`shrink-0 text-[11px] ${active ? 'text-white/70' : 'text-muted'}`}>
                              {formatConversationTime(conversationTimestamp(conversation))}
                            </span>
                          </span>
                          <span className={`mt-1 flex items-center gap-1 truncate text-[13px] ${active ? 'text-white/75' : 'text-muted'}`}>
                            {conversationIsMuted(conversation) && <BellOff className="h-3 w-3 shrink-0" />}
                            <span className="truncate">{messageSummary(conversation.lastMessage)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-line/70 px-5 py-2.5 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              {socketState === 'connected' ? (
                <Wifi className="h-3.5 w-3.5 text-success" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-danger" />
              )}
              {socketState === 'connected' ? 'На связи' : socketState === 'connecting' ? 'Подключение…' : 'Нет realtime-связи'}
            </span>
            <span>Yargram 0.1</span>
          </footer>
        </aside>

        <section className={`chat-panel chat-wallpaper ${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`} style={currentUser.wallpaperUrl ? { backgroundImage: `url(${currentUser.wallpaperUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} aria-label="Переписка">
          {!selectedConversation ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <div className="max-w-sm animate-fade-in">
                <span className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] bg-brand-soft text-brand shadow-sm">
                  <MessageCircleMore className="h-11 w-11" />
                </span>
                <h1 className="mt-6 text-2xl font-black tracking-[-0.035em]">Ваши сообщения</h1>
                <p className="mt-2 text-sm leading-6 text-muted">Выберите диалог слева или найдите человека, которому хотите написать.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex min-h-[60px] shrink-0 items-center gap-1 border-b border-line bg-surface px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-2 sm:px-4">
                <IconButton label="Назад к диалогам" className="md:hidden" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="h-5 w-5" />
                </IconButton>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => selectedPeer && setPeerProfileOpen(true)}
                  disabled={!selectedPeer}
                  title={selectedPeer ? 'Открыть профиль собеседника' : 'Ваше личное пространство'}
                >
                  {selectedConversation.type === 'saved' ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Bookmark className="h-5 w-5" /></span> : <Avatar
                    name={conversationTitle(selectedConversation, currentUser.id)}
                    src={conversationAvatar(selectedConversation, currentUser.id)}
                    size="sm"
                    online={selectedPeer && !selectedBlockedByPeer ? isUserOnline(selectedPeer) : undefined}
                    {...avatarProps(selectedPeer, conversationTitle(selectedConversation, currentUser.id))}
                  />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold sm:text-[15px]">
                      <UserName
                        name={conversationTitle(selectedConversation, currentUser.id)}
                        user={selectedPeer}
                      />
                    </span>
                    <span className={`mt-0.5 block truncate text-xs ${peerTyping ? 'font-semibold text-brand' : 'text-muted'}`}>
                      {peerTyping ? 'Печатает…' : selectedPeer ? formatLastSeen(selectedPeer) : selectedConversation.type === 'saved' ? 'Сообщения и файлы для себя' : 'Личный диалог'}
                    </span>
                  </span>
                </button>
                <IconButton
                  label="Поиск в чате"
                  className={chatSearchOpen ? 'bg-brand-soft text-brand' : ''}
                  onClick={() => setChatSearchOpen((open) => !open)}
                >
                  <Search className="h-5 w-5" />
                </IconButton>
                {selectedPeer && <><IconButton
                  label="Аудиозвонок"
                  disabled={!selectedPeer || socketState !== 'connected' || selectedBlocked}
                  onClick={() =>
                    selectedPeer &&
                    void webRtc.startCall(selectedConversation.id, selectedPeer, 'audio')
                  }
                >
                  <Phone className="h-5 w-5" />
                </IconButton>
                <IconButton
                  label="Видеозвонок"
                  disabled={!selectedPeer || socketState !== 'connected' || selectedBlocked}
                  onClick={() =>
                    selectedPeer &&
                    void webRtc.startCall(selectedConversation.id, selectedPeer, 'video')
                  }
                >
                  <Video className="h-5 w-5" />
                </IconButton></>}
                {selectedConversation.type !== 'saved' && <div className="relative">
                  <IconButton
                    label="Настройки диалога"
                    aria-expanded={chatMenuOpen}
                    onClick={() => setChatMenuOpen((open) => !open)}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </IconButton>
                  {chatMenuOpen && (
                    <div className="absolute right-0 top-12 z-40 w-64 animate-fade-in rounded-2xl border border-line bg-elevated p-2 shadow-float">
                      <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setChatMenuOpen(false); setPeerProfileOpen(true); }}>
                        <UserRound className="h-4 w-4 text-brand" /> Профиль собеседника
                      </button>
                      <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void updateSelectedConversationSettings({ archived: !selectedConversation.archived }, selectedConversation.archived ? 'Диалог возвращён из архива.' : 'Диалог перемещён в архив.')}>
                        {selectedConversation.archived ? <ArchiveRestore className="h-4 w-4 text-brand" /> : <Archive className="h-4 w-4 text-brand" />}
                        {selectedConversation.archived ? 'Вернуть из архива' : 'Архивировать'}
                      </button>
                      {conversationIsMuted(selectedConversation) ? (
                        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void updateSelectedConversationSettings({ mutedUntil: null }, 'Уведомления включены.')}>
                          <Bell className="h-4 w-4 text-brand" /> Включить уведомления
                        </button>
                      ) : (
                        <div className="mt-1 border-t border-line pt-1">
                          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">Отключить уведомления</p>
                          {[
                            ['На 1 час', 60 * 60 * 1_000],
                            ['На 8 часов', 8 * 60 * 60 * 1_000],
                            ['На 1 день', 24 * 60 * 60 * 1_000],
                          ].map(([label, duration]) => (
                            <button key={String(label)} type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-brand-soft/55" onClick={() => muteFor(duration as number)}>
                              <BellOff className="h-3.5 w-3.5 text-muted" /> {label}
                            </button>
                          ))}
                          <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-brand-soft/55" onClick={() => muteFor('forever')}>
                            <BellOff className="h-3.5 w-3.5 text-muted" /> Навсегда
                          </button>
                        </div>
                      )}
                      <div className="mt-1 border-t border-line pt-1">
                        <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">Папки</p>
                        {folders.length === 0 && (
                          <p className="px-3 py-1 text-xs text-muted">Создайте папку кнопкой + в списке диалогов.</p>
                        )}
                        {folders.map((folder) => {
                          const inFolder = folder.conversationIds.includes(selectedConversation.id);
                          return (
                            <button
                              key={folder.id}
                              type="button"
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-brand-soft/55"
                              onClick={() => void toggleConversationFolder(selectedConversation.id, folder.id)}
                            >
                              {inFolder ? <FolderOpen className="h-3.5 w-3.5 text-brand" /> : <Folder className="h-3.5 w-3.5 text-muted" />}
                              <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                              {inFolder && <Check className="h-3.5 w-3.5 text-brand" />}
                            </button>
                          );
                        })}
                        {activeFolder && (
                          <>
                            <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                              Папка «{activeFolder.name}»
                            </p>
                            {folderRenameOpen ? (
                              <div className="flex items-center gap-1 px-2 py-1">
                                <input
                                  autoFocus
                                  value={folderRenameValue}
                                  maxLength={40}
                                  onChange={(event) => setFolderRenameValue(event.target.value)}
                                  className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 text-xs outline-none"
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') void renameActiveFolder();
                                    if (event.key === 'Escape') setFolderRenameOpen(false);
                                  }}
                                />
                                <IconButton
                                  label="Сохранить название"
                                  className="h-8 w-8"
                                  disabled={folderBusy}
                                  onClick={() => void renameActiveFolder()}
                                >
                                  <Check className="h-4 w-4" />
                                </IconButton>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-brand-soft/55"
                                onClick={() => {
                                  setFolderRenameValue(activeFolder.name);
                                  setFolderRenameOpen(true);
                                  setFolderDeleteConfirm(false);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted" /> Переименовать папку
                              </button>
                            )}
                            <button
                              type="button"
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-danger/10 ${folderDeleteConfirm ? 'text-danger' : ''}`}
                              disabled={folderBusy}
                              onClick={() => void deleteActiveFolder()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {folderDeleteConfirm ? 'Нажмите ещё раз для удаления' : 'Удалить папку'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>}
              </header>

              {pendingScheduled.length > 0 && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-b border-line bg-brand-soft/50 px-4 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft/70"
                  onClick={() => setScheduledListOpen(true)}
                >
                  <Clock className="h-3.5 w-3.5" /> Запланированных сообщений: {pendingScheduled.length}
                </button>
              )}

              {chatSearchOpen && (
                <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
                  <Search className="h-4 w-4 shrink-0 text-brand" />
                  <input
                    autoFocus
                    type="search"
                    value={chatSearch}
                    onChange={(event) => setChatSearch(event.target.value.slice(0, 4_000))}
                    className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-brand/50"
                    placeholder="Поиск по сообщениям"
                  />
                  <IconButton label="Закрыть поиск" className="h-8 w-8 rounded-xl" onClick={() => { setChatSearchOpen(false); setChatSearch(''); }}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              )}
        {blockedUsersOpen && (
          <BlockedUsersModal
            token={token}
            onClose={() => setBlockedUsersOpen(false)}
            onUnauthorized={() => onLogout(true)}
          />
        )}
              <PinnedMessagesBar
                messages={selectedPins}
                activeIndex={pinIndex}
                onChangeIndex={setPinIndex}
                onJump={(messageId) => document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                onUnpin={(message) => void togglePin(message)}
              />

              <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="pointer-events-none fixed inset-0 opacity-[0.035] dark:opacity-[0.025]" aria-hidden="true" />
                {messageState === 'loading' && <MessageSkeleton />}
                {messageState === 'error' && (
                  <div className="grid h-full place-items-center">
                    <InlineError
                      message={messageError}
                      onRetry={() => selectedId && void loadMessages(selectedId)}
                    />
                  </div>
                )}
                {messageState === 'ready' && messages.length === 0 && (
                  <div className="grid h-full min-h-[260px] place-items-center px-8 text-center">
                    <div>
                      <Avatar
                        name={conversationTitle(selectedConversation, currentUser.id)}
                        src={conversationAvatar(selectedConversation, currentUser.id)}
                        size="xl"
                        className="justify-center"
                        {...avatarProps(selectedPeer, conversationTitle(selectedConversation, currentUser.id))}
                      />
                      <p className="mt-4 font-semibold">Диалог создан</p>
                      <p className="mt-1 text-sm leading-6 text-muted">Напишите первое сообщение — оно появится здесь мгновенно.</p>
                    </div>
                  </div>
                )}
                {messageState === 'ready' && messages.length > 0 && (
                  <ol className="mx-auto flex min-h-full w-full max-w-[920px] flex-col justify-end px-3 py-5 sm:px-7">
                    {messages.map((message, index) => {
                      const group = groupAt(messageGroups, index);
                      const mine = messageSenderId(message) === currentUser.id;
                      const readByPeer = (message.readBy ?? []).some((userId) => userId !== currentUser.id);
                      const sender = message.sender ?? message.author ?? selectedPeer;
                      const pinned = selectedPins.some((item) => item.id === message.id);
                      const favorite = Boolean(message.isFavorite ?? message.favoritedByMe);
                      return (
                        <li
                          key={message.id}
                          id={`message-${message.id}`}
                          className={groupSpacing(index, group)}
                        >
                          {group.showDay && (
                            <div className="my-4 flex justify-center first:mt-0">
                              <span className="rounded-full border border-line/70 bg-surface/90 px-3 py-1 text-[11px] font-semibold text-muted shadow-sm backdrop-blur">
                                {group.day}
                              </span>
                            </div>
                          )}
                          {group.service ? (
                            <SystemMessage message={message} currentUserId={currentUser.id} />
                          ) : (
                            <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                              {!mine && (
                                <span className="hidden w-9 shrink-0 md:block">
                                  {group.endsGroup && (
                                    <button
                                      type="button"
                                      className="block rounded-full transition hover:opacity-90"
                                      onClick={() => selectedPeer && setPeerProfileOpen(true)}
                                      disabled={!selectedPeer}
                                      title={sender?.displayName ? `Открыть профиль ${sender.displayName}` : undefined}
                                      aria-label={sender?.displayName ? `Открыть профиль ${sender.displayName}` : undefined}
                                    >
                                      <Avatar
                                        name={sender?.displayName ?? 'Пользователь'}
                                        src={sender?.avatarUrl ?? sender?.avatar?.url}
                                        size="sm"
                                        {...avatarProps(sender ?? null)}
                                      />
                                    </button>
                                  )}
                                </span>
                              )}
                              <div className={`relative flex min-w-0 max-w-[94%] items-end gap-1 sm:max-w-[80%] ${mine ? 'flex-row' : 'flex-row-reverse'}`}>
                                {!message.pending && !message.failed && (
                                  <button
                                    type="button"
                                    className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface hover:text-brand"
                                    aria-label="Действия с сообщением"
                                    aria-expanded={messageActionId === message.id}
                                    onClick={() => setMessageActionId((current) => (current === message.id ? null : message.id))}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                )}
                                {messageActionId === message.id && (
                                  <div className={`absolute bottom-10 z-30 w-56 max-h-[70dvh] overflow-y-auto rounded-2xl border border-line bg-elevated p-1.5 text-ink shadow-float ${mine ? 'right-9' : 'left-9'}`}>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setMessageActionId(null); setReactionPickerId(message.id); }}>
                                      <Smile className="h-4 w-4 text-brand" /> Реакция
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => beginReply(message)}>
                                      <Reply className="h-4 w-4 text-brand" /> Ответить
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void copyMessage(message)}>
                                      <Copy className="h-4 w-4 text-brand" /> Копировать
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setMessageActionId(null); setForwardingMessage(message); }}>
                                      <Forward className="h-4 w-4 text-brand" /> Переслать
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void toggleFavorite(message)}>
                                      {favorite ? <StarOff className="h-4 w-4 text-brand" /> : <Star className="h-4 w-4 text-brand" />}
                                      {favorite ? 'Убрать из Избранного' : 'В Избранное'}
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void togglePin(message)}>
                                      {pinned ? <PinOff className="h-4 w-4 text-brand" /> : <Pin className="h-4 w-4 text-brand" />}
                                      {pinned ? 'Открепить' : 'Закрепить'}
                                    </button>
                                    {mine && (
                                      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => beginEdit(message)}>
                                        <Pencil className="h-4 w-4 text-brand" /> Изменить
                                      </button>
                                    )}
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10" onClick={() => void deleteMessage(message)}>
                                      <Trash2 className="h-4 w-4" /> Удалить у обоих
                                    </button>
                                  </div>
                                )}
                                {reactionPickerId === message.id && (
                                  <EmojiPicker
                                    mode="reaction"
                                    className={`absolute bottom-11 ${mine ? 'right-8' : 'left-8'}`}
                                    onClose={() => setReactionPickerId(null)}
                                    onSelect={(emoji) => void toggleReaction(message, emoji, message.reactions?.some((reaction) => reaction.emoji === emoji && reaction.userIds.includes(currentUser.id)))}
                                  />
                                )}
                                <div className="min-w-0">
                                  <div
                                    className={`message-bubble min-w-0 rounded-xl px-3 py-2 text-ink shadow-sm ${mine ? 'rounded-br-sm bg-[rgb(var(--bubble-out))]' : 'rounded-bl-sm bg-surface'} ${message.failed ? 'ring-2 ring-danger/40' : ''}`}
                                    onContextMenu={(event) => {
                                      if (message.pending || message.failed) return;
                                      event.preventDefault();
                                      setMessageActionId(message.id);
                                    }}
                                  >
                                    {!mine && (
                                      <p className="mb-1 text-[11px] font-bold text-brand">
                                        <UserName
                                          size="sm"
                                          name={message.sender?.displayName ?? message.author?.displayName ?? selectedPeer?.displayName ?? 'Собеседник'}
                                          user={message.sender ?? message.author ?? selectedPeer}
                                        />
                                      </p>
                                    )}
                                    {message.forwardedFrom && (
                                      <p className={`mb-1 flex items-center gap-1 text-[10px] font-semibold ${mine ? 'text-ink/65' : 'text-muted'}`}>
                                        <Forward className="h-3 w-3" /> Переслано от <UserName size="sm" name={message.forwardedFrom.sender?.displayName ?? 'пользователя'} user={message.forwardedFrom.sender} />
                                      </p>
                                    )}
                                    {message.replyTo ? (
                                      <button
                                        type="button"
                                        className={`mb-2 block w-full rounded-xl border-l-2 px-2.5 py-1.5 text-left ${mine ? 'border-brand bg-brand/10' : 'border-brand bg-brand-soft/45'}`}
                                        onClick={() => document.getElementById(`message-${message.replyTo?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                      >
                                        <span className={`block text-[10px] font-bold ${mine ? 'text-brand' : 'text-brand'}`}>
                                          <UserName
                                            size="sm"
                                            name={message.replyTo.sender?.displayName ?? (messageSenderId(message.replyTo) === currentUser.id ? currentUser.displayName : selectedPeer?.displayName ?? 'Собеседник')}
                                            user={message.replyTo.sender ?? (messageSenderId(message.replyTo) === currentUser.id ? currentUser : selectedPeer)}
                                          />
                                        </span>
                                        <span className={`block truncate text-xs ${mine ? 'text-ink/70' : 'text-muted'}`}>{messageSummary(message.replyTo)}</span>
                                      </button>
                                    ) : message.replyToId ? (
                                      <div className={`mb-2 rounded-xl border-l-2 px-2.5 py-1.5 text-xs ${mine ? 'border-brand/50 bg-brand/10 text-ink/65' : 'border-line bg-canvas text-muted'}`}>
                                        Исходное сообщение удалено
                                      </div>
                                    ) : null}
                                    <MessageAttachments
                                      attachments={message.attachments ?? []}
                                      mine={mine}
                                      onOpenImage={(attachment) => setImageViewer({ images: messageImages(messages), initialId: attachment.id })}
                                    />
                                    {message.text && (
                                      <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.45] sm:text-[15px]">
                                        <HighlightedText text={message.text} query={chatSearchOpen ? chatSearch : ''} />
                                      </p>
                                    )}
                                    <span className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-ink/60' : 'text-muted'}`}>
                                      {message.editedAt && !message.failed && 'изменено · '}
                                      {message.failed ? 'Не отправлено' : formatMessageTime(message.createdAt)}
                                      {favorite && <Star className="h-3 w-3 fill-current" aria-label="В Избранном" />}
                                      {mine && !message.failed && (
                                        message.pending
                                          ? <Spinner className="h-3 w-3" />
                                          : readByPeer
                                            ? <CheckCheck className="h-3.5 w-3.5" aria-label="Прочитано" />
                                            : <Check className="h-3.5 w-3.5" aria-label="Отправлено" />
                                      )}
                                    </span>
                                    {message.failed && (
                                      <button type="button" className={`mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${mine ? 'bg-danger/10 text-danger' : 'bg-danger/10 text-danger'}`} disabled={retryingId === message.id} onClick={() => void retryMessage(message)}>
                                        <RotateCcw className={`h-3 w-3 ${retryingId === message.id ? 'animate-spin' : ''}`} /> Повторить отправку
                                      </button>
                                    )}
                                  </div>
                                  {!message.pending && !message.failed && (
                                    <ReactionBar
                                      reactions={message.reactions ?? []}
                                      currentUserId={currentUser.id}
                                      mine={mine}
                                      disabled={selectedBlocked}
                                      onToggle={(emoji, active) => void toggleReaction(message, emoji, active)}
                                      onAdd={() => setReactionPickerId(message.id)}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                    <div ref={bottomRef} />
                  </ol>
                )}
              </div>

              <footer className="border-t border-line/75 bg-surface/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5">
                {messageError && messageState !== 'error' && (
                  <p className="mx-auto mb-2 max-w-[920px] rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">
                    {messageError}
                  </p>
                )}
                {selectedBlocked && (
                  <p className="mx-auto mb-2 max-w-[920px] rounded-xl bg-danger/10 px-3 py-2 text-center text-xs font-semibold text-danger">
                    Общение заблокировано. Разблокируйте пользователя в его профиле.
                  </p>
                )}
                {recording && (
                  <div className="mx-auto mb-2 flex max-w-[920px] items-center gap-3 rounded-2xl border border-danger/25 bg-danger/5 px-3 py-2">
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center">
                      <span className="absolute inline-flex h-4 w-4 animate-ping rounded-full bg-danger/40" />
                      <span className="relative h-3.5 w-3.5 rounded-full bg-danger" />
                    </span>
                    {recordPreview && <video autoPlay muted playsInline aria-label="Предпросмотр видеокружка" className="h-20 w-20 shrink-0 rounded-full object-cover" ref={(element) => { if (element && element.srcObject !== recordPreview) element.srcObject = recordPreview; }} />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-danger">{recordMode === 'video_circle' ? 'Идёт запись видеокружка' : 'Идёт запись голосового сообщения'}</span>
                      <span className="block font-mono text-sm font-bold text-ink">
                        {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}{recordMode === 'video_circle' ? ' / 1:00' : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger text-white transition hover:bg-danger/85"
                      onClick={stopVoiceRecording}
                      aria-label="Остановить запись и отправить"
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-danger transition hover:bg-danger/10"
                      onClick={cancelVoiceRecording}
                      aria-label="Отменить запись"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <AttachmentDraftTray
                  items={draftAttachments}
                  onRemove={removeDraftAttachment}
                  onRetry={retryDraftAttachment}
                />
                {(editingMessage || replyingTo) && (
                  <div className="mx-auto mb-2 flex max-w-[920px] items-center gap-3 rounded-2xl border border-line bg-canvas px-3 py-2">
                    {editingMessage ? <Pencil className="h-4 w-4 shrink-0 text-brand" /> : <Reply className="h-4 w-4 shrink-0 text-brand" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-brand">
                        {editingMessage ? 'Изменение сообщения' : 'Ответ на сообщение'}
                      </p>
                      <p className="truncate text-xs text-muted">{(editingMessage ?? replyingTo)?.text}</p>
                    </div>
                    <IconButton
                      label="Отменить"
                      className="h-8 w-8 rounded-xl"
                      onClick={() => {
                        if (editingMessage) setDraft('');
                        setEditingMessage(null);
                        setReplyingTo(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
                <form className="mx-auto flex max-w-[920px] items-end gap-2" onSubmit={(event) => void sendMessage(event)}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    multiple
                    onChange={handleSelectedFiles}
                    disabled={sending || selectedBlockedByMe || Boolean(editingMessage)}
                  />
                  <IconButton
                    label="Прикрепить фото или файл"
                    type="button"
                    disabled={sending || selectedBlockedByMe || Boolean(editingMessage)}
                    className="h-11 w-11 shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="h-5 w-5" />
                  </IconButton>
                  <IconButton
                    label={recording ? 'Остановить запись' : recordPending ? 'Ожидание доступа к устройству' : recordMode === 'video_circle' ? 'Записать видеокружок' : 'Голосовое сообщение'}
                    type="button"
                    disabled={sending || selectedBlockedByMe || Boolean(editingMessage) || recordPending}
                    className={`h-11 w-11 shrink-0 ${recording ? 'bg-danger text-white hover:bg-danger/85' : ''}`}
                    onClick={() => {
                      if (recording) stopVoiceRecording();
                      else void startVoiceRecording();
                    }}
                  >
                    {recording ? <span className="h-3 w-3 rounded-full bg-white" /> : recordMode === 'video_circle' ? <Video className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </IconButton>
                  <IconButton type="button" label={recordMode === 'voice' ? 'Переключить на видеокружок' : 'Переключить на голосовое сообщение'} disabled={recording || recordPending || sending} className="h-11 w-8 shrink-0" onClick={() => setRecordMode((mode) => mode === 'voice' ? 'video_circle' : 'voice')}>
                    {recordMode === 'voice' ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </IconButton>
                  <div className="relative">
                    <IconButton
                      label="Добавить эмодзи"
                      type="button"
                      disabled={sending || selectedBlockedByMe}
                      className={`h-11 w-11 shrink-0 ${emojiOpen ? 'bg-brand-soft text-brand' : ''}`}
                      onClick={() => setEmojiOpen((open) => !open)}
                    >
                      <Smile className="h-5 w-5" />
                    </IconButton>
                    {emojiOpen && (
                      <EmojiPicker
                        className="absolute bottom-14 left-0"
                        onClose={() => setEmojiOpen(false)}
                        onSelect={(emoji) => {
                          const field = textareaRef.current;
                          const start = field?.selectionStart ?? draft.length;
                          const end = field?.selectionEnd ?? draft.length;
                          handleDraftChange(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
                          setEmojiOpen(false);
                          window.setTimeout(() => {
                            field?.focus();
                            field?.setSelectionRange(start + emoji.length, start + emoji.length);
                          });
                        }}
                      />
                    )}
                  </div>
                  <div className="relative">
                    <IconButton
                      label="Отправить позже"
                      type="button"
                      disabled={sending || selectedBlockedByMe || Boolean(editingMessage) || recording}
                      className={`h-11 w-11 shrink-0 ${scheduleOpen ? 'bg-brand-soft text-brand' : ''}`}
                      onClick={() => (scheduleOpen ? setScheduleOpen(false) : openSchedulePicker())}
                    >
                      <Clock className="h-5 w-5" />
                    </IconButton>
                    {scheduleOpen && (
                      <div className="absolute bottom-14 right-0 z-30 w-64 animate-fade-in rounded-2xl border border-line bg-elevated p-3 shadow-float">
                        <p className="text-sm font-semibold">Отправить позже</p>
                        <input
                          type="datetime-local"
                          value={scheduleAt}
                          min={minScheduleValue()}
                          onChange={(event) => setScheduleAt(event.target.value)}
                          className="mt-2 h-10 w-full rounded-xl border border-line bg-canvas px-2 text-sm outline-none focus:border-brand/50"
                        />
                        <Button
                          type="button"
                          className="mt-2 w-full text-xs"
                          loading={scheduleBusy}
                          onClick={() => void scheduleMessage()}
                        >
                          Запланировать
                        </Button>
                      </div>
                    )}
                  </div>

                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Сообщение</span>
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(event) => handleDraftChange(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      rows={1}
                      className="max-h-32 min-h-11 w-full resize-none rounded-[1.2rem] border border-line bg-canvas px-4 py-2.5 text-[15px] leading-6 outline-none transition placeholder:text-muted/65 focus:border-brand/50 focus:ring-4 focus:ring-brand/10"
                      placeholder={selectedBlockedByMe ? 'Отправка недоступна' : editingMessage ? 'Измените сообщение…' : replyingTo ? 'Напишите ответ…' : 'Сообщение…'}
                      disabled={sending || selectedBlockedByMe}
                    />
                  </label>
                  <IconButton
                    label="Отправить сообщение"
                    type="submit"
                    disabled={
                      sending ||
                      selectedBlockedByMe ||
                      draftAttachments.some((item) => item.status !== 'uploaded') ||
                      (!draft.trim() && !draftAttachments.some((item) => item.status === 'uploaded'))
                    }
                    className="h-11 w-11 bg-brand text-white shadow-sm hover:bg-brand-strong hover:text-white"
                  >
                    {sending ? <Spinner className="h-5 w-5" /> : <SendHorizontal className="h-5 w-5" />}
                  </IconButton>
                </form>
              </footer>
            </>
          )}
        </section>
      </div>

      {searchOpen && (
        <UserSearchModal
          token={token}
          currentUserId={currentUser.id}
          onClose={() => setSearchOpen(false)}
          onConversation={handleCreatedConversation}
        />
      )}
      {profileOpen && (
        <ProfileModal
          token={token}
          user={currentUser}
          onClose={() => setProfileOpen(false)}
          onSaved={onUserUpdated}
        />
      )}
      {sidebarOpen && (
        <AppSidebar
          currentUser={currentUser}
          theme={theme}
          onAction={handleSidebarAction}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      {peerProfileOpen && selectedPeer && (
        <UserProfileSheet
          token={token}
          user={selectedPeer}
          mode="peer"
          onClose={() => setPeerProfileOpen(false)}
          onMessage={() => setPeerProfileOpen(false)}
          onAudioCall={() => {
            if (!selectedConversation) return;
            setPeerProfileOpen(false);
            void webRtc.startCall(selectedConversation.id, selectedPeer, 'audio');
          }}
          onVideoCall={() => {
            if (!selectedConversation) return;
            setPeerProfileOpen(false);
            void webRtc.startCall(selectedConversation.id, selectedPeer, 'video');
          }}
          onMore={() => setNotice('Дополнительные действия появятся позже.')}
          onBlockedChange={handleBlockedChange}
          onUnauthorized={() => onLogout(true)}
          viewerIsOwner={Boolean(currentUser?.isOwner)}
          onDeleted={() => {
            setPeerProfileOpen(false);
            void loadConversations();
          }}
          onRestored={() => void loadConversations()}
        />
      )}
      {ownProfileOpen && (
        <UserProfileSheet
          token={token}
          user={currentUser}
          mode="own"
          onClose={() => setOwnProfileOpen(false)}
          onEdit={() => {
            setOwnProfileOpen(false);
            setProfileOpen(true);
          }}
          onSaved={onUserUpdated}
          onUnauthorized={() => onLogout(true)}
        />
      )}
      {forwardingMessage && (
        <ForwardMessageModal
          token={token}
          message={forwardingMessage}
          conversations={conversations}
          currentUserId={currentUser.id}
          onClose={() => setForwardingMessage(null)}
          onUnauthorized={() => onLogout(true)}
          onForwarded={(message, targetConversationId) => {
            if (selectedId === targetConversationId) {
              setMessages((current) => upsertMessage(current, message));
            }
            setConversations((current) => uniqueConversations(current.map((conversation) =>
              conversation.id === targetConversationId
                ? { ...conversation, lastMessage: message, updatedAt: message.createdAt }
                : conversation,
            )));
            setNotice('Сообщение переслано.');
          }}
        />
      )}
      {notesOpen && (
        <NotesModal
          token={token}
          onClose={() => setNotesOpen(false)}
          onUnauthorized={() => onLogout(true)}
        />

      )}
        {blockedUsersOpen && (
          <BlockedUsersModal
            token={token}
            onClose={() => setBlockedUsersOpen(false)}
            onUnauthorized={() => onLogout(true)}
          />
        )}
      {scheduledListOpen && (
        <ScheduledMessagesModal
          items={scheduledMessages}
          conversations={conversations}
          currentUserId={currentUser.id}
          onClose={() => setScheduledListOpen(false)}
          onCancel={(scheduledId) => void cancelScheduled(scheduledId)}
        />
      )}
      {imageViewer && (
        <ImageViewer
          images={imageViewer.images}
          initialId={imageViewer.initialId}
          onClose={() => setImageViewer(null)}
        />
      )}
      {notice && (
        <div className="pointer-events-none fixed inset-x-4 top-4 z-[95] mx-auto w-fit max-w-[calc(100%-2rem)] animate-slide-up rounded-2xl border border-line bg-elevated px-4 py-2.5 text-center text-sm font-semibold text-ink shadow-float" role="status">
          {notice}
        </div>
      )}
      <CallOverlay
        call={webRtc.call}
        error={webRtc.error}
        onDismissError={webRtc.dismissError}
        onAccept={() => void webRtc.acceptCall()}
        onAcceptInvite={() => void webRtc.acceptInvite()}
        onDeclineInvite={webRtc.declineInvite}
        onEnd={webRtc.endCall}
        onToggleMicrophone={webRtc.toggleMicrophone}
        onToggleCamera={webRtc.toggleCamera}
        settings={webRtc.settings}
        devices={webRtc.devices}
        onSettingsChange={webRtc.updateSettings}
        onRefreshDevices={webRtc.refreshDevices}
        onToggleScreenShare={webRtc.toggleScreenShare}
        onRemoteVolumeChange={webRtc.setRemoteVolume}
        localVideoRef={webRtc.setLocalVideoRef}
        remoteVideoRef={webRtc.setRemoteVideoRef}
        remoteVideoRefFor={webRtc.remoteVideoRefFor}
        token={token}
        onInvite={webRtc.inviteParticipant}
      />
    </main>
  );
}
