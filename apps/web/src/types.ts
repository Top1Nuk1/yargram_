import type { Language } from './lib/i18n';

export type ThemeMode = 'light' | 'dark';

export type AttachmentKind = 'image' | 'file' | 'avatar' | 'banner' | 'wallpaper' | 'sticker' | 'gif';

export interface Attachment {
  id: string;
  ownerId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  mediaKind?: 'voice' | 'video_circle' | 'gif' | null;
  durationSeconds?: number | null;
  size: number;
  url: string;
  createdAt: string;
}

/** Стикер: картинка или анимация плюс значок для поиска по набору. */
export interface Sticker {
  id: string;
  packId: string;
  emoji: string;
  animated: boolean;
  url: string;
}

/** Набор стикеров целиком, как его отдаёт сервер. */
export interface StickerPack {
  id: string;
  title: string;
  emoji: string;
  /** Растёт при каждом изменении: клиент по нему понимает, что перечитать. */
  version: number;
  /** Свой набор: его можно править и удалить. */
  mine: boolean;
  /** Встроенный набор Yargram: править нельзя никому. */
  builtin: boolean;
  /** Кто прислал набор. Пусто у встроенного и своего. */
  sharedByUserId?: string;
  updatedAt: string;
  stickers: Sticker[];
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

export type MessageKind = 'user' | 'system' | 'call' | 'poll' | 'bot';

/**
 * Кнопка в сообщении бота. `action` — код действия: клиент не пишет его в чат,
 * а отправляет серверу отдельным запросом, поэтому в истории не остаётся
 * служебных «нажатий».
 */
export interface BotButton {
  label: string;
  action: string;
}

/** Клавиатура бота — ряды кнопок под текстом сообщения. */
export type BotKeyboard = BotButton[][];

export interface CallMessageDetails {
  callId?: string;
  callerId?: string;
  direction?: 'incoming' | 'outgoing';
  mode?: 'audio' | 'video';
  status?: 'completed' | 'missed' | 'declined' | 'unanswered';
  outcome?: 'completed' | 'missed' | 'declined' | 'unanswered';
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
}

export type CallPrivacyRule = 'everyone' | 'contacts' | 'nobody';

export type LastSeenStatus = 'recently' | 'within_week' | 'within_month' | 'long_ago';

export interface User {
  id: string;
  email?: string;
  username?: string | null;
  displayName: string;
  bio?: string;
  avatar?: Attachment | null;
  avatarUrl?: string | null;
  isOnline?: boolean;
  online?: boolean;
  lastSeenAt?: string | null;
  lastSeenStatus?: LastSeenStatus | null;
  showLastSeen?: boolean;
  callPrivacy?: CallPrivacyRule;
  callPrivacyAllowedUserIds?: string[];
  callPrivacyDeniedUserIds?: string[];
  createdAt?: string;
  themeColor?: string;
  wallpaperUrl?: string;
  /** Тип фона: `image/*` или `video/*` — от этого зависит, рисовать `<video>`
   *  или фоновую картинку. По ссылке тип не виден. */
  wallpaperMimeType?: string;
  /** Заливка баннера (hex). Если задано фото баннера, оно перекрывает заливку. */
  bannerColor?: string;
  banner?: Attachment | null;
  bannerUrl?: string | null;
  blockedByMe?: boolean;
  isVerified?: boolean;
  badge?: 'yargram' | null;
  /** Отметка SCAM от владельца: описание подменяется предупреждением. */
  scam?: boolean;
  /** Отметка FAKE: аккаунт выдаёт себя за официальный. */
  fake?: boolean;
  usernames?: string[];
  adminUserIds?: string[];
  isOwner?: boolean;
  isBanned?: boolean;
  isFrozen?: boolean;
  /** Аккаунт удалён владельцем (запись остаётся, почта занята). */
  isDeleted?: boolean;
  birthday?: string | null;
  /** Кто из списка в друзьях — по этому рисуется подпись в профиле. */
  friendIds?: string[];
  /** Связь со мной: приходит вместе с чужим профилем и рисует кнопку дружбы. */
  friendship?: FriendshipState;
  /** Это приложение Yargram, а не человек. */
  isApp?: boolean;
  /** Это бот: рядом с именем рисуется метка «BOT», войти в него нельзя. */
  isBot?: boolean;
  /** Через сколько дней бездействия сеанс завершается сам; `null` — никогда. */
  sessionAutoTerminateDays?: number | null;
  /** Язык интерфейса: по нему служебный бот поддержки выбирает, на каком
   *  языке отвечать. Хранится на сервере, а не только на устройстве. */
  language?: Language;
}

/**
 * Активный сеанс — один вход в аккаунт. Yargram — сайт, поэтому сеанс
 * описывают парой «сайт + браузер», а не названием устройства.
 */
export interface Session {
  id: string;
  /** Сайт, с которого вошли: `https://yargram.ru`. Пусто — сайт не определён. */
  site: string;
  /** Браузер и система: «Chrome, Windows». */
  device: string;
  /** Постоянный идентификатор физического устройства / браузера. */
  deviceId?: string;
  /** Пользовательское имя устройства. */
  customDeviceName?: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** Это тот сеанс, с которого смотрят список. */
  current: boolean;
  /** Вход был с незнакомого сайта. */
  newDevice: boolean;
  /** Владелец подтвердил вход: «это был я». */
  acknowledged: boolean;
}

/** Список сеансов глазами владельца. */
export interface SessionOverview {
  sessions: Session[];
  currentSessionId: string | null;
  /** Можно ли завершать чужие сеансы: право появляется через сутки после входа. */
  canTerminateOthers: boolean;
  /** Когда право появится (ISO). Пока его нет — показываем отсчёт. */
  gateUntil: string | null;
  /** Вход с нового сайта, который ещё не подтверждён. */
  alert: Session | null;
  /** Через сколько дней бездействия сеанс завершается сам; `null` — никогда. */
  autoTerminateDays: number | null;
}

/** Связь со мной: чем рисовать кнопку дружбы в чужом профиле. */
export type FriendshipState = 'none' | 'outgoing' | 'incoming' | 'friends';

/** Один человек в списках друзей и заявок. */
export interface FriendEntry {
  user: User;
}

export interface FriendsOverview {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}

/** Счётчики медиа в переписке: профиль показывает только то, что больше нуля. */
export interface MediaSummary {
  photos: number;
  videos: number;
  files: number;
  audio: number;
  voice: number;
  videoCircles: number;
  gifs: number;
  links: number;
}

export interface Participant {
  id?: string;
  userId?: string;
  user?: User;
  displayName?: string;
  username?: string | null;
  bio?: string;
  avatar?: Attachment | null;
  avatarUrl?: string | null;
  isOnline?: boolean;
  online?: boolean;
  lastSeenAt?: string | null;
  lastSeenStatus?: LastSeenStatus | null;
  showLastSeen?: boolean;
  createdAt?: string;
  blockedByMe?: boolean;
  isVerified?: boolean;
  badge?: 'yargram' | null;
  scam?: boolean;
  fake?: boolean;
  isFrozen?: boolean;
  isDeleted?: boolean;
  /** Это бот: в списке участников он тоже помечается меткой «бот». */
  isBot?: boolean;
}

/**
 * Аккаунт заморозили, разморозили или удалили — прилетает по сокету всем,
 * чтобы собеседники увидели «Удалённый аккаунт» без перезагрузки.
 */
export interface AccountStatePayload {
  userId: string;
  frozen: boolean;
  removed: boolean;
  user: User;
}

/** Вариант ответа в опросе. */
export interface PollOption {
  id: string;
  text: string;
}

/** Настройки опроса: включаются по отдельности. */
export interface PollSettings {
  showNames: boolean;
  multiple: boolean;
  addOptions: boolean;
  changeVote: boolean;
  shuffle: boolean;
  /** Правильные варианты: непустой список делает опрос викториной. */
  correctOptionIds: string[];
  deadline: string | null;
}

export interface Poll {
  question: string;
  description: string;
  options: PollOption[];
  settings: PollSettings;
  votes: Record<string, string[]>;
  closed: boolean;
}

/** Опрос глазами смотрящего: итоги считает сервер. */
export interface PollView extends Poll {
  counts: Record<string, number>;
  totalVoters: number;
}

export interface Message {
  id: string;
  conversationId: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  senderId?: string;
  userId?: string;
  sender?: User;
  author?: User;
  pending?: boolean;
  failed?: boolean;
  clientId?: string;
  editedAt?: string;
  replyToId?: string;
  replyTo?: Message | null;
  readBy?: string[];
  readAt?: string | null;
  attachments?: Attachment[];
  reactions?: MessageReaction[];
  forwardedFromId?: string | null;
  forwardedFrom?: Message | null;
  kind?: MessageKind;
  systemEvent?: string | null;
  call?: CallMessageDetails | null;
  poll?: PollView | null;
  /**
   * Присланный набор стикеров. Сообщение без текста: в переписке рисуется
   * карточка набора, а у получателя он появляется в его списке.
   */
  stickerPackId?: string;
  /**
   * Отправленные стикеры с готовыми адресами. Сервер сам пересобирает их при
   * каждой отдаче: подпись на файл недолговечна, и в истории её хранить нельзя.
   */
  stickers?: Sticker[];
  /** Кнопки под сообщением бота: по нажатию клиент шлёт `action` серверу. */
  keyboard?: BotKeyboard | null;
  isFavorite?: boolean;
  favoritedByMe?: boolean;
}

/** Права, которые владелец выдаёт обычным участникам. */
export const memberPermissionKeys = [
  'send_messages',
  'send_media',
  'send_links',
  'send_polls',
  'add_members',
  'pin_messages',
  'change_info',
  'delete_messages',
] as const;

/** Управляющие права: только у владельца и администраторов. */
export const adminOnlyPermissionKeys = [
  'remove_members',
  'restrict_members',
  'manage_tags',
  'add_admins',
] as const;

/**
 * Права группы включаются по отдельности: владелец собирает из них любую
 * комбинацию для администраторов и участников.
 */
export const groupPermissionKeys = [
  ...memberPermissionKeys,
  ...adminOnlyPermissionKeys,
] as const;

export type MemberPermissionKey = (typeof memberPermissionKeys)[number];
export type AdminOnlyPermissionKey = (typeof adminOnlyPermissionKeys)[number];

export type GroupPermission = (typeof groupPermissionKeys)[number];
export type GroupPermissions = Partial<Record<GroupPermission, boolean>>;
/** Права после вычисления: у каждого пункта есть конкретный ответ. */
export type EffectiveGroupPermissions = Record<GroupPermission, boolean>;

export type GroupRole = 'owner' | 'admin' | 'member' | 'restricted';

export type GroupEventKind =
  | 'created'
  | 'renamed'
  | 'description_changed'
  | 'avatar_changed'
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'admin_added'
  | 'admin_removed'
  | 'permissions_changed'
  | 'member_restricted'
  | 'member_muted'
  | 'member_unmuted'
  | 'member_tag_changed';

/** Запись истории изменений группы: кто и что сделал. */
export interface GroupEvent {
  id: string;
  at: string;
  actorId: string;
  kind: GroupEventKind;
  targetId?: string;
  detail?: string;
}

/** Строка списка участников группы вместе с ролью и правами. */
export interface GroupMember {
  user: User;
  role: GroupRole;
  permissions: EffectiveGroupPermissions;
  /** Поля нет, когда мьюта нет; null — бессрочный мьют. */
  mutedUntil?: string | null;
  /** Подпись рядом с именем; поля нет, если тег не задан. */
  tag?: string;
  addedByOwner: boolean;
}

export interface Conversation {
  id: string;
  type?: string;
  title?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  // ---- Группы ----
  description?: string | null;
  ownerId?: string | null;
  adminIds?: string[];
  adminPermissions?: Record<string, GroupPermissions>;
  adminDefaults?: GroupPermissions;
  inviteCode?: string | null;
  permissions?: GroupPermissions;
  restrictions?: Record<string, GroupPermissions>;
  mutedMembers?: Record<string, string | null>;
  /** Теги участников внутри группы: id участника → подпись рядом с именем. */
  memberTags?: Record<string, string>;
  history?: GroupEvent[];
  // ---- Знаки владельца Yargram у группы ----
  /** Галочка «подтверждённая группа»: рисуется справа от названия. */
  isVerified?: boolean;
  /** Значок Yargram: рисуется слева от названия. */
  badge?: 'yargram' | null;
  /** Отметка SCAM: описание группы подменяется предупреждением. */
  scam?: boolean;
  /** Отметка FAKE: группа выдаёт себя за официальную. Как у аккаунта. */
  fake?: boolean;
  /** Роль смотрящего в группе; у личного диалога и «Избранного» — нет. */
  role?: GroupRole | null;
  /** Эффективные права смотрящего: по ним клиент гасит кнопки. */
  myPermissions?: EffectiveGroupPermissions;
  memberCount?: number;
  participants?: Participant[];
  members?: Participant[];
  /** Идентификаторы участников: по ним считается роль в группе. */
  memberIds?: string[];
  users?: User[];
  otherUser?: User;
  lastMessage?: Message | null;
  lastMessageAt?: string | null;
  updatedAt?: string;
  unreadCount?: number;
  pinnedMessage?: Message | null;
  pinnedMessages?: Message[];
  archived?: boolean;
  mutedUntil?: string | null;
  blocked?: boolean;
  /** Я заблокировал собеседника: писать и звонить нельзя. */
  blockedByMe?: boolean;
  /** Собеседник заблокировал меня: писать можно, но ему это не доставляется. */
  blockedByPeer?: boolean;
}

/**
 * Группа в списке админ-панели: название, размер и знаки владельца Yargram.
 * Знаки выдаются самой группе, а не её создателю.
 */
export interface AdminGroup {
  id: string;
  title: string;
  memberCount: number;
  isVerified: boolean;
  badge: 'yargram' | null;
  scam: boolean;
  fake: boolean;
  /** Код из ссылки-приглашения: по нему группу тоже можно найти. */
  inviteCode: string | null;
}

/** Сводка владельцу: сколько всего заведено в Yargram. */
export interface AdminStats {
  /** Все аккаунты, включая удалённые: удаление мягкое, запись остаётся. */
  totalUsers: number;
  /** Все группы, без личных диалогов и «Избранного». */
  groups: number;
}

/** Какие аккаунты показывает список по состоянию записи. */
export type AdminAccountsFilter = 'all' | 'active' | 'frozen' | 'deleted';

/** Знак владельца, по которому отсеивается список. Галочки складываются. */
export type AdminAccountsMark = 'verified' | 'badge' | 'scam' | 'fake' | 'owner' | 'bot';

/** Где искать введённое: только ник, только @юзернеймы или всё сразу. */
export type AdminAccountsScope = 'any' | 'name' | 'handle';

/**
 * Аккаунт в списке владельца: ник и аватар показываем **настоящие**, даже у
 * удалённого — владелец как раз и ищет, кого удалил, по имени. Даты лежат
 * рядом: когда заведён и когда удалён.
 */
export interface AdminAccount {
  id: string;
  displayName: string;
  /** Основной @юзернейм. */
  username: string | null;
  /** Дополнительные @юзернеймы: показываем сколько умещается. */
  usernames: string[];
  avatarUrl: string | null;
  isVerified: boolean;
  badge: 'yargram' | null;
  scam: boolean;
  fake: boolean;
  /** Аккаунт владельца Yargram: у него особые права. */
  isOwner: boolean;
  isFrozen: boolean;
  isDeleted: boolean;
  /** Служебный бот: рядом с именем метка «BOT», а войти в него нельзя. */
  isBot: boolean;
  createdAt: string;
  /** Когда аккаунт удалили; `null`, если он не удалён. */
  deletedAt: string | null;
  /**
   * Когда владелец последний раз заходил. Не `null` никогда — у старых записей
   * подставляется дата создания.
   */
  lastSeenAt: string;
}

export interface AuthResult {
  accessToken: string;
  user?: User;
}

/** Зачем сервер прислал код из письма. */
export type EmailCodePurpose = 'register' | 'login' | 'reset';

/**
 * Ответ вместо токена: доступ ещё не выдан, ждём код из письма.
 * `expiresInSeconds` нужен, чтобы показать обратный отсчёт.
 */
export interface EmailCodeChallenge {
  status: 'code_sent';
  email: string;
  purpose: EmailCodePurpose;
  expiresInSeconds: number;
}

export interface PaginatedItems<T> {
  items: T[];
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  username?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  showLastSeen?: boolean;
  callPrivacy?: CallPrivacyRule;
  callPrivacyAllowedUserIds?: string[];
  callPrivacyDeniedUserIds?: string[];
  displayName?: string;
  username?: string;
  bio?: string;
  themeColor?: string;
  wallpaperUrl?: string;
  wallpaperMimeType?: string;
  wallpaperAttachmentId?: string | null;
  bannerColor?: string | null;
  bannerUrl?: string | null;
  bannerAttachmentId?: string | null;
  notificationSoundEnabled?: boolean;
  birthday?: string | null;
  /** Через сколько дней бездействия сеанс завершается сам; `null` — никогда. */
  sessionAutoTerminateDays?: number | null;
  /**
   * Язык интерфейса. Сам интерфейс переводится на клиенте, а это поле нужно
   * серверу: служебный бот поддержки пишет сообщения из сервера и должен
   * отвечать на том же языке, что и кнопки вокруг.
   */
  language?: Language;
}

export interface ReadReceipt {
  conversationId: string;
  messageIds: string[];
  userId: string;
  readAt: string;
}

export interface FavoriteNote {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ConversationDraft {
  id: string;
  userId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string;
  updatedAt: string;
}

export interface ChatFolder {
  id: string;
  userId: string;
  name: string;
  position: number;
  conversationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ScheduledMessageStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface ScheduledMessage {
  id: string;
  userId: string;
  conversationId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string;
  sendAt: string;
  status: ScheduledMessageStatus;
  createdAt: string;
  sentAt?: string;
  messageId?: string;
  failureReason?: string;
}

export type ReportReason = 'spam' | 'abuse' | 'fraud' | 'other';


