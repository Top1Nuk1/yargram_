import {
  BarChart3,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
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
  Snowflake,
  Star,
  StarOff,
  // 🔥 Значок переименован: рядом есть тип `Sticker` из `types.ts`, и без
  // псевдонима они занимают одно имя — тип для TS, иконка для JSX.
  Sticker as StickerIcon,
  PackagePlus,
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
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Quote,
  Type,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { fixWebmDuration } from '@fix-webm-duration/fix';
import { api, ApiError } from '../../api/client';
import { DecorativeVideo } from '../../components/DecorativeVideo';
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
  conversationPeerDeleted,
  conversationPeerFrozen,
  conversationTimestamp,
  conversationTitle,
  getConversationPeer,
  messageSenderId,
  sortConversations,
  sortMessages,
  unreadBadgeText,
  updateConversationPresence,
  updateConversationProfile,
  updateMessageProfile,
} from '../../lib/conversation';
import { formatConversationTime, formatMessageTime } from '../../lib/format';
import {
  containsLink,
  groupSubtitle,
  groupRoleOf,
  groupTitle,
  isGroup,
  memberTagOf,
  mutedUntilText,
  viewerCan,
} from '../../lib/group';
import { buildMessageGroups, groupAt, groupSpacing } from '../../lib/messageGroups';
import { updateUserPresence, mergeUserProfile, type PresencePayload } from '../../lib/presence';
import { avatarProps } from '../../lib/user';
import type { StoredAccount } from '../../lib/accounts';
import {
  browserNotificationsSupported,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from '../../lib/notifications';
import { playSound } from '../../lib/sounds';
import { useLanguage } from '../../hooks/useLanguage';
import type { AccountStatePayload, Attachment, ChatFolder, Conversation, ConversationDraft, Message, MessageReaction, ReadReceipt, ScheduledMessage, Session, Sticker, StickerPack, ThemeMode, User } from '../../types';
import type { ThemeControls } from '../../hooks/useTheme';
import { CallOverlay } from '../calls/CallOverlay';
import { useWebRtcCall } from '../calls/useWebRtcCall';
import { PollDialog, type PollDraft } from '../polls/PollDialog';
import { PollMessage } from '../polls/PollMessage';
import { GroupCreateModal } from '../groups/GroupCreateModal';
import { GroupInfoPanel } from '../groups/GroupInfoPanel';
import { MemberTag } from '../groups/MemberTag';
import { ProfileModal } from '../profile/ProfileModal';
import { SettingsScreen } from '../settings/SettingsScreen';
import { LanguageScreen } from '../settings/LanguageScreen';
import { PrivacyScreen } from '../settings/PrivacyScreen';
import { SessionsScreen } from '../settings/SessionsScreen';
import { ScaleScreen } from '../settings/ScaleScreen';
import { ThemesScreen } from '../settings/ThemesScreen';
import { NewSessionAlert } from '../settings/NewSessionAlert';
import { ThemeLinkImport } from '../../components/ThemeLinkImport';
import { UserProfileSheet } from '../profile/UserProfileSheet';
import { FriendsModal } from '../friends/FriendsModal';
import { AppSidebar, type SidebarAction } from '../sidebar/AppSidebar';
import { AdminPanel } from '../admin/AdminPanel';
import { AttachmentDraftTray, ImageViewer, MessageAttachments, type DraftAttachment } from './AttachmentUi';
import { FloatingAudioBar } from './FloatingAudioBar';
import { applyFormatting, type FormatType } from '../../lib/formatting';
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
isVideoGifAttachment,
  isUserOnline,
  messageSummary,
  validateOutgoingFile,
} from './messengerUtils';
import { UserSearchModal } from './UserSearchModal';
import { ScheduledMessagesModal } from './ScheduledMessagesModal';
import { MessageStickers, SharedPackCard } from './StickerBubble';
import { StickerPicker } from './StickerPicker';
import { StickerPacksScreen } from './StickerPacksScreen';

interface MessengerScreenProps {
  token: string;
  currentUser: User;
  theme: ThemeMode;
  onToggleTheme: () => void;
  /** Темы: список, редактор и обмен ссылкой. */
  themeControls: ThemeControls;
  onLogout: (sessionExpired?: boolean) => void;
  onUserUpdated: (user: User) => void;
  /** Аккаунты, сохранённые на этом устройстве, для переключателя в боковой панели. */
  accounts: StoredAccount[];
  onSwitchAccount: (token: string) => void;
  onAddAccount: () => void;
  onRemoveAccount: (token: string) => void;
}

type LoadingState = 'loading' | 'ready' | 'error';
type SocketState = 'connecting' | 'connected' | 'disconnected';
type ChatListMode = 'inbox' | 'direct' | 'groups' | 'unread' | 'archive' | `folder:${string}`;

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

/** Набор стикеров изменился: по нему клиент перечитывает сам набор. */
interface StickerPackUpdatedPayload {
  packId: string;
  version: number;
  sharedWithUserId?: string;
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
    readAt: receipt.readAt ?? message.readAt ?? new Date().toISOString(),
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
  // 🔥 Видео-гифку в просмотрщик не пускаем: он умеет только картинки, и она
  // открылась бы пустым местом. В пузыре она играет сама, отдельного открытия
  // у неё нет.
  return messages
    .flatMap((message) => message.attachments ?? [])
    .filter(isImageAttachment)
    .filter((attachment) => !isVideoGifAttachment(attachment));
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
  themeControls,
  onLogout,
  onUserUpdated,
  accounts,
  onSwitchAccount,
  onAddAccount,
  onRemoveAccount,
}: MessengerScreenProps) {
  const { t, language } = useLanguage();
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
  const [pollOpen, setPollOpen] = useState(false);
  const [pollBusy, setPollBusy] = useState(false);
  /** Кнопка бота уже нажата и ждёт ответа: второй раз жать нельзя. */
  const [botActionBusy, setBotActionBusy] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  /** Профиль участника группы, открытый из карточки группы. */
  const [memberProfile, setMemberProfile] = useState<User | null>(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [searchMatchIds, setSearchMatchIds] = useState<string[]>([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`yargram:pinned_conversations:${currentUser.id}`);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [recordAudioLevel, setRecordAudioLevel] = useState(0);
  const recordAudioContextRef = useRef<{ context: AudioContext; animId: number } | null>(null);
  const [convContextMenu, setConvContextMenu] = useState<{
    x: number;
    y: number;
    conversation: Conversation;
  } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  /** Админ-панель владельца: отдельное окно, не вкладка в настройках. */
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [ownProfileOpen, setOwnProfileOpen] = useState(false);
  const [peerProfileOpen, setPeerProfileOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [blockedUsersOpen, setBlockedUsersOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  /** Экран настроек — список разделов. Раздел «Мой аккаунт» открывает ProfileModal. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  /** Вход с незнакомого сайта, который владелец ещё не подтвердил. */
  const [sessionAlert, setSessionAlert] = useState<Session | null>(null);

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
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  // 🔥 Стикеры и гифки грузятся вместе со всем остальным: без них пикер был бы
  // пустым на первом экране. Отдельная загрузка по вкладке означала бы пустой
  // список с заглушкой, а это выглядит как поломка.
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [gifs, setGifs] = useState<Attachment[]>([]);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [stickerPacksOpen, setStickerPacksOpen] = useState(false);
  /** Какой набор сейчас перечитывается: на карточке вместо текста — спиннер. */
  const [packBusy, setPackBusy] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(() => new Set());
  const [pinIndex, setPinIndex] = useState(0);
  const [unpinConfirmMessage, setUnpinConfirmMessage] = useState<Message | null>(null);
  const [emojiDocked, setEmojiDocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yargram_emoji_docked') === 'true';
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('yargram_sidebar_width');
      const parsed = saved ? parseInt(saved, 10) : 340;
      return Number.isFinite(parsed) && parsed >= 260 && parsed <= 560 ? parsed : 340;
    } catch {
      return 340;
    }
  });

  const toggleEmojiDock = useCallback(() => {
    setEmojiDocked((curr) => {
      const next = !curr;
      try {
        localStorage.setItem('yargram_emoji_docked', String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(560, Math.max(260, startWidth + delta));
      setSidebarWidth(newWidth);
      try {
        localStorage.setItem('yargram_sidebar_width', String(newWidth));
      } catch {}
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  // Акцент из профиля больше не подменяет --brand вручную: этим занимается
  // тема (withProfileAccent), и подстановка идёт до применения палитры.

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
  /** Зеркало `recording` для эффектов: состояние в deps перезапускало бы их. */
  const recordingRef = useRef(false);
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
  // Эффект сокета зависит только от `currentUser.id`, поэтому свежий профиль
  // (например, только что появившийся флаг заморозки) берём из ссылки.
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
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
  const cancelVoiceRecordingRef = useRef<() => void>(() => {});
  const webRtc = useWebRtcCall(socket, token);
  const { setCurrentUser: setCallCurrentUser } = webRtc;

  useEffect(() => {
    setCallCurrentUser(currentUser);
  }, [currentUser, setCallCurrentUser]);

  useEffect(() => {
    if (browserNotificationsSupported() && Notification.permission === 'default') {
      const onRequest = () => {
        void requestBrowserNotificationPermission();
        window.removeEventListener('click', onRequest);
        window.removeEventListener('keydown', onRequest);
        window.removeEventListener('touchstart', onRequest);
      };
      window.addEventListener('click', onRequest, { once: true, passive: true });
      window.addEventListener('keydown', onRequest, { once: true, passive: true });
      window.addEventListener('touchstart', onRequest, { once: true, passive: true });
      return () => {
        window.removeEventListener('click', onRequest);
        window.removeEventListener('keydown', onRequest);
        window.removeEventListener('touchstart', onRequest);
      };
    }
  }, []);

  /**
   * Язык интерфейса живёт на устройстве, но служебный бот поддержки пишет
   * сообщения **с сервера** — значит, сервер должен знать язык. Сообщаем его
   * аккаунту: смена языка в настройках и вход с другого устройства одинаково
   * доводят бота до дела.
   *
   * Сравниваем с тем, что уже записано в профиле: без этой проверки запрос
   * уходил бы при каждом входе, а профиль при этом не менялся бы вовсе.
   */
  useEffect(() => {
    if (currentUser.language === language) return;
    void api
      .updateProfile(token, { language })
      .then((updated) => onUserUpdated(updated))
      .catch(() => undefined);
  }, [currentUser.language, language, onUserUpdated, token]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  // Фон бывает картинкой и видео, а ссылка у них одна — тип хранится рядом.
  const wallpaperIsVideo = Boolean(currentUser.wallpaperMimeType?.startsWith('video/'));
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
  // Удалённый аккаунт не принимает сообщения: история переписки остаётся,
  // а поле ввода прячем — как в Telegram. Заморозка отправку не закрывает.
  const selectedPeerDeleted = conversationPeerDeleted(selectedConversation, currentUser.id);
  // Замороженному собеседнику тоже не пишем: сервер отвечает 403, поэтому поле
  // ввода закрываем сразу, как и для удалённого.
  const selectedPeerFrozen = conversationPeerFrozen(selectedConversation, currentUser.id);
  // Замороженный аккаунт — только читатель: историю видит, но поле ввода закрыто
  // в любом чате, включая группы и «Избранное».
  const viewerFrozen = Boolean(currentUser.isFrozen);
  const selectedUnavailable = selectedBlockedByMe || selectedPeerDeleted || selectedPeerFrozen;
  const peerTyping = Boolean(selectedPeer && typingUserIds.has(selectedPeer.id));
  // Группа: своя шапка, свои запреты на отправку — права важнее блокировок.
  const selectedIsGroup = isGroup(selectedConversation);
  const canWriteInGroup = !selectedIsGroup || viewerCan(selectedConversation, 'send_messages');
  const canSendMedia = !selectedIsGroup || viewerCan(selectedConversation, 'send_media');
  const canSendLinks = !selectedIsGroup || viewerCan(selectedConversation, 'send_links');
  const canSendPolls = !selectedIsGroup || viewerCan(selectedConversation, 'send_polls');
  const composeBlocked = selectedUnavailable || !canWriteInGroup || viewerFrozen;
  /**
   * Пустая переписка с ботом: под ней встаёт кнопка «СТАРТ».
   *
   * 🔥 Бот не пишет первым — истории нет, значит он ещё не запущен, и вместо
   * «приветствия, которого не просили» человек видит кнопку, как в Telegram.
   * Нажатие отправляет `/start` обычным сообщением.
   *
   * Кнопка живёт ровно до первого сообщения и прячется, как только в поле ввода
   * что-то появилось: нажатие шлёт только команду, черновик при этом ни при чём.
   */
  const botNotStarted =
    Boolean(selectedPeer?.isBot) &&
    !selectedIsGroup &&
    !composeBlocked &&
    messageState === 'ready' &&
    messages.length === 0 &&
    !draft.trim() &&
    draftAttachments.length === 0 &&
    !editingMessage &&
    !replyingTo;
  // Мьют со сроком: вместо общей фразы пишем, до какого времени писать нельзя.
  const muteDeadline = selectedIsGroup
    ? mutedUntilText(selectedConversation?.mutedMembers?.[currentUser.id])
    : '';
  // Запрет ссылок виден сразу: текст со ссылкой отправить нельзя, пока право не выдадут.
  const draftLinkBlocked = selectedIsGroup && !canSendLinks && containsLink(draft);
  const canAttach = !selectedIsGroup || canSendMedia;
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
        setConversationError(readableError(error, t('msgr.loadDialogsFailed')));
        if (!quiet) setConversationState('error');
      }
    },
    [onLogout, t, token],
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
    void api.stickerPacks(token, controller.signal).then(setStickerPacks).catch(() => {});
    void api.gifs(token, controller.signal).then(setGifs).catch(() => {});
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
        const receipt = await api.markRead(token, conversationId);
        mergeReadReceipt(receipt);
        // Прочитали беседу сами — на клиенте тоже гасим кружок, иначе он
        // висит, пока не перезагрузишь страницу (сервер считает unread заново).
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
          ),
        );
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
      // «no longer exists» — аккаунт удалили прямо во время сессии: сервер уже
      // разорвал сокет, выходим и мы. Заморозку сюда не пишем: замороженный
      // должен остаться внутри и читать историю.
      if (/token|auth|jwt|unauthorized|deleted|no longer exists/i.test(error.message)) onLogout(true);
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
            title: peer?.displayName ?? t('msgr.newMessage'),
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
              ? {
                  ...conversation,
                  lastMessage: message,
                  updatedAt: message.createdAt,
                  // Чужое сообщение в неоткрытом чате сразу поднимает счётчик.
                  ...(fromMe || selectedIdRef.current === message.conversationId
                    ? {}
                    : { unreadCount: (conversation.unreadCount ?? 0) + 1 }),
                }
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
      // Про меня самого: владелец мог выдать или снять отметку SCAM, и тогда
      // описание подменяется или возвращается. Без этого шага человек увидел бы
      // новое описание только после перезагрузки.
      if (user.id === currentUser.id) {
        onUserUpdated(mergeUserProfile(currentUserRef.current, user));
      }
      setMessages((current) =>
        current.map((message) => updateMessageProfile(message, user) as Message),
      );
      setConversations((current) =>
        current.map((conversation) => updateConversationProfile(conversation, user)),
      );
    });
    realtimeSocket.on('account:state', (payload: AccountStatePayload) => {
      if (!active || !payload?.userId) return;
      // Про меня самого: удалили — сессия недействительна, выходим. Заморозили —
      // остаёмся внутри в режиме чтения и просто помечаем себя снежинкой.
      if (payload.userId === currentUser.id) {
        if (payload.removed) {
          onLogout(true);
          return;
        }
        const me = currentUserRef.current;
        if (payload.frozen && !me.isFrozen) onUserUpdated({ ...me, isFrozen: true });
        else if (!payload.frozen && me.isFrozen) onUserUpdated({ ...me, isFrozen: false });
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
    // 🔥 Набор прислали или в нём добавили стикер: перечитываем только его.
    // Событие точечное, поэтому всю переписку заново тянуть не нужно — а вот
    // старый список остался бы с прежним `version` и не заметил бы новых картинок.
    realtimeSocket.on('stickerPack:updated', (payload: StickerPackUpdatedPayload) => {
      if (!active || !payload?.packId) return;
      void api.stickerPack(token, payload.packId)
        .then((pack) => setStickerPacks((current) => current.map((item) => (item.id === pack.id ? pack : item))))
        .catch(() => {});
    });

    return () => {
      active = false;
      setSocket((current) => (current === realtimeSocket ? null : current));
      realtimeSocket.disconnect();
    };
  }, [currentUser.id, loadConversations, markRead, mergeReadReceipt, onLogout, onUserUpdated, t, token]);

  // Вход с незнакомого сайта: предупреждаем сразу, как только мессенджер
  // открылся, а также периодически проверяем при активности.
  useEffect(() => {
    let active = true;
    const checkSessions = async () => {
      try {
        const overview = await api.sessions(token);
        if (active && overview.alert) setSessionAlert(overview.alert);
      } catch {
        // Список не открылся — ничего не показываем.
      }
    };
    void checkSessions();
    const interval = setInterval(checkSessions, 30_000);
    const onFocus = () => void checkSessions();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [token]);

  /** «Это был я»: вход подтверждён, окно больше не нужно. */
  const acknowledgeSessionAlert = useCallback(async () => {
    const alert = sessionAlert;
    setSessionAlert(null);
    if (!alert) return;
    try {
      const overview = await api.acknowledgeSession(token, alert.id);
      if (overview?.alert) setSessionAlert(overview.alert);
    } catch {
      // Не подтвердили сейчас — спросим в следующий раз.
    }
  }, [sessionAlert, token]);

  /** «Это не я»: закрываем этот самый сеанс (чужой вход). */
  const terminateSessionAlert = useCallback(async () => {
    const alert = sessionAlert;
    setSessionAlert(null);
    if (alert) {
      try {
        const overview = await api.terminateSession(token, alert.id);
        if (alert.current) {
          onLogout(false);
          return;
        }
        if (overview?.alert) setSessionAlert(overview.alert);
      } catch {
        if (alert.current) onLogout(false);
      }
    }
  }, [onLogout, sessionAlert, token]);

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
          setMessageError(readableError(error, t('msgr.loadMessagesFailed')));
          setMessageState('error');
        }
      }
    },
    [markRead, onLogout, t, token],
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
    // Запись привязана к беседе: уходя в другую, её надо оборвать. Но эффект
    // перезапускается не только от смены беседы, поэтому обрываем лишь тогда,
    // когда запись действительно шла в другой беседе — и говорим об этом, иначе
    // запись пропадала молча и выглядела как «не могу записать».
    if (recordingRef.current && recordConversationRef.current !== selectedId) {
      cancelVoiceRecordingRef.current();
      setNotice(t('msgr.recordingCancelled'));
    }
    if (!selectedId) {
      setMessageState('ready');
      return undefined;
    }
    const controller = new AbortController();
    void loadMessages(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadMessages, selectedId, t]);

  useEffect(() => {
    if (pinIndex >= selectedPins.length) setPinIndex(0);
  }, [pinIndex, selectedPins.length]);

  useEffect(() => {
    const query = chatSearch.trim();
    if (!chatSearchOpen || !selectedId || !query) {
      setSearchMatchIds([]);
      setSearchMatchIndex(0);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api.searchMessages(token, selectedId, query, controller.signal)
        .then((result) => {
          setMessages((current) => sortMessages([
            ...current,
            ...result.items.filter((message) => !current.some((item) => item.id === message.id)),
          ]));
          const ids = result.items.map((item) => item.id);
          setSearchMatchIds(ids);
          setSearchMatchIndex(0);
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
            setMessageError(readableError(error, t('msgr.searchFailed')));
          }
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [chatSearch, chatSearchOpen, selectedId, t, token]);

  function scrollToSearchMatch(index: number) {
    if (searchMatchIds.length === 0) return;
    const clampedIndex = (index + searchMatchIds.length) % searchMatchIds.length;
    setSearchMatchIndex(clampedIndex);
    const targetId = searchMatchIds[clampedIndex];
    if (targetId) {
      const el = document.getElementById(`message-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        pendingScrollMessageRef.current = targetId;
      }
    }
  }

  function goToNextSearchMatch() {
    scrollToSearchMatch(searchMatchIndex + 1);
  }

  function goToPrevSearchMatch() {
    scrollToSearchMatch(searchMatchIndex - 1);
  }

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

  const totalUnreadCount = useMemo(
    () => conversations.reduce((acc, c) => acc + (!c.archived ? (c.unreadCount || 0) : 0), 0),
    [conversations],
  );

  function togglePinConversation(id: string) {
    setPinnedIds((current) => {
      let next: string[];
      if (current.includes(id)) {
        next = current.filter((item) => item !== id);
      } else {
        if (current.length >= 5) {
          setNotice(t('sidebar.pinnedLimit'));
          return current;
        }
        next = [id, ...current];
      }
      try {
        localStorage.setItem(`yargram:pinned_conversations:${currentUser.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const visibleConversations = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('ru-RU');
    const activeFolder = listMode.startsWith('folder:')
      ? folders.find((folder) => folder.id === listMode.slice('folder:'.length))
      : null;

    const filtered = conversations.filter((conversation) => {
      if (listMode === 'archive') {
        if (!conversation.archived) return false;
      } else {
        if (conversation.archived) return false;
        if (listMode === 'direct') {
          if (isGroup(conversation)) return false;
        } else if (listMode === 'groups') {
          if (!isGroup(conversation)) return false;
        } else if (listMode === 'unread') {
          if (!conversation.unreadCount || conversation.unreadCount <= 0) return false;
        } else if (activeFolder) {
          if (!activeFolder.conversationIds.includes(conversation.id)) return false;
        }
      }
      const title = conversationTitle(conversation, currentUser.id, t).toLocaleLowerCase('ru-RU');
      const lastText = conversation.lastMessage?.text?.toLocaleLowerCase('ru-RU') ?? '';
      return !query || title.includes(query) || lastText.includes(query);
    });

    const pinnedSet = new Set(pinnedIds);
    const pinnedList: Conversation[] = [];
    const normalList: Conversation[] = [];
    for (const item of filtered) {
      if (pinnedSet.has(item.id)) pinnedList.push(item);
      else normalList.push(item);
    }
    pinnedList.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    return [...pinnedList, ...normalList];
  }, [conversations, currentUser.id, filter, folders, listMode, pinnedIds, t]);

  function selectConversation(conversation: Conversation) {
    const previousTyping = typingConversationRef.current;
    if (previousTyping && socket?.connected) socket.emit('typing:stop', { conversationId: previousTyping });
    typingConversationRef.current = null;
    setSelectedId(conversation.id);
    // Открыли чат — сразу помечаем прочитанным, чтобы кружок не висел.
    if (document.visibilityState === 'visible') void markRead(conversation.id);
  }

  async function openSavedConversation() {
    try {
      const conversation = await api.savedConversation(token);
      setConversations((current) => uniqueConversations([...current.filter((item) => item.id !== conversation.id), conversation]));
      setListMode(conversation.archived ? 'archive' : 'inbox');
      setFilter('');
      selectConversation(conversation);
    } catch (error) {
      setNotice(readableError(error, t('msgr.openFavoritesFailed')));
    }
  }

  /**
   * Поддержка: сервер находит или заводит переписку с ботом. Приветствия при
   * этом **не** приходит — бот не пишет первым: под пустой перепиской встаёт
   * кнопка «СТАРТ», и меню уходит только после неё.
   */
  async function openSupportConversation() {
    try {
      const conversation = await api.openSupport(token);
      setConversations((current) => uniqueConversations([...current.filter((item) => item.id !== conversation.id), conversation]));
      setListMode(conversation.archived ? 'archive' : 'inbox');
      setFilter('');
      selectConversation(conversation);
    } catch (error) {
      setNotice(readableError(error, t('msgr.openSupportFailed')));
    }
  }

  /**
   * Нажатие кнопки бота. Код действия уходит отдельным запросом, а не
   * сообщением: в истории не остаётся служебных «нажатий». Ответ бота придёт
   * по сокету, как обычное новое сообщение.
   */
  async function pressBotButton(conversationId: string, action: string) {
    if (botActionBusy) return;
    setBotActionBusy(true);
    try {
      await api.sendSupportAction(token, conversationId, action);
    } catch (error) {
      setNotice(readableError(error, t('msgr.supportActionFailed')));
    } finally {
      setBotActionBusy(false);
    }
  }

  function handleCreatedConversation(conversation: Conversation) {
    setConversations((current) => uniqueConversations([conversation, ...current]));
    setSelectedId(conversation.id);
    setSearchOpen(false);
    setGroupCreateOpen(false);
  }

  /** Обновлённая группа пришла с сервера: заменяем запись, не трогая порядок. */
  function handleGroupUpdated(conversation: Conversation) {
    setConversations((current) =>
      uniqueConversations(current.map((item) => (item.id === conversation.id ? { ...item, ...conversation } : item))),
    );
  }

  const joinGroupByCode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      api
        .joinGroup(token, code)
        .then((conversation) => {
          setConversations((current) =>
            uniqueConversations([conversation, ...current.filter((item) => item.id !== conversation.id)]),
          );
          setSelectedId(conversation.id);
          setNotice(t('msgr.joinedGroup', { title: groupTitle(conversation) }));
        })
        .catch((reason: unknown) => {
          setNotice(readableError(reason, t('msgr.inviteInvalid')));
        });
    },
    [t, token],
  );

  // Ссылка-приглашение вида /join/<код>: вступаем в группу и сразу её открываем.
  useEffect(() => {
    const match = /^(?:\/app)?\/join\/([^/?#]+)\/?$/.exec(window.location.pathname);
    if (!match) return undefined;
    // Адрес чистим сразу: остаёмся в веб-приложении (/app) без повторного вступления при перезагрузке.
    window.history.replaceState(null, '', '/app');
    joinGroupByCode(decodeURIComponent(match[1] ?? ''));
  }, [joinGroupByCode]);

  // Внутренняя навигация без перезагрузки: клик по ссылке-приглашению или ссылке на главную в чате
  useEffect(() => {
    const handleJoinEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ code?: string }>;
      if (customEvent.detail?.code) {
        joinGroupByCode(customEvent.detail.code);
      }
    };
    const handleNavigateHome = () => {
      setSelectedId(null);
    };

    window.addEventListener('yargram:join-group', handleJoinEvent);
    window.addEventListener('yargram:navigate-home', handleNavigateHome);
    return () => {
      window.removeEventListener('yargram:join-group', handleJoinEvent);
      window.removeEventListener('yargram:navigate-home', handleNavigateHome);
    };
  }, [joinGroupByCode]);

  /** Из профиля участника группы открываем личный диалог с ним. */
  async function openDirectWith(user: User) {
    setMemberProfile(null);
    setGroupInfoOpen(false);
    try {
      const conversation = await api.createDirect(token, user.id);
      setConversations((current) =>
        uniqueConversations([
          { ...conversation, otherUser: conversation.otherUser ?? user },
          ...current.filter((item) => item.id !== conversation.id),
        ]),
      );
      setListMode('inbox');
      setFilter('');
      setSelectedId(conversation.id);
    } catch (error) {
      setNotice(readableError(error, t('msgr.openDialogFailed')));
    }
  }

  /** Я вышел из группы: беседа исчезает из списка, как и у остальных участников. */
  function handleGroupLeft(conversationId: string) {
    setGroupInfoOpen(false);
    setConversations((current) => current.filter((item) => item.id !== conversationId));
    setSelectedId((current) => (current === conversationId ? null : current));
    setNotice(t('msgr.leftGroup'));
  }

  // Маршрутизация действий из боковой панели в стиле Telegram Desktop.
  function handleSidebarAction(action: SidebarAction) {
    setSidebarOpen(false);
    switch (action) {
      case 'profile':
        setOwnProfileOpen(true);
        return;
      case 'create-group':
        setGroupCreateOpen(true);
        return;
      case 'create-channel':
      case 'calls':
        // Каналы и звонки — следующие в очереди, пока мягкая подсказка.
        setNotice(t('sidebar.sectionLater'));
        return;
      case 'blocked':
        setBlockedUsersOpen(true);
        return;
      case 'friends':
        setFriendsOpen(true);
        return;
      case 'favorites':
        void openSavedConversation();
        return;
      case 'favorites-notes':
        setNotesOpen(true);
        return;
      case 'settings':
        setSettingsOpen(true);
        return;
      case 'support':
        void openSupportConversation();
        return;
      case 'admin':
        setAdminPanelOpen(true);
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
        error: readableError(error, t('msgr.uploadFailed')),
      });
    } finally {
      uploadControllersRef.current.delete(item.localId);
    }
  }

  function queueDraftFiles(files: File[]) {
    if (files.length === 0) return;
    const freeSlots = Math.max(0, 10 - draftAttachments.length);
    if (freeSlots === 0) {
      setNotice(t('msgr.tooManyFiles'));
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
    if (files.length > freeSlots) setNotice(t('msgr.extraFilesSkipped'));
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

  /**
   * Отправка сообщения.
   *
   * `overrideText` — текст, который шлёт не поле ввода, а кнопка: так уходит
   * `/start`, когда человек нажал «СТАРТ» под пустой перепиской с ботом. Кнопка
   * показывается только при пустом поле ввода и без вложений, поэтому черновик
   * и вложения здесь ни при чём — но на всякий случай текст из поля не трогаем.
   */
  async function sendMessage(event?: FormEvent, overrideText?: string) {
    event?.preventDefault();
    const text = (overrideText ?? draft).trim();
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
        setMessageError(readableError(error, t('msgr.editMessageFailed')));
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
      return;
    }

    if (draftAttachments.some((item) => item.status === 'uploading' || item.status === 'ready')) {
      setNotice(t('msgr.waitUpload'));
      return;
    }
    if (draftAttachments.some((item) => item.status === 'error')) {
      setNotice(t('msgr.retryOrRemoveFiles'));
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
              ? { ...conversation, lastMessage: message, updatedAt: message.createdAt, unreadCount: 0 }
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
      setMessageError(readableError(error, t('msgr.messageNotSent')));
      setReplyingTo(null);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  /**
   * Отправить стикер.
   *
   * 🔥 Стикер — это не вложение, а ссылка на картинку, поэтому он уходит
   * отдельным полем, а не среди файлов. У встроенных стикеров вложения вообще
   * нет (это файлы сборки), а у пользовательских оно своё и может быть удалено
   * вместе со стикером, — ссылка на файл протухала бы прямо в истории.
   */
  async function sendSticker(sticker: Sticker) {
    const conversationId = selectedId;
    if (!conversationId || sending || selectedBlockedByMe) return;
    const replyTarget = replyingTo;
    setSending(true);
    setMessageError('');
    try {
      const message = await api.sendRichMessage(token, conversationId, {
        stickerIds: [sticker.id],
        ...(replyTarget ? { replyToId: replyTarget.id } : {}),
      });
      setMessages((current) => upsertMessage(current, message));
      setConversations((current) =>
        uniqueConversations(
          current.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, lastMessage: message, updatedAt: message.createdAt, unreadCount: 0 }
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
      setMessageError(readableError(error, t('msgr.messageNotSent')));
    } finally {
      setSending(false);
    }
  }

  /** Гифка отправляется как картинка-вложение: на сервере у неё `kind=gif`. */
  async function sendGif(gif: Attachment) {
    await sendAttachments([gif]);
  }

  /**
   * Поставить присланный набор себе — или убрать его.
   *
   * 🔥 Присланный набор появляется у получателя сразу, отдельная кнопка нужна
   * только чтобы отказаться от него. Поэтому здесь нет подтверждения: удаление
   * набора обратимо — его снова можно добавить из истории переписки.
   */
  async function installSharedPack(packId: string, install: boolean) {
    if (packBusy) return;
    setPackBusy(packId);
    try {
      let title = '';
      if (install) {
        const pack = await api.installStickerPack(token, packId);
        title = pack.title;
        setStickerPacks((current) => current.filter((item) => item.id !== packId).concat(pack));
      } else {
        // Убираем набор из списка: сервер больше про него ничего не знает, а
        // заголовок нужен только для сообщения, поэтому берём его заранее.
        title = stickerPacks.find((pack) => pack.id === packId)?.title ?? '';
        await api.uninstallStickerPack(token, packId);
        setStickerPacks((current) => current.filter((item) => item.id !== packId));
      }
      setNotice(
        install
          ? t('stickers.packSharedNotice', { title })
          : t('stickers.packRemoved', { title }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onLogout(true);
        return;
      }
      setMessageError(readableError(error, t('stickers.packActionFailed')));
    } finally {
      setPackBusy('');
    }
  }

  /**
   * Сохранить чужой стикер себе.
   *
   * Файл лежит на сервере, поэтому сохранить его — значит загрузить заново: у
   * клиента нет доступа к файлу без подписи, а подпись недолговечна. Встроенные
   * стикеры не предлагаем — они и так есть у всех.
   */
  async function saveStickerToPack(sticker: Sticker) {
    try {
      const own = stickerPacks.find((pack) => pack.mine);
      if (!own) {
        setNotice(t('stickers.needOwnPackFirst'));
        setStickerPacksOpen(true);
        return;
      }
      const response = await fetch(sticker.url);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const name = `${sticker.id}${sticker.url.includes('.webp') ? '.webp' : '.png'}`;
      const uploaded = await api.upload(token, new File([blob], name, { type: blob.type }), 'sticker');
      const pack = await api.addStickerToPack(token, own.id, uploaded.id, sticker.emoji);
      setStickerPacks((current) => current.map((item) => (item.id === pack.id ? pack : item)));
      setNotice(t('stickers.stickerSaved', { title: own.title }));
    } catch {
      setMessageError(readableError(new Error('STICKER_SAVE_FAILED'), t('stickers.stickerSaveFailed')));
    }
  }

  /** Отправка готовых вложений без ленты в поле ввода — как гифки из библиотеки. */
  async function sendAttachments(attachments: Attachment[]) {
    const conversationId = selectedId;
    if (!conversationId || sending || selectedBlockedByMe) return;
    const replyTarget = replyingTo;
    setSending(true);
    setMessageError('');
    try {
      const message = await api.sendRichMessage(token, conversationId, {
        attachmentIds: attachments.map((attachment) => attachment.id),
        ...(replyTarget ? { replyToId: replyTarget.id } : {}),
      });
      setMessages((current) => upsertMessage(current, message));
      setConversations((current) =>
        uniqueConversations(
          current.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, lastMessage: message, updatedAt: message.createdAt, unreadCount: 0 }
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
      setMessageError(readableError(error, t('msgr.messageNotSent')));
    } finally {
      setSending(false);
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
      else setMessageError(readableError(error, t('msgr.resendFailed')));
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
      setMessageError(readableError(error, t('msgr.pinChangeFailed')));
    }
  }

  /** Кто есть кто в опросе: имена голосовавших берём из переписки и состава. */
  const pollVoters = useMemo(() => {
    const map = new Map<string, User>();
    for (const message of messages) {
      if (message.sender) map.set(message.sender.id, message.sender);
    }
    for (const participant of selectedConversation?.members ?? []) {
      const id = participant.user?.id ?? participant.userId ?? participant.id;
      if (!id) continue;
      const known = map.get(id);
      map.set(id, {
        ...(known ?? { id, displayName: '' }),
        displayName: participant.displayName ?? known?.displayName ?? '',
        ...(participant.user ?? {}),
      });
    }
    return map;
  }, [messages, selectedConversation]);

  /** Опрос изменился: обновляем сообщение и в переписке, и в списке чатов. */
  function applyPollMessage(updated: Message) {
    setMessages((current) => updateMessageReferences(current, updated));
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === updated.conversationId
          ? updateConversationMessage(conversation, updated)
          : conversation,
      ),
    );
  }

  async function createPoll(draft: PollDraft) {
    if (!selectedConversation) return;
    setPollBusy(true);
    try {
      const created = await api.createPoll(token, selectedConversation.id, {
        question: draft.question,
        description: draft.description,
        options: draft.options,
        // Правильные варианты отмечены по индексу — сервер выдаст им id.
        settings: { ...draft.settings, correctOptionIds: [] },
      });
      setPollOpen(false);
      setMessages((current) => [...current, created]);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === created.conversationId
            ? updateConversationMessage(conversation, created)
            : conversation,
        ),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, t('msgr.pollCreateFailed')));
    } finally {
      setPollBusy(false);
    }
  }

  /** Голос, свой вариант и остановка опроса идут одним путём. */
  async function runPollAction(action: () => Promise<Message>, failure: string) {
    setPollBusy(true);
    try {
      applyPollMessage(await action());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, failure));
    } finally {
      setPollBusy(false);
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
      else setMessageError(readableError(error, t('msgr.reactionFailed')));
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
      setNotice(favorite ? t('msgr.removedFromFavorites') : t('msgr.addedToFavorites'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, t('msgr.favoriteFailed')));
    }
  }

  async function copyMessage(message: Message) {
    setMessageActionId(null);
    if (!message.text) {
      setNotice(t('msgr.noTextToCopy'));
      return;
    }
    try {
      await navigator.clipboard.writeText(message.text);
      setNotice(t('msgr.textCopied'));
    } catch {
      const field = document.createElement('textarea');
      field.value = message.text;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      setNotice(copied ? t('msgr.textCopied') : t('msgr.copyFailed'));
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
      setNotice(t('msgr.folderCreated', { name: folder.name }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, t('msgr.folderCreateFailed')));
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
          ? t('msgr.dialogRemovedFromFolder', { name: updated.name })
          : t('msgr.dialogAddedToFolder', { name: updated.name }),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, t('msgr.folderUpdateFailed')));
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
      setNotice(t('msgr.folderRenamed', { name: updated.name }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, t('msgr.folderRenameFailed')));
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
      setNotice(t('msgr.folderDeleted', { name: folder.name }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, t('msgr.folderDeleteFailed')));
    } finally {
      setFolderBusy(false);
      setFolderDeleteConfirm(false);
    }
  }

  function openSchedulePicker() {
    if (!selectedId || selectedUnavailable || sending) return;
    if (editingMessage) {
      setNotice(t('msgr.onlyNewCanSchedule'));
      return;
    }
    const text = draft.trim();
    const attachments = draftAttachments.flatMap((item) => (item.uploaded ? [item.uploaded] : []));
    if (!text && attachments.length === 0) {
      setNotice(t('msgr.writeToSchedule'));
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
      setNotice(t('msgr.scheduledFor', { time: formatScheduleTime(scheduled.sendAt) }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, t('msgr.scheduleFailed')));
    } finally {
      setScheduleBusy(false);
    }
  }

  async function cancelScheduled(scheduledId: string) {
    try {
      const cancelled = await api.cancelScheduledMessage(token, scheduledId);
      setScheduledMessages((current) => upsertScheduledMessage(current, cancelled));
      setNotice(t('msgr.scheduledCancelled'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setNotice(readableError(error, t('msgr.scheduleCancelFailed')));
    }
  }

  // NEW_CLIENT_HELPERS

  async function updateConversationSettings(
    conversationId: string,
    input: { archived?: boolean; mutedUntil?: string | null },
    successMessage: string,
  ) {
    try {
      const updated = await api.updateConversationSettings(token, conversationId, input);
      setConversations((current) => uniqueConversations(current.map((conversation) =>
        conversation.id === updated.id ? { ...conversation, ...updated } : conversation,
      )));
      setNotice(successMessage);
      if (input.archived === true && selectedId === conversationId) setSelectedId(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout(true);
      else setMessageError(readableError(error, t('msgr.dialogSettingsFailed')));
    }
  }

  async function updateSelectedConversationSettings(
    input: { archived?: boolean; mutedUntil?: string | null },
    successMessage: string,
  ) {
    if (!selectedId) return;
    setChatMenuOpen(false);
    await updateConversationSettings(selectedId, input, successMessage);
  }

  function muteFor(milliseconds: number | 'forever') {
    const mutedUntil = milliseconds === 'forever'
      ? '9999-12-31T23:59:59.999Z'
      : new Date(Date.now() + milliseconds).toISOString();
    void updateSelectedConversationSettings(
      { mutedUntil },
      milliseconds === 'forever' ? t('msgr.notificationsOffForever') : t('msgr.notificationsOffTemp'),
    );
  }

  function startAudioVisualizer(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      let animId = 0;
      const tick = () => {
        if (!voiceActiveRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / (dataArray.length || 1);
        const level = Math.min(1, Math.max(0, avg / 90));
        setRecordAudioLevel(level);
        animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
      recordAudioContextRef.current = { context, animId };
    } catch {
      // AudioContext may fail in restricted/mock environments
    }
  }

  function stopAudioVisualizer() {
    if (recordAudioContextRef.current) {
      const { context, animId } = recordAudioContextRef.current;
      cancelAnimationFrame(animId);
      try { void context.close(); } catch {}
      recordAudioContextRef.current = null;
    }
    setRecordAudioLevel(0);
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
    if (!window.confirm(t('msgr.confirmDeleteMessage'))) return;
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
      setMessageError(readableError(error, t('msgr.deleteMessageFailed')));
    }
  }

  function applyComposerFormat(format: FormatType) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const result = applyFormatting(draft, start, end, format);
    handleDraftChange(result.text);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
      }
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
      return;
    }

    const isMod = event.ctrlKey || event.metaKey;
    if (isMod) {
      const code = event.code;
      if (!event.shiftKey && code === 'KeyB') {
        event.preventDefault();
        applyComposerFormat('bold');
      } else if (!event.shiftKey && code === 'KeyI') {
        event.preventDefault();
        applyComposerFormat('italic');
      } else if (!event.shiftKey && code === 'KeyU') {
        event.preventDefault();
        applyComposerFormat('underline');
      } else if (event.shiftKey && code === 'KeyX') {
        event.preventDefault();
        applyComposerFormat('strike');
      } else if (event.shiftKey && (code === 'KeyC' || code === 'KeyM')) {
        event.preventDefault();
        applyComposerFormat('code');
      } else if (event.shiftKey && (code === 'KeyQ' || code === 'Digit9')) {
        event.preventDefault();
        applyComposerFormat('quote');
      }
    }
  }

  const VOICE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

  async function startVoiceRecording() {
    if (!selectedId || selectedBlockedByMe || sending || recording || recordPending || editingMessage) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setNotice(t('msgr.voiceHttpsOnly'));
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
            setNotice(t('msgr.recordSizeLimit'));
            stopVoiceRecording();
          }
        }
      };
      recorder.onstop = () => void finalizeVoiceRecording();
      recordStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      voiceActiveRef.current = true;
      recordingRef.current = true;
      setRecording(true);
      setRecordPreview(recordMode === 'video_circle' ? stream : null);
      setRecordingSeconds(0);
      startAudioVisualizer(stream);
      recorder.start(250);
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStartedAtRef.current) / 1_000);
        setRecordingSeconds(elapsed);
        if (recordModeRef.current === 'video_circle' && elapsed >= 60) stopVoiceRecording();
      }, 250);
    } catch {
      if (requestId === recordingRequestRef.current) {
        cancelVoiceRecording();
        setNotice(t('msgr.recordStartFailed'));
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
    stopAudioVisualizer();
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
    recordingRef.current = false;
    setRecording(false);
    setRecordingSeconds(0);
  }
  cancelVoiceRecordingRef.current = cancelVoiceRecording;

  async function finalizeVoiceRecording() {
    stopAudioVisualizer();
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
    recordingRef.current = false;
    setRecording(false);
    setRecordingSeconds(0);
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    let blob = new Blob(recordChunksRef.current, { type: recordMimeRef.current });
    recordChunksRef.current = [];
    if (!conversationId || selectedIdRef.current !== conversationId) {
      // Беседа сменилась, пока писалось. Молчаливое «ничего не произошло»
      // читалось как поломка записи — объясняем, почему её нет.
      setNotice(t('msgr.recordingCancelled'));
      return;
    }
    if (blob.size > 100 * 1024 * 1024) {
      setNotice(t('msgr.recordTooBig'));
      return;
    }
    if (durationSeconds < 1 || blob.size === 0) {
      setNotice(t('msgr.recordTooShort'));
      return;
    }
    setSending(true);
    setMessageError('');
    try {
      if (blob.type.includes('webm')) {
        try {
          blob = await fixWebmDuration(blob, durationMs, { logger: false });
        } catch {
          // Fallback to original blob if WebM duration patching throws
        }
      }
      if (requestId !== recordingRequestRef.current || selectedIdRef.current !== conversationId) {
        setNotice(t('msgr.recordingCancelled'));
        return;
      }
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const uploaded = await api.upload(
        token,
        new File([blob], `${mode === 'video_circle' ? t('msgr.videoCircleName') : t('msgr.voiceMessageName')} (${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}).${extension}`, { type: blob.type }),
        'file',
        { mediaKind: mode, durationSeconds },
      );
      if (requestId !== recordingRequestRef.current || selectedIdRef.current !== conversationId) {
        setNotice(t('msgr.recordingCancelled'));
        return;
      }
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
      setMessageError(readableError(error, t('msgr.voiceNotSent')));
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
            <p className="text-lg font-semibold">{t('msgr.dropToAttach')}</p>
            <p className="text-sm text-muted">{t('msgr.dropHint')}</p>
          </div>
        </div>
      )}
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface">
        {viewerFrozen && (
          <div
            role="status"
            className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-brand-soft px-4 py-2 text-center text-xs font-medium text-brand"
          >
            <Snowflake className="h-4 w-4 shrink-0" aria-hidden="true" />
            Аккаунт заморожен — доступен только просмотр. Отправка сообщений, звонки и изменения
            недоступны.
          </div>
        )}
        <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <aside
          className={`${selectedId ? 'hidden md:flex' : 'flex'} chat-sidebar w-full shrink-0 flex-col border-line bg-surface md:w-[var(--sidebar-width)] md:border-r`}
          style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
          aria-label={t('msgr.dialogListAria')}
        >
          <header className="shrink-0 border-b border-line px-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-2">
            <div className="flex items-center justify-between gap-3">
              {/*
                Значок Yargram в шапке списка чатов — ссылка на лендинг (`/`).
                Полная навигация (не router), чтобы пользователь оказывался на
                сайте Yargram, а не внутри SPA веб-версии. Сессия в localStorage
                сохраняется, обратно в /app можно вернуться без повторного входа.
              */}
              <Logo href="/" title={t('brand.openSite')} />
              <div className="flex items-center gap-1">
                <IconButton
                  label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
                  onClick={onToggleTheme}
                >
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </IconButton>
                <IconButton
                  label={t('sidebar.mainMenu')}
                  aria-expanded={sidebarOpen}
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </IconButton>
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">{t('msgr.searchDialogs')}</span>
                <Search className="pointer-events-none absolute left-3.5 top-3 h-4.5 w-4.5 text-muted" />
                <input
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="h-11 w-full rounded-full border border-transparent bg-canvas pl-10 pr-9 text-sm outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
                  placeholder={t('common.search')}
                />
                {filter && (
                  <button
                    type="button"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-line/60"
                    onClick={() => setFilter('')}
                    aria-label={t('msgr.clearSearch')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <IconButton
                label={t('msgr.newDialog')}
                className="h-11 w-11 bg-brand text-white rounded-full hover:bg-brand-strong hover:text-white"
                onClick={() => setSearchOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="mt-1 flex items-stretch gap-1 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${listMode === 'inbox' ? 'border-brand bg-brand-soft text-brand' : 'border-transparent text-muted hover:bg-canvas hover:text-ink'}`}
                onClick={() => setListMode('inbox')}
              >
                <MessageCircleMore className="mr-1 inline h-3.5 w-3.5" /> {t('sidebar.filterAll')}
              </button>
              <button
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${listMode === 'direct' ? 'border-brand bg-brand-soft text-brand' : 'border-transparent text-muted hover:bg-canvas hover:text-ink'}`}
                onClick={() => setListMode('direct')}
              >
                <UserRound className="mr-1 inline h-3.5 w-3.5" /> {t('sidebar.filterDirect')}
              </button>
              <button
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${listMode === 'groups' ? 'border-brand bg-brand-soft text-brand' : 'border-transparent text-muted hover:bg-canvas hover:text-ink'}`}
                onClick={() => setListMode('groups')}
              >
                <UsersRound className="mr-1 inline h-3.5 w-3.5" /> {t('sidebar.filterGroups')}
              </button>
              <button
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${listMode === 'unread' ? 'border-brand bg-brand-soft text-brand' : 'border-transparent text-muted hover:bg-canvas hover:text-ink'}`}
                onClick={() => setListMode('unread')}
              >
                {t('sidebar.filterUnread')}
                {totalUnreadCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-brand px-1.5 py-0.2 text-[10px] font-bold text-white">
                    {unreadBadgeText(totalUnreadCount)}
                  </span>
                )}
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
                <FolderArchive className="mr-1 inline h-3.5 w-3.5" /> {t('sidebar.archive')}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-full border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand"
                onClick={() => setFolderCreateOpen(true)}
                aria-label={t('msgr.createFolder')}
              >
                <FolderPlus className="inline h-3.5 w-3.5" />
              </button>
            </div>
          </header>
          <div className="md:hidden">
            <FloatingAudioBar />
          </div>

          {folderCreateOpen && (
            <div className="mx-3 mt-2 flex items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2">
              <Folder className="h-4 w-4 shrink-0 text-brand" />
              <input
                autoFocus
                value={folderName}
                maxLength={40}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={t('msgr.folderNamePlaceholder')}
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
                label={t('msgr.saveFolder')}
                className="h-8 w-8"
                disabled={!folderName.trim() || folderBusy}
                onClick={() => void createFolder()}
              >
                <Check className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={t('common.cancel')}
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
                  <h2 className="mt-5 text-lg font-semibold">{t('msgr.startConversation')}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">{t('msgr.startConversationHint')}</p>
                  <Button className="mt-5" onClick={() => setSearchOpen(true)}>
                    <Plus className="h-4 w-4" /> Новый диалог
                  </Button>
                </div>
              </div>
            )}
            {conversationState === 'ready' && conversations.length > 0 && visibleConversations.length === 0 && (
              <div className="px-8 py-16 text-center">
                <p className="font-semibold">{listMode === 'archive' && !filter ? t('msgr.archiveEmpty') : t('msgr.nothingFound')}</p>
                <p className="mt-1 text-sm text-muted">{listMode === 'archive' && !filter ? t('msgr.archiveEmptyHint') : t('msgr.changeQueryHint')}</p>
              </div>
            )}
            {conversationState === 'ready' && visibleConversations.length > 0 && (
              <ul>
                {visibleConversations.map((conversation) => {
                  const group = isGroup(conversation);
                  const title = group ? groupTitle(conversation) : conversationTitle(conversation, currentUser.id, t);
                  const peer = group ? null : getConversationPeer(conversation, currentUser.id);
                  const active = selectedId === conversation.id;
                  const isPinned = pinnedIds.includes(conversation.id);
                  const unread = unreadBadgeText(conversation.unreadCount ?? 0);
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        className={`flex min-h-[76px] w-full items-center gap-3 px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${active ? 'bg-brand text-white' : 'hover:bg-canvas'}`}
                        aria-current={active ? 'true' : undefined}
                        onClick={() => selectConversation(conversation)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setConvContextMenu({ x: event.clientX, y: event.clientY, conversation });
                        }}
                      >
                        {conversation.type === 'saved' ? <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Bookmark className="h-6 w-6" /></span> : <Avatar
                          name={title}
                          src={conversationAvatar(conversation, currentUser.id)}
                          size="md"
                          online={peer && !conversation.blockedByPeer ? isUserOnline(peer) : undefined}
                          {...(group ? { seed: conversation.id } : avatarProps(peer, title))}
                        />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1">
                                {isPinned && (
                                  <Pin className={`h-3 w-3 shrink-0 rotate-45 ${active ? 'text-white/80' : 'text-brand'}`} />
                                )}
                                {conversationIsMuted(conversation) && <BellOff className="h-3.5 w-3.5 shrink-0" />}
                                <UserName
                                  className="text-sm font-semibold"
                                  name={title}
                                  user={group ? conversation : peer}
                                  subject={group ? 'group' : 'account'}
                                />
                              </span>
                            </span>
                            <span className={`shrink-0 text-[11px] ${active ? 'text-white/70' : 'text-muted'}`}>
                              {formatConversationTime(conversationTimestamp(conversation))}
                            </span>
                          </span>
                          <span className={`mt-1 flex items-center gap-1 truncate text-[13px] ${active ? 'text-white/75' : 'text-muted'}`}>
                            <span className="truncate">{messageSummary(conversation.lastMessage)}</span>
                          </span>
                        </span>
                        {/* Круглый счётчик: серый, если уведомления чата выключены. */}
                        {unread && (
                          <span
                            className={`grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-white ${conversationIsMuted(conversation) ? 'bg-[#8b93a7]' : 'bg-brand'}`}
                            aria-label={t('msgr.unreadCount', { count: unread })}
                          >
                            {unread}
                          </span>
                        )}
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
              {socketState === 'connected' ? t('msgr.connected') : socketState === 'connecting' ? t('msgr.connecting') : t('msgr.noRealtime')}
            </span>
            <span>Yargram 0.1</span>
          </footer>
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину списка чатов"
          onMouseDown={handleSidebarResizeStart}
          onDoubleClick={() => {
            setSidebarWidth(340);
            try { localStorage.setItem('yargram_sidebar_width', '340'); } catch {}
          }}
          className="hidden md:flex w-1.5 shrink-0 cursor-col-resize select-none items-center justify-center bg-transparent transition hover:bg-brand/40 active:bg-brand z-10 -ml-1"
          title="Потяните для изменения ширины списка (двойной клик — сброс)"
        />

        <section
          className={`chat-panel chat-wallpaper ${selectedId ? 'flex' : 'hidden md:flex'} relative isolate min-w-0 flex-1 flex-col`}
          style={
            // Видео рисуем отдельным слоем: фоновая картинка его не заменит.
            wallpaperIsVideo || !currentUser.wallpaperUrl
              ? undefined
              : {
                  backgroundImage: `url(${currentUser.wallpaperUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
          }
          aria-label={t('msgr.correspondence')}
        >
          {/* Живой фон: слой под перепиской, нажатия не перехватывает. */}
          {wallpaperIsVideo && currentUser.wallpaperUrl && (
            <DecorativeVideo
              src={currentUser.wallpaperUrl}
              className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
            />
          )}
          {!selectedConversation ? (
            <div className="grid h-full place-items-center px-8 text-center">
              <div className="max-w-sm animate-fade-in">
                <span className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] bg-brand-soft text-brand shadow-sm">
                  <MessageCircleMore className="h-11 w-11" />
                </span>
                <h1 className="mt-6 text-2xl font-black tracking-[-0.035em]">{t('msgr.yourMessages')}</h1>
                <p className="mt-2 text-sm leading-6 text-muted">{t('msgr.chooseDialogHint')}</p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex min-h-[60px] shrink-0 items-center gap-1 border-b border-line bg-surface px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-2 sm:px-4">
                <IconButton label={t('msgr.backToDialogs')} className="md:hidden" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="h-5 w-5" />
                </IconButton>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => (selectedIsGroup ? setGroupInfoOpen(true) : selectedPeer && setPeerProfileOpen(true))}
                  disabled={!selectedPeer && !selectedIsGroup}
                  title={
                    selectedIsGroup
                      ? t('msgr.groupInfo')
                      : selectedPeer
                        ? t('msgr.openPeerProfile')
                        : t('msgr.yourSpace')
                  }
                >
                  {selectedConversation.type === 'saved' ? <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Bookmark className="h-5 w-5" /></span> : <Avatar
                    name={selectedIsGroup ? groupTitle(selectedConversation) : conversationTitle(selectedConversation, currentUser.id, t)}
                    src={conversationAvatar(selectedConversation, currentUser.id)}
                    size="sm"
                    online={!selectedIsGroup && selectedPeer && !selectedBlockedByPeer ? isUserOnline(selectedPeer) : undefined}
                    {...(selectedIsGroup
                      ? { seed: selectedConversation.id }
                      : avatarProps(selectedPeer, conversationTitle(selectedConversation, currentUser.id, t)))}
                  />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold sm:text-[15px]">
                      {selectedIsGroup ? (
                        <UserName
                          name={groupTitle(selectedConversation)}
                          user={selectedConversation}
                          subject="group"
                        />
                      ) : (
                        <UserName
                          name={conversationTitle(selectedConversation, currentUser.id, t)}
                          user={selectedPeer}
                        />
                      )}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-xs ${
                        peerTyping || (!selectedIsGroup && isUserOnline(selectedPeer))
                          ? 'font-semibold text-brand'
                          : 'text-muted'
                      }`}
                    >
                      {selectedIsGroup
                        ? groupSubtitle(selectedConversation)
                        : peerTyping
                          ? t('msgr.typing')
                          : selectedPeer
                            ? formatLastSeen(selectedPeer, t)
                            : selectedConversation.type === 'saved'
                              ? t('msgr.selfNotes')
                              : t('msgr.privateDialog')}
                    </span>
                  </span>
                </button>
                <IconButton
                  label={t('msgr.searchInChat')}
                  className={chatSearchOpen ? 'bg-brand-soft text-brand' : ''}
                  onClick={() => setChatSearchOpen((open) => !open)}
                >
                  <Search className="h-5 w-5" />
                </IconButton>
                {/* В группах и с ботами звонков нет: они остаются личными для пользователей. */}
                {selectedPeer && !selectedIsGroup && !selectedPeer.isBot && <><IconButton
                  label={t('msgr.audioCall')}
                  disabled={!selectedPeer || socketState !== 'connected' || selectedBlocked || selectedPeerFrozen || viewerFrozen}
                  onClick={() =>
                    selectedPeer &&
                    void webRtc.startCall(selectedConversation.id, selectedPeer, 'audio')
                  }
                >
                  <Phone className="h-5 w-5" />
                </IconButton>
                <IconButton
                  label={t('msgr.videoCall')}
                  disabled={!selectedPeer || socketState !== 'connected' || selectedBlocked || selectedPeerDeleted || selectedPeerFrozen || viewerFrozen}
                  onClick={() =>
                    selectedPeer &&
                    void webRtc.startCall(selectedConversation.id, selectedPeer, 'video')
                  }
                >
                  <Video className="h-5 w-5" />
                </IconButton></>}
                {selectedConversation.type !== 'saved' && <div className="relative">
                  <IconButton
                    label={t('msgr.dialogSettings')}
                    aria-expanded={chatMenuOpen}
                    onClick={() => setChatMenuOpen((open) => !open)}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </IconButton>
                  {chatMenuOpen && (
                    <div className="absolute right-0 top-full z-40 w-64 animate-fade-in rounded-2xl border border-line bg-elevated p-2 shadow-float">
                      {selectedIsGroup ? (
                        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setChatMenuOpen(false); setGroupInfoOpen(true); }}>
                          <UsersRound className="h-4 w-4 text-brand" /> {t('msgr.groupInfo')}
                        </button>
                      ) : (
                        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setChatMenuOpen(false); setPeerProfileOpen(true); }}>
                          <UserRound className="h-4 w-4 text-brand" /> {t('msgr.peerProfile')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55"
                        onClick={() => {
                          togglePinConversation(selectedConversation.id);
                          setChatMenuOpen(false);
                        }}
                      >
                        {pinnedIds.includes(selectedConversation.id) ? (
                          <>
                            <PinOff className="h-4 w-4 text-brand" /> {t('sidebar.unpinChat')}
                          </>
                        ) : (
                          <>
                            <Pin className="h-4 w-4 text-brand" /> {t('sidebar.pinChat')}
                          </>
                        )}
                      </button>
                      <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void updateSelectedConversationSettings({ archived: !selectedConversation.archived }, selectedConversation.archived ? t('msgr.dialogReturnedFromArchive') : t('msgr.dialogArchived'))}>
                        {selectedConversation.archived ? <ArchiveRestore className="h-4 w-4 text-brand" /> : <Archive className="h-4 w-4 text-brand" />}
                        {selectedConversation.archived ? t('msgr.returnFromArchive') : t('msgr.archive')}
                      </button>
                      {conversationIsMuted(selectedConversation) ? (
                        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void updateSelectedConversationSettings({ mutedUntil: null }, t('msgr.notificationsOn'))}>
                          <Bell className="h-4 w-4 text-brand" /> {t('msgr.enableNotifications')}
                        </button>
                      ) : (
                        <div className="mt-1 border-t border-line pt-1">
                          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">{t('msgr.disableNotifications')}</p>
                          {[
                            [t('msgr.mute1Hour'), 60 * 60 * 1_000],
                            [t('msgr.mute8Hours'), 8 * 60 * 60 * 1_000],
                            [t('msgr.mute1Day'), 24 * 60 * 60 * 1_000],
                          ].map(([label, duration]) => (
                            <button key={String(label)} type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-brand-soft/55" onClick={() => muteFor(duration as number)}>
                              <BellOff className="h-3.5 w-3.5 text-muted" /> {label}
                            </button>
                          ))}
                          <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-brand-soft/55" onClick={() => muteFor('forever')}>
                            <BellOff className="h-3.5 w-3.5 text-muted" /> {t('msgr.forever')}
                          </button>
                        </div>
                      )}
                      <div className="mt-1 border-t border-line pt-1">
                        <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">{t('msgr.folders')}</p>
                        {folders.length === 0 && (
                          <p className="px-3 py-1 text-xs text-muted">{t('msgr.createFolderHint')}</p>
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
                              {t('msgr.folderTitle', { name: activeFolder.name })}
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
                                  label={t('msgr.saveName')}
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
                                <Pencil className="h-3.5 w-3.5 text-muted" /> {t('msgr.renameFolder')}
                              </button>
                            )}
                            <button
                              type="button"
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-danger/10 ${folderDeleteConfirm ? 'text-danger' : ''}`}
                              disabled={folderBusy}
                              onClick={() => void deleteActiveFolder()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {folderDeleteConfirm ? t('msgr.confirmFolderDelete') : t('msgr.deleteFolder')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>}
              </header>

              <FloatingAudioBar />

              {pendingScheduled.length > 0 && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-b border-line bg-brand-soft/50 px-4 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft/70"
                  onClick={() => setScheduledListOpen(true)}
                >
                  <Clock className="h-3.5 w-3.5" /> {t('msgr.scheduledCount', { count: pendingScheduled.length })}
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
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (event.shiftKey) goToPrevSearchMatch();
                        else goToNextSearchMatch();
                      }
                      if (event.key === 'Escape') {
                        setChatSearchOpen(false);
                        setChatSearch('');
                        setSearchMatchIds([]);
                      }
                    }}
                    className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-brand/50"
                    placeholder={t('msgr.searchMessages')}
                  />
                  {chatSearch.trim() && (
                    <span className="shrink-0 text-xs font-semibold text-muted">
                      {searchMatchIds.length > 0
                        ? t('msgr.searchCounter', { index: searchMatchIndex + 1, total: searchMatchIds.length })
                        : t('msgr.searchNoMatches')}
                    </span>
                  )}
                  <IconButton
                    label={t('msgr.searchPrev')}
                    className="h-8 w-8 rounded-xl"
                    disabled={searchMatchIds.length <= 1}
                    onClick={goToPrevSearchMatch}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={t('msgr.searchNext')}
                    className="h-8 w-8 rounded-xl"
                    disabled={searchMatchIds.length <= 1}
                    onClick={goToNextSearchMatch}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label={t('msgr.closeSearch')}
                    className="h-8 w-8 rounded-xl"
                    onClick={() => {
                      setChatSearchOpen(false);
                      setChatSearch('');
                      setSearchMatchIds([]);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              )}
      {convContextMenu && (
        <div
          className="fixed inset-0 z-50 select-none"
          onClick={() => setConvContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setConvContextMenu(null); }}
        >
          <div
            className="fixed min-w-[210px] rounded-2xl border border-line bg-surface/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: Math.min(convContextMenu.y, window.innerHeight - 180),
              left: Math.min(convContextMenu.x, window.innerWidth - 230),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink hover:bg-brand-soft/60"
              onClick={() => {
                togglePinConversation(convContextMenu.conversation.id);
                setConvContextMenu(null);
              }}
            >
              {pinnedIds.includes(convContextMenu.conversation.id) ? (
                <>
                  <PinOff className="h-4 w-4 text-brand" /> {t('sidebar.unpinChat')}
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4 text-brand" /> {t('sidebar.pinChat')}
                </>
              )}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink hover:bg-brand-soft/60"
              onClick={() => {
                const conv = convContextMenu.conversation;
                setConvContextMenu(null);
                void updateConversationSettings(
                  conv.id,
                  { archived: !conv.archived },
                  conv.archived ? t('msgr.dialogReturnedFromArchive') : t('msgr.dialogArchived'),
                );
              }}
            >
              {convContextMenu.conversation.archived ? (
                <>
                  <ArchiveRestore className="h-4 w-4 text-brand" /> {t('msgr.returnFromArchive')}
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 text-brand" /> {t('msgr.archive')}
                </>
              )}
            </button>
            {convContextMenu.conversation.unreadCount && convContextMenu.conversation.unreadCount > 0 ? (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink hover:bg-brand-soft/60"
                onClick={() => {
                  void markRead(convContextMenu.conversation.id);
                  setConvContextMenu(null);
                }}
              >
                <CheckCheck className="h-4 w-4 text-brand" /> Пометить как прочитанное
              </button>
            ) : null}
          </div>
        </div>
      )}
        {blockedUsersOpen && (
          <BlockedUsersModal
            token={token}
            onClose={() => setBlockedUsersOpen(false)}
            onUnauthorized={() => onLogout(true)}
          />
        )}
      {unpinConfirmMessage && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-line bg-surface p-5 shadow-float">
            <h3 className="text-base font-bold text-ink">
              {t('extras.unpinConfirmTitle') ?? 'Открепить сообщение?'}
            </h3>
            <p className="mt-2 text-sm leading-5 text-muted">
              {t('extras.unpinConfirmHint') ?? 'Вы уверены, что хотите открепить это сообщение для всех участников?'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setUnpinConfirmMessage(null)}>
                {t('common.cancel') ?? 'Отмена'}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const msg = unpinConfirmMessage;
                  setUnpinConfirmMessage(null);
                  if (msg) void togglePin(msg);
                }}
              >
                {t('extras.unpin') ?? 'Открепить'}
              </Button>
            </div>
          </div>
        </div>
      )}
              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <PinnedMessagesBar
                messages={selectedPins}
                activeIndex={pinIndex}
                onChangeIndex={setPinIndex}
                onJump={(messageId) => document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                onUnpin={(message) => setUnpinConfirmMessage(message)}
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
                        name={conversationTitle(selectedConversation, currentUser.id, t)}
                        src={conversationAvatar(selectedConversation, currentUser.id)}
                        size="xl"
                        className="justify-center"
                        {...avatarProps(selectedPeer, conversationTitle(selectedConversation, currentUser.id, t))}
                      />
                      <p className="mt-4 font-semibold">{t('msgr.dialogCreated')}</p>
                      <p className="mt-1 text-sm leading-6 text-muted">{t('msgr.dialogCreatedHint')}</p>
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
                      const senderId = messageSenderId(message) ?? '';
                      // Тег автора и его роль нужны только в группе.
                      const senderTag = selectedIsGroup
                        ? memberTagOf(selectedConversation, senderId)
                        : undefined;
                      const senderRole = selectedIsGroup
                        ? groupRoleOf(selectedConversation, senderId) ?? 'member'
                        : 'member';
                      const pinned = selectedPins.some((item) => item.id === message.id);
                      const favorite = Boolean(message.isFavorite ?? message.favoritedByMe);
                      // Набор из сообщения мог быть удалён автором — тогда карточке
                      // нечего показать, и на её месте будет короткая пометка.
                      const sharedPack = message.stickerPackId
                        ? stickerPacks.find((pack) => pack.id === message.stickerPackId)
                        : undefined;
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
                                      title={sender?.displayName ? t('msgr.openProfileOf', { name: sender.displayName }) : undefined}
                                      aria-label={sender?.displayName ? t('msgr.openProfileOf', { name: sender.displayName }) : undefined}
                                    >
                                      <Avatar
                                        name={sender?.displayName ?? t('msgr.userFallback')}
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
                                    aria-label={t('msgr.messageActions')}
                                    aria-expanded={messageActionId === message.id}
                                    onClick={() => setMessageActionId((current) => (current === message.id ? null : message.id))}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                )}
                                {messageActionId === message.id && (
                                  <div className={`absolute bottom-10 z-30 w-56 max-h-[70dvh] overflow-y-auto rounded-2xl border border-line bg-elevated p-1.5 text-ink shadow-float ${mine ? 'right-9' : 'left-9'}`}>
                                    {mine && readByPeer && (
                                      <div className="mb-1 border-b border-line/60 px-3 py-1.5 text-[11px] text-muted flex items-center gap-1.5">
                                        <CheckCheck className="h-3.5 w-3.5 text-brand shrink-0" />
                                        <span className="truncate">{message.readAt ? `${t('msgr.readAt') || 'Прочитано'}: ${formatMessageTime(message.readAt)}` : (t('msgr.read') || 'Прочитано')}</span>
                                      </div>
                                    )}
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setMessageActionId(null); setReactionPickerId(message.id); }}>
                                      <Smile className="h-4 w-4 text-brand" /> {t('msgr.reaction')}
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => beginReply(message)}>
                                      <Reply className="h-4 w-4 text-brand" /> {t('msgr.reply')}
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void copyMessage(message)}>
                                      <Copy className="h-4 w-4 text-brand" /> {t('common.copy')}
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setMessageActionId(null); setForwardingMessage(message); }}>
                                      <Forward className="h-4 w-4 text-brand" /> {t('msgr.forward')}
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => void toggleFavorite(message)}>
                                      {favorite ? <StarOff className="h-4 w-4 text-brand" /> : <Star className="h-4 w-4 text-brand" />}
                                      {favorite ? t('msgr.removeFromFavorites') : t('msgr.toFavorites')}
                                    </button>
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => { setMessageActionId(null); if (pinned) setUnpinConfirmMessage(message); else void togglePin(message); }}>
                                      {pinned ? <PinOff className="h-4 w-4 text-brand" /> : <Pin className="h-4 w-4 text-brand" />}
                                      {pinned ? t('msgr.unpin') : t('msgr.pin')}
                                    </button>
                                    {mine && (
                                      <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-soft/55" onClick={() => beginEdit(message)}>
                                        <Pencil className="h-4 w-4 text-brand" /> {t('common.edit')}
                                      </button>
                                    )}
                                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10" onClick={() => void deleteMessage(message)}>
                                      <Trash2 className="h-4 w-4" /> {t('msgr.deleteForBoth')}
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
                                      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-brand">
                                        <UserName
                                          size="sm"
                                          name={message.sender?.displayName ?? message.author?.displayName ?? selectedPeer?.displayName ?? t('msgr.peerFallback')}
                                          user={message.sender ?? message.author ?? selectedPeer}
                                        />
                                        {/* В группе рядом с именем — тег, покрашенный по роли. */}
                                        {senderTag && <MemberTag tag={senderTag} role={senderRole} />}
                                      </p>
                                    )}
                                    {message.forwardedFrom && (
                                      <p className={`mb-1 flex items-center gap-1 text-[10px] font-semibold ${mine ? 'text-ink/65' : 'text-muted'}`}>
                                        <Forward className="h-3 w-3" /> {t('msgr.forwardedFrom')} <UserName size="sm" name={message.forwardedFrom.sender?.displayName ?? t('msgr.forwardedFromUser')} user={message.forwardedFrom.sender} />
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
                                            name={message.replyTo.sender?.displayName ?? (messageSenderId(message.replyTo) === currentUser.id ? currentUser.displayName : selectedPeer?.displayName ?? t('msgr.peerFallback'))}
                                            user={message.replyTo.sender ?? (messageSenderId(message.replyTo) === currentUser.id ? currentUser : selectedPeer)}
                                          />
                                        </span>
                                        <span className={`block truncate text-xs ${mine ? 'text-ink/70' : 'text-muted'}`}>{messageSummary(message.replyTo)}</span>
                                      </button>
                                    ) : message.replyToId ? (
                                      <div className={`mb-2 rounded-xl border-l-2 px-2.5 py-1.5 text-xs ${mine ? 'border-brand/50 bg-brand/10 text-ink/65' : 'border-line bg-canvas text-muted'}`}>
                                        {t('msgr.originalDeleted')}
                                      </div>
                                    ) : null}
                                    <MessageAttachments
                                      attachments={message.attachments ?? []}
                                      mine={mine}
                                      onOpenImage={(attachment) => setImageViewer({ images: messageImages(messages), initialId: attachment.id })}
                                    />
                                    {message.stickerPackId && sharedPack && (
                                      <SharedPackCard
                                        pack={sharedPack}
                                        installed={Boolean(sharedPack.mine)}
                                        busy={packBusy === sharedPack.id}
                                        onInstall={() => installSharedPack(sharedPack.id, true)}
                                        onUninstall={() => installSharedPack(sharedPack.id, false)}
                                      />
                                    )}
                                    {message.stickerPackId && !sharedPack && (
                                      // Набор удалён автором — показываем, что он
                                      // был, но содержимого уже нет.
                                      <p className="mb-1.5 flex items-center gap-2 text-xs text-muted">
                                        <PackagePlus className="h-4 w-4" />
                                        {t('stickers.packTitleLabel')}
                                      </p>
                                    )}
                                    {message.stickers && message.stickers.length > 0 && (
                                      <MessageStickers
                                        stickers={message.stickers}
                                        showSave={!message.stickers.every((sticker) => sticker.packId.startsWith('builtin-'))}
                                        onSave={(sticker) => saveStickerToPack(sticker)}
                                      />
                                    )}
                                    {message.poll ? (
                                      <PollMessage
                                        poll={message.poll}
                                        currentUserId={currentUser.id}
                                        canVote={!selectedBlocked}
                                        busy={pollBusy}
                                        nameOf={(userId) => pollVoters.get(userId)}
                                        isAuthor={senderId === currentUser.id}
                                        onVote={(optionIds) =>
                                          void runPollAction(
                                            () => api.votePoll(token, message.id, optionIds),
                                            t('msgr.voteFailed'),
                                          )
                                        }
                                        onAddOption={(text) =>
                                          void runPollAction(
                                            () => api.addPollOption(token, message.id, text),
                                            t('msgr.addOptionFailed'),
                                          )
                                        }
                                        onClosePoll={() =>
                                          void runPollAction(
                                            () => api.closePoll(token, message.id),
                                            t('msgr.stopPollFailed'),
                                          )
                                        }
                                      />
                                    ) : (
                                      message.text && (
                                        <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.45] sm:text-[15px]">
                                          <HighlightedText text={message.text} query={chatSearchOpen ? chatSearch : ''} />
                                        </p>
                                      )
                                    )}
                                    {/* Кнопки бота: под текстом, во всю ширину пузыря.
                                        Нажатие уходит кодом действия, а не сообщением. */}
                                    {message.keyboard && message.keyboard.length > 0 && (
                                      <div className="mt-2 space-y-1">
                                        {message.keyboard.map((row, rowIndex) => (
                                          <div key={`${message.id}-row-${rowIndex}`} className="flex gap-1">
                                            {row.map((button) => (
                                              <button
                                                key={`${message.id}-${button.action}`}
                                                type="button"
                                                disabled={botActionBusy}
                                                onClick={() => void pressBotButton(message.conversationId, button.action)}
                                                className={`flex-1 rounded-lg border border-brand/30 bg-brand-soft/50 px-2 py-1.5 text-[12px] font-bold text-brand transition hover:bg-brand-soft disabled:opacity-60 ${mine ? 'bg-brand/10' : ''}`}
                                              >
                                                {button.label}
                                              </button>
                                            ))}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <span className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-ink/60' : 'text-muted'}`}>
                                      {message.editedAt && !message.failed && t('msgr.edited')}
                                      {message.failed ? t('msgr.notSent') : formatMessageTime(message.createdAt)}
                                      {favorite && <Star className="h-3 w-3 fill-current" aria-label={t('msgr.inFavorites')} />}
                                      {mine && !message.failed && (
                                        message.pending
                                          ? <Spinner className="h-3 w-3" />
                                          : readByPeer
                                            ? (
                                              <span title={message.readAt ? `${t('msgr.readAt') || 'Прочитано'}: ${formatMessageTime(message.readAt)}` : t('msgr.read')}>
                                                <CheckCheck className="h-3.5 w-3.5 text-brand" aria-label={t('msgr.read')} />
                                              </span>
                                            )
                                            : (
                                              <span title={t('msgr.sent')}>
                                                <Check className="h-3.5 w-3.5" aria-label={t('msgr.sent')} />
                                              </span>
                                            )
                                      )}
                                    </span>
                                    {message.failed && (
                                      <button type="button" className={`mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${mine ? 'bg-danger/10 text-danger' : 'bg-danger/10 text-danger'}`} disabled={retryingId === message.id} onClick={() => void retryMessage(message)}>
                                        <RotateCcw className={`h-3 w-3 ${retryingId === message.id ? 'animate-spin' : ''}`} /> {t('msgr.retrySend')}
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
                    {t('msgr.communicationBlocked')}
                  </p>
                )}
                {recording && (
                  <div className="mx-auto mb-2 flex max-w-[920px] items-center gap-3 rounded-2xl border border-danger/25 bg-danger/5 px-3 py-2">
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center">
                      <span className="absolute inline-flex h-4 w-4 animate-ping rounded-full bg-danger/40" />
                      <span className="relative h-3.5 w-3.5 rounded-full bg-danger" />
                    </span>
                    {recordPreview && <video autoPlay muted playsInline aria-label={t('msgr.videoCirclePreview')} className="h-20 w-20 shrink-0 rounded-full object-cover" ref={(element) => { if (element && element.srcObject !== recordPreview) element.srcObject = recordPreview; }} />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-danger">{recordMode === 'video_circle' ? t('msgr.recordingVideoCircle') : t('msgr.recordingVoice')}</span>
                      <span className="flex items-center gap-2">
                        <span className="block font-mono text-sm font-bold text-ink">
                          {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}{recordMode === 'video_circle' ? ' / 1:00' : ''}
                        </span>
                        <span className="flex h-4 items-center gap-[3px] px-1" aria-hidden="true">
                          {[0.35, 0.7, 1.0, 0.8, 0.5, 0.9, 0.6, 0.4].map((factor, idx) => {
                            const barH = Math.max(3, Math.round(factor * (3 + recordAudioLevel * 14)));
                            return (
                              <span
                                key={idx}
                                className="w-[2.5px] rounded-full bg-danger/80 transition-[height] duration-75"
                                style={{ height: `${barH}px` }}
                              />
                            );
                          })}
                        </span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger text-white transition hover:bg-danger/85"
                      onClick={stopVoiceRecording}
                      aria-label={t('msgr.stopAndSend')}
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-danger transition hover:bg-danger/10"
                      onClick={cancelVoiceRecording}
                      aria-label={t('msgr.cancelRecording')}
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
                        {editingMessage ? t('msgr.editingMessage') : t('msgr.replyingTo')}
                      </p>
                      <p className="truncate text-xs text-muted">{(editingMessage ?? replyingTo)?.text}</p>
                    </div>
                    <IconButton
                      label={t('msgr.cancel')}
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
                {/* Кнопка «СТАРТ» под пустой перепиской с ботом. Во всю ширину
                    поля ввода и заглавными буквами — как в Telegram. */}
                {botNotStarted && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendMessage(undefined, '/start')}
                    className="mx-auto mb-2 flex w-full max-w-[920px] items-center justify-center rounded-[1.2rem] border border-brand/25 bg-brand-soft/60 py-2.5 text-sm font-bold uppercase tracking-wide text-brand transition hover:bg-brand-soft disabled:opacity-60"
                  >
                    {t('msgr.botStart')}
                  </button>
                )}
                {composeBlocked ? (
                  <p className="mx-auto flex max-w-[920px] items-center justify-center gap-2 rounded-[1.2rem] border border-line bg-canvas px-4 py-3 text-center text-xs text-muted">
                    {viewerFrozen ? (
                      <>
                        <Snowflake className="h-4 w-4 shrink-0 text-brand" />
                        {t('msgr.frozenViewOnlyLong')}
                      </>
                    ) : selectedPeerDeleted ? (
                      <>
                        <UserRound className="h-4 w-4 shrink-0 text-muted" />
                        {t('msgr.peerDeletedCompose')}
                      </>
                    ) : selectedPeerFrozen ? (
                      <>
                        <Snowflake className="h-4 w-4 shrink-0 text-brand" />
                        {t('msgr.peerFrozenCompose')}
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4 shrink-0 text-muted" />
                        {/* Мьют со сроком: говорим, до какого времени закрыто письмо. */}
                        {muteDeadline
                          ? t('msgr.groupWriteForbiddenUntil', { until: muteDeadline })
                          : t('msgr.groupWriteForbidden')}
                      </>
                    )}
                  </p>
                ) : (
                <form className="mx-auto flex max-w-[920px] items-end gap-2" onSubmit={(event) => void sendMessage(event)}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    multiple
                    onChange={handleSelectedFiles}
                    disabled={sending || selectedBlockedByMe || !canAttach || Boolean(editingMessage)}
                  />
                  {canSendPolls && (
                    <IconButton
                      label={t('msgr.createPoll')}
                      type="button"
                      disabled={sending || selectedBlockedByMe || Boolean(editingMessage)}
                      className="h-11 w-11 shrink-0"
                      onClick={() => setPollOpen(true)}
                    >
                      <BarChart3 className="h-5 w-5" />
                    </IconButton>
                  )}
                  <IconButton
                    label={canAttach ? t('msgr.attachMedia') : t('msgr.mediaForbidden')}
                    type="button"
                    disabled={sending || selectedBlockedByMe || !canAttach || Boolean(editingMessage)}
                    className="h-11 w-11 shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileUp className="h-5 w-5" />
                  </IconButton>
                  <IconButton
                    label={recording ? t('msgr.stopRecording') : recordPending ? t('msgr.waitingDevice') : recordMode === 'video_circle' ? t('msgr.recordVideoCircle') : t('msgr.voiceMessage')}
                    type="button"
                    disabled={sending || selectedBlockedByMe || !canAttach || Boolean(editingMessage) || recordPending}
                    className={`h-11 w-11 shrink-0 ${recording ? 'bg-danger text-white hover:bg-danger/85' : ''}`}
                    onClick={() => {
                      if (recording) stopVoiceRecording();
                      else void startVoiceRecording();
                    }}
                  >
                    {recording ? <span className="h-3 w-3 rounded-full bg-white" /> : recordMode === 'video_circle' ? <Video className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </IconButton>
                  <IconButton type="button" label={recordMode === 'voice' ? t('msgr.switchToVideoCircle') : t('msgr.switchToVoice')} disabled={recording || recordPending || sending} className="h-11 w-8 shrink-0" onClick={() => setRecordMode((mode) => mode === 'voice' ? 'video_circle' : 'voice')}>
                    {recordMode === 'voice' ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </IconButton>
                  <div className="relative">
                    <IconButton
                      // 🔥 В группе стикер считается файлом, а не картинкой в
                      // сообщении: без права на файлы его нельзя ни прислать,
                      // ни отправить — иначе получилось бы обойти запрет.
                      label={canAttach ? t('stickers.stickerButton') : t('msgr.mediaForbidden')}
                      type="button"
                      disabled={sending || selectedBlockedByMe || !canAttach}
                      className={`h-11 w-11 shrink-0 ${stickersOpen ? 'bg-brand-soft text-brand' : ''}`}
                      onClick={() => {
                        setStickersOpen((open) => !open);
                        setEmojiOpen(false);
                      }}
                    >
                      <StickerIcon className="h-5 w-5" />
                    </IconButton>
                    {stickersOpen && (
                      <StickerPicker
                        className="absolute bottom-14 right-0"
                        packs={stickerPacks}
                        gifs={gifs}
                        onSendSticker={(sticker) => void sendSticker(sticker)}
                        onSendGif={(gif) => void sendGif(gif)}
                        onOpenPacks={() => {
                          setStickersOpen(false);
                          setStickerPacksOpen(true);
                        }}
                        onClose={() => setStickersOpen(false)}
                      />
                    )}
                  </div>
                  <div className="relative">
                    <IconButton
                      label={t('msgr.addEmoji')}
                      type="button"
                      disabled={sending || selectedBlockedByMe}
                      className={`h-11 w-11 shrink-0 ${emojiOpen ? 'bg-brand-soft text-brand' : ''}`}
                      onClick={() => setEmojiOpen((open) => !open)}
                    >
                      <Smile className="h-5 w-5" />
                    </IconButton>
                    {emojiOpen && !emojiDocked && (
                      <EmojiPicker
                        className="absolute bottom-14 right-0"
                        isDocked={false}
                        onToggleDock={toggleEmojiDock}
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
                      label={t('msgr.sendLater')}
                      type="button"
                      disabled={sending || selectedBlockedByMe || Boolean(editingMessage) || recording}
                      className={`h-11 w-11 shrink-0 ${scheduleOpen ? 'bg-brand-soft text-brand' : ''}`}
                      onClick={() => (scheduleOpen ? setScheduleOpen(false) : openSchedulePicker())}
                    >
                      <Clock className="h-5 w-5" />
                    </IconButton>
                    {scheduleOpen && (
                      <div className="absolute bottom-14 right-0 z-30 w-64 animate-fade-in rounded-2xl border border-line bg-elevated p-3 shadow-float">
                        <p className="text-sm font-semibold">{t('msgr.sendLater')}</p>
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
                          {t('msgr.schedule')}
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <IconButton
                      label={t('msgr.formatting')}
                      type="button"
                      disabled={sending || selectedBlockedByMe}
                      className={`h-11 w-11 shrink-0 ${formatMenuOpen ? 'bg-brand-soft text-brand' : ''}`}
                      onClick={() => setFormatMenuOpen((open) => !open)}
                    >
                      <Type className="h-5 w-5" />
                    </IconButton>
                    {formatMenuOpen && (
                      <div className="absolute bottom-14 left-0 z-30 flex items-center gap-1 rounded-2xl border border-line bg-elevated p-1.5 shadow-float">
                        <button
                          type="button"
                          onClick={() => applyComposerFormat('bold')}
                          title={`${t('msgr.bold')} (Ctrl+B)`}
                          aria-label={t('msgr.bold')}
                          className="grid h-8 w-8 place-items-center rounded-xl font-bold hover:bg-brand-soft/60"
                        >
                          <Bold className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyComposerFormat('italic')}
                          title={`${t('msgr.italic')} (Ctrl+I)`}
                          aria-label={t('msgr.italic')}
                          className="grid h-8 w-8 place-items-center rounded-xl hover:bg-brand-soft/60"
                        >
                          <Italic className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyComposerFormat('underline')}
                          title={`${t('msgr.underline')} (Ctrl+U)`}
                          aria-label={t('msgr.underline')}
                          className="grid h-8 w-8 place-items-center rounded-xl hover:bg-brand-soft/60"
                        >
                          <Underline className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyComposerFormat('strike')}
                          title={`${t('msgr.strike')} (Ctrl+Shift+X)`}
                          aria-label={t('msgr.strike')}
                          className="grid h-8 w-8 place-items-center rounded-xl hover:bg-brand-soft/60"
                        >
                          <Strikethrough className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyComposerFormat('code')}
                          title={`${t('msgr.code')} (Ctrl+Shift+C)`}
                          aria-label={t('msgr.code')}
                          className="grid h-8 w-8 place-items-center rounded-xl hover:bg-brand-soft/60"
                        >
                          <Code className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyComposerFormat('quote')}
                          title={`${t('msgr.quote')} (Ctrl+Shift+Q)`}
                          aria-label={t('msgr.quote')}
                          className="grid h-8 w-8 place-items-center rounded-xl hover:bg-brand-soft/60"
                        >
                          <Quote className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <label className="min-w-0 flex-1">
                    <span className="sr-only">{t('msgr.messageLabel')}</span>
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(event) => handleDraftChange(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      rows={1}
                      className="max-h-32 min-h-11 w-full resize-none rounded-[1.2rem] border border-line bg-canvas px-4 py-2.5 text-[15px] leading-6 outline-none transition placeholder:text-muted/65 focus:border-brand/50 focus:ring-4 focus:ring-brand/10"
                      placeholder={
                        draftLinkBlocked
                          ? t('msgr.linksForbidden')
                          : selectedBlockedByMe
                            ? t('msgr.sendingUnavailable')
                            : editingMessage
                              ? t('msgr.editMessagePlaceholder')
                              : replyingTo
                                ? t('msgr.replyPlaceholder')
                                : t('msgr.messagePlaceholder')
                      }
                      disabled={sending || selectedBlockedByMe}
                    />
                  </label>
                  <IconButton
                    label={t('msgr.sendMessage')}
                    type="submit"
                    disabled={
                      sending ||
                      selectedBlockedByMe ||
                      draftLinkBlocked ||
                      draftAttachments.some((item) => item.status !== 'uploaded') ||
                      (!draft.trim() && !draftAttachments.some((item) => item.status === 'uploaded'))
                    }
                    className="h-11 w-11 bg-brand text-white shadow-sm hover:bg-brand-strong hover:text-white"
                  >
                    {sending ? <Spinner className="h-5 w-5" /> : <SendHorizontal className="h-5 w-5" />}
                  </IconButton>
                </form>
                )}
              </footer>
                </div>
                {emojiOpen && emojiDocked && (
                  <aside className="hidden md:flex w-80 shrink-0 flex-col border-l border-line bg-surface/95 backdrop-blur z-20">
                    <EmojiPicker
                      isDocked
                      onToggleDock={toggleEmojiDock}
                      onClose={() => setEmojiOpen(false)}
                      onSelect={(emoji) => {
                        const field = textareaRef.current;
                        const start = field?.selectionStart ?? draft.length;
                        const end = field?.selectionEnd ?? draft.length;
                        handleDraftChange(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
                        window.setTimeout(() => {
                          field?.focus();
                          field?.setSelectionRange(start + emoji.length, start + emoji.length);
                        });
                      }}
                    />
                  </aside>
                )}
              </div>
            </>
          )}
        </section>
        </div>
      </div>

      {searchOpen && (
        <UserSearchModal
          token={token}
          currentUserId={currentUser.id}
          onClose={() => setSearchOpen(false)}
          onConversation={handleCreatedConversation}
        />
      )}
      {pollOpen && (
        <PollDialog
          busy={pollBusy}
          onClose={() => setPollOpen(false)}
          onSubmit={(draft) => void createPoll(draft)}
        />
      )}
      {groupCreateOpen && (
        <GroupCreateModal
          token={token}
          currentUserId={currentUser.id}
          onClose={() => setGroupCreateOpen(false)}
          onCreated={handleCreatedConversation}
        />
      )}
      {groupInfoOpen && selectedIsGroup && selectedConversation && (
        <GroupInfoPanel
          token={token}
          currentUserId={currentUser.id}
          conversation={selectedConversation}
          onClose={() => setGroupInfoOpen(false)}
          onUpdated={handleGroupUpdated}
          onLeft={handleGroupLeft}
          onShowProfile={setMemberProfile}
        />
      )}
      {memberProfile && (
        <UserProfileSheet
          token={token}
          user={memberProfile}
          mode="peer"
          onClose={() => setMemberProfile(null)}
          onMessage={() => void openDirectWith(memberProfile)}
          onUnauthorized={() => onLogout(true)}
        />
      )}
      {settingsOpen && (
        <SettingsScreen
          user={currentUser}
          onOpenAccount={() => {
            setSettingsOpen(false);
            setProfileOpen(true);
          }}
          onOpenLanguage={() => {
            setSettingsOpen(false);
            setLanguageOpen(true);
          }}
          onOpenPrivacy={() => {
            setSettingsOpen(false);
            setPrivacyOpen(true);
          }}
          onOpenSessions={() => {
            setSettingsOpen(false);
            setSessionsOpen(true);
          }}
          onOpenThemes={() => {
            setSettingsOpen(false);
            setThemesOpen(true);
          }}
          onOpenScale={() => {
            setSettingsOpen(false);
            setScaleOpen(true);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {languageOpen && (
        <LanguageScreen
          // Стрелка ведёт не «в никуда», а назад в список настроек: открывая
          // раздел, мы закрыли список, поэтому возврат — снова его открыть.
          onBack={() => {
            setLanguageOpen(false);
            setSettingsOpen(true);
          }}
          onClose={() => setLanguageOpen(false)}
        />
      )}
      {privacyOpen && (
        <PrivacyScreen
          user={currentUser}
          conversations={conversations}
          token={token}
          onToggleLastSeen={async (value) => {
            const updated = await api.updateProfile(token, { showLastSeen: value });
            onUserUpdated(updated);
          }}
          onUpdateCallPrivacy={async (privacy, allowedUserIds, deniedUserIds) => {
            const updated = await api.updateProfile(token, {
              callPrivacy: privacy,
              callPrivacyAllowedUserIds: allowedUserIds,
              callPrivacyDeniedUserIds: deniedUserIds,
            });
            onUserUpdated(updated);
          }}
          onBack={() => {
            setPrivacyOpen(false);
            setSettingsOpen(true);
          }}
          onClose={() => setPrivacyOpen(false)}
        />
      )}
      {sessionsOpen && (
        <SessionsScreen
          token={token}
          user={currentUser}
          onAutoTerminateChange={async (days) => {
            const updated = await api.updateProfile(token, { sessionAutoTerminateDays: days });
            onUserUpdated(updated);
          }}
          onBack={() => {
            setSessionsOpen(false);
            setSettingsOpen(true);
          }}
          onClose={() => setSessionsOpen(false)}
        />
      )}
      {themesOpen && (
        <ThemesScreen
          activeTheme={themeControls.activeTheme}
          themes={themeControls.themes}
          customThemes={themeControls.customThemes}
          createId={themeControls.createId}
          onActivate={themeControls.activate}
          onSave={themeControls.saveCustom}
          onRemove={themeControls.removeCustom}
          onImport={themeControls.importTheme}
          currentWallpaperUrl={currentUser.wallpaperUrl}
          currentColor={currentUser.themeColor ?? '#3390ec'}
          onChangeAccentColor={async (color) => {
            try {
              const updated = await api.updateProfile(token, { themeColor: color });
              onUserUpdated(updated);
            } catch (err) {
              setNotice(readableError(err, 'Не удалось сохранить цвет'));
            }
          }}
          // Встроенные обои лежат рядом с интерфейсом, поэтому это не загрузка,
          // а путь вида `/wallpapers/…` — сервер такие пути принимает наравне
          // со ссылками и своими файлами.
          onApplyWallpaper={async (url) => {
            const updated = await api.updateProfile(token, {
              wallpaperUrl: url,
              wallpaperMimeType: 'image/png',
            });
            onUserUpdated(updated);
          }}
          onClearWallpaper={async () => {
            const updated = await api.updateProfile(token, {
              wallpaperUrl: '',
              wallpaperMimeType: '',
            });
            onUserUpdated(updated);
          }}
          onBack={() => {
            setThemesOpen(false);
            setSettingsOpen(true);
          }}
          onClose={() => setThemesOpen(false)}
        />
      )}
      {scaleOpen && (
        <ScaleScreen
          onBack={() => {
            setScaleOpen(false);
            setSettingsOpen(true);
          }}
          onClose={() => setScaleOpen(false)}
        />
      )}
      {/* Тема из ссылки: сначала спрашиваем, менять ли оформление. */}
      <ThemeLinkImport onImport={themeControls.importTheme} />
      {sessionAlert && (
        <NewSessionAlert
          session={sessionAlert}
          onAcknowledge={() => void acknowledgeSessionAlert()}
          onTerminate={() => void terminateSessionAlert()}
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
      {adminPanelOpen && currentUser.isOwner && (
        <AdminPanel
          token={token}
          viewer={currentUser}
          onClose={() => setAdminPanelOpen(false)}
          onChanged={() => void loadConversations()}
        />
      )}
      {sidebarOpen && (
        <AppSidebar
          currentUser={currentUser}
          connected={socketState === 'connected'}
          accounts={accounts}
          activeToken={token}
          theme={theme}
          onAction={handleSidebarAction}
          onSwitchAccount={onSwitchAccount}
          onAddAccount={onAddAccount}
          onRemoveAccount={onRemoveAccount}
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
            if (!selectedConversation || selectedPeer.isBot) return;
            setPeerProfileOpen(false);
            void webRtc.startCall(selectedConversation.id, selectedPeer, 'audio');
          }}
          onVideoCall={() => {
            if (!selectedConversation || selectedPeer.isBot) return;
            setPeerProfileOpen(false);
            void webRtc.startCall(selectedConversation.id, selectedPeer, 'video');
          }}
          onMore={() => setNotice(t('msgr.moreLater'))}
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
            setNotice(t('msgr.messageForwarded'));
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
        {friendsOpen && (
          <FriendsModal
            token={token}
            onClose={() => setFriendsOpen(false)}
            onUnauthorized={() => onLogout(true)}
            onOpenProfile={(user) => {
              setFriendsOpen(false);
              setMemberProfile(user);
            }}
          />
        )}
      {scheduledListOpen && (        <ScheduledMessagesModal
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
      {stickerPacksOpen && (
        <StickerPacksScreen
          token={token}
          packs={stickerPacks}
          gifs={gifs}
          conversations={conversations}
          onPacksChange={setStickerPacks}
          onGifsChange={setGifs}
          onShared={() => void loadConversations()}
          onClose={() => setStickerPacksOpen(false)}
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
