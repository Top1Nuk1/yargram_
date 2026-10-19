import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { Avatar, Button, IconButton } from '../../components/ui';
import { conversationTitle } from '../../lib/conversation';
import { groupTitle, isGroup } from '../../lib/group';
import { useTranslation } from '../../hooks/useLanguage';
import type { ChatFolder, Conversation, User } from '../../types';
import { FOLDER_ICONS, getFolderIconComponent } from './folderIcons';

interface FoldersScreenProps {
  user: User;
  folders: ChatFolder[];
  conversations: Conversation[];
  onFolderCreate: (input: { name: string; conversationIds: string[]; icon?: string | null }) => Promise<void>;
  onFolderUpdate: (folderId: string, input: { name?: string; conversationIds?: string[]; icon?: string | null }) => Promise<void>;
  onFolderDelete: (folderId: string) => Promise<void>;
  onClose: () => void;
}

function pluralizeChats(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${count} чатов`;
  if (mod10 === 1) return `${count} чат`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} чата`;
  return `${count} чатов`;
}

export function FoldersScreen({
  user,
  folders,
  conversations,
  onFolderCreate,
  onFolderUpdate,
  onFolderDelete,
  onClose,
}: FoldersScreenProps) {
  const t = useTranslation();
  const [editingFolder, setEditingFolder] = useState<ChatFolder | 'new' | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Recommended folder presets
  const recommended = useMemo(() => {
    const existingNames = new Set(folders.map((f) => f.name.toLowerCase()));
    const items = [
      {
        id: 'personal',
        name: 'Личные',
        subtitle: 'Чаты с пользователями',
        icon: 'user',
        conversationIds: conversations.filter((c) => !isGroup(c)).map((c) => c.id),
      },
      {
        id: 'groups',
        name: 'Группы',
        subtitle: 'Все группы',
        icon: 'users',
        conversationIds: conversations.filter((c) => isGroup(c)).map((c) => c.id),
      },
      {
        id: 'unread',
        name: 'Непрочитанные',
        subtitle: 'Новые сообщения',
        icon: 'chat',
        conversationIds: conversations.filter((c) => (c.unreadCount ?? 0) > 0).map((c) => c.id),
      },
    ];
    return items.filter((item) => !existingNames.has(item.name.toLowerCase()));
  }, [folders, conversations]);

  const handleAddRecommended = async (item: typeof recommended[0]) => {
    if (busy) return;
    setBusy(true);
    try {
      await onFolderCreate({
        name: item.name,
        conversationIds: item.conversationIds,
        icon: item.icon,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onFolderDelete(folderId);
      setDeleteConfirmId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <IconButton label="Назад" onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-canvas">
              <ArrowLeft className="h-5 w-5" />
            </IconButton>
            <h2 className="text-lg font-bold text-ink">Папки с чатами</h2>
          </div>
          <IconButton label="Закрыть" onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-canvas">
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 space-y-6">
          {/* Hero Illustration & Hint */}
          <div className="flex flex-col items-center text-center px-4 pt-2">
            <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand/10 text-brand shadow-inner">
              <FolderIcon className="h-10 w-10 text-brand" />
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white shadow">
                <Plus className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="max-w-xs text-sm text-muted">
              Создавайте папки для разных групп чатов и переключайтесь между ними.
            </p>
          </div>

          {/* Section: My Folders */}
          <div>
            <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">
              Мои папки
            </div>
            <div className="overflow-hidden rounded-2xl border border-line bg-canvas divide-y divide-line">
              {folders.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted">
                  У вас пока нет созданных папок
                </div>
              ) : (
                folders.map((folder) => {
                  const Icon = getFolderIconComponent(folder.icon);
                  const count = folder.conversationIds.length;
                  return (
                    <div
                      key={folder.id}
                      className="group flex items-center justify-between p-3.5 transition hover:bg-surface"
                    >
                      <button
                        type="button"
                        onClick={() => setEditingFolder(folder)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink">
                            {folder.name}
                          </div>
                          <div className="text-xs text-muted">
                            {count > 0 ? pluralizeChats(count) : 'Все чаты исключены'}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 pl-2">
                        <IconButton
                          label="Редактировать папку"
                          onClick={() => setEditingFolder(folder)}
                          className="h-8 w-8 rounded-lg text-muted hover:text-brand hover:bg-canvas"
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="Удалить папку"
                          onClick={() => setDeleteConfirmId(folder.id)}
                          className="h-8 w-8 rounded-lg text-muted hover:text-danger hover:bg-canvas"
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Create new folder button */}
            <button
              type="button"
              onClick={() => setEditingFolder('new')}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand/40 bg-brand/5 py-3 text-sm font-semibold text-brand transition hover:bg-brand/10 hover:border-brand"
            >
              <FolderPlus className="h-4 w-4" />
              Создать новую папку
            </button>
          </div>

          {/* Section: Recommended Folders */}
          {recommended.length > 0 && (
            <div>
              <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">
                Рекомендованные папки
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-canvas divide-y divide-line">
                {recommended.map((item) => {
                  const Icon = getFolderIconComponent(item.icon);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3.5 transition hover:bg-surface"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink">
                            {item.name}
                          </div>
                          <div className="text-xs text-muted">{item.subtitle}</div>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void handleAddRecommended(item)}
                        className="rounded-xl px-4 py-1.5 text-xs font-semibold text-brand hover:bg-brand hover:text-white"
                      >
                        Добавить
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h3 className="text-base font-bold text-ink">Удалить папку?</h3>
            <p className="mt-2 text-sm text-muted">
              Чаты из этой папки не будут удалены и останутся в общем списке.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setDeleteConfirmId(null)}
              >
                Отмена
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void handleDeleteFolder(deleteConfirmId)}
              >
                Удалить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Edit Modal */}
      {editingFolder && (
        <FolderEditModal
          folder={editingFolder === 'new' ? null : editingFolder}
          conversations={conversations}
          currentUserId={user.id}
          onSave={async (data) => {
            if (editingFolder === 'new') {
              await onFolderCreate(data);
            } else {
              await onFolderUpdate(editingFolder.id, data);
            }
            setEditingFolder(null);
          }}
          onClose={() => setEditingFolder(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folder Edit Modal (Image 4)
// ---------------------------------------------------------------------------

interface FolderEditModalProps {
  folder: ChatFolder | null;
  conversations: Conversation[];
  currentUserId: string;
  onSave: (data: { name: string; conversationIds: string[]; icon?: string | null }) => Promise<void>;
  onClose: () => void;
}

export function FolderEditModal({
  folder,
  conversations,
  currentUserId,
  onSave,
  onClose,
}: FolderEditModalProps) {
  const t = useTranslation();
  const [name, setName] = useState(folder?.name ?? '');
  const [icon, setIcon] = useState<string | null>(folder?.icon ?? 'folder');
  const [selectedIds, setSelectedIds] = useState<string[]>(folder?.conversationIds ?? []);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [chatSelectOpen, setChatSelectOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const CurrentIcon = getFolderIconComponent(icon);

  const selectedConversations = useMemo(() => {
    const map = new Map(conversations.map((c) => [c.id, c]));
    return selectedIds.map((id) => map.get(id)).filter(Boolean) as Conversation[];
  }, [conversations, selectedIds]);

  const handleRemoveConversation = (id: string) => {
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        conversationIds: selectedIds,
        icon: icon ?? null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-bold text-ink">
            {folder ? 'Изменить папку' : 'Новая папка'}
          </h3>
          <IconButton label="Закрыть" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-canvas">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Form Body */}
        <div className="overflow-y-auto p-5 space-y-5">
          {/* Icon + Folder Name row */}
          <div className="flex items-center gap-4">
            {/* Round Icon Button with pencil badge */}
            <button
              type="button"
              onClick={() => setIconPickerOpen(true)}
              className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-2 ring-transparent transition hover:ring-brand/40"
              title="Выбрать значок"
            >
              <CurrentIcon className="h-7 w-7" />
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white shadow">
                <Pencil className="h-2.5 w-2.5" />
              </div>
            </button>

            {/* Folder Name Input */}
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                autoFocus
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название папки"
                className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-sm text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
              />
              <span className="absolute right-3 top-3.5 text-[11px] text-muted tabular-nums">
                {name.length}/40
              </span>
            </div>
          </div>

          {/* Section: Included Chats */}
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Включённые чаты
              </span>
              <span className="text-xs text-muted tabular-nums">
                {selectedIds.length}
              </span>
            </div>

            {/* Add Chats Button */}
            <button
              type="button"
              onClick={() => setChatSelectOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-line bg-canvas px-4 py-3 text-xs font-semibold text-brand transition hover:bg-brand/5 hover:border-brand/50"
            >
              <Plus className="h-4 w-4" />
              Добавить чаты и группы
            </button>

            {/* Selected Chats List */}
            {selectedConversations.length > 0 && (
              <div className="mt-2.5 max-h-56 overflow-y-auto rounded-2xl border border-line bg-canvas divide-y divide-line">
                {selectedConversations.map((conv) => {
                  const group = isGroup(conv);
                  const title = group
                    ? groupTitle(conv)
                    : conversationTitle(conv, currentUserId, t);
                  return (
                    <div
                      key={conv.id}
                      className="flex items-center justify-between px-3 py-2 text-left"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <Avatar
                          src={conv.avatarUrl ?? undefined}
                          name={title}
                          className="h-8 w-8 text-xs"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-ink">
                            {title}
                          </div>
                          <div className="text-[10px] text-muted">
                            {group ? 'Группа' : 'Чат'}
                          </div>
                        </div>
                      </div>
                      <IconButton
                        label="Удалить из папки"
                        onClick={() => handleRemoveConversation(conv.id)}
                        className="h-7 w-7 rounded-lg text-muted hover:text-danger hover:bg-surface"
                      >
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5 bg-canvas/40">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving}
          >
            {folder ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </div>

      {/* Icon Picker Modal */}
      {iconPickerOpen && (
        <IconPickerModal
          selectedIconId={icon}
          onSelect={(selected) => setIcon(selected)}
          onClose={() => setIconPickerOpen(false)}
        />
      )}

      {/* Chat Selector Modal */}
      {chatSelectOpen && (
        <ChatSelectorModal
          conversations={conversations}
          currentUserId={currentUserId}
          selectedIds={selectedIds}
          onDone={(ids) => setSelectedIds(ids)}
          onClose={() => setChatSelectOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon Picker Modal (Image 5)
// ---------------------------------------------------------------------------

interface IconPickerModalProps {
  selectedIconId?: string | null;
  onSelect: (iconId: string) => void;
  onClose: () => void;
}

export function IconPickerModal({
  selectedIconId,
  onSelect,
  onClose,
}: IconPickerModalProps) {
  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h4 className="text-base font-bold text-ink">Выберите значок</h4>
          <IconButton label="Закрыть" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-canvas">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-5 gap-2.5">
            {FOLDER_ICONS.map((item) => {
              const Icon = item.Icon;
              const isSelected = selectedIconId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className={`group relative flex h-14 flex-col items-center justify-center rounded-2xl border transition ${
                    isSelected
                      ? 'border-brand bg-brand/15 text-brand shadow-sm ring-2 ring-brand/30'
                      : 'border-line/60 bg-canvas/60 text-ink/80 hover:border-brand/40 hover:bg-brand/5 hover:text-brand'
                  }`}
                  title={item.name}
                >
                  <Icon className="h-6 w-6" />
                  <span className="mt-0.5 max-w-[48px] truncate text-[9px] font-medium text-muted group-hover:text-ink">
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Selector Modal
// ---------------------------------------------------------------------------

interface ChatSelectorModalProps {
  conversations: Conversation[];
  currentUserId: string;
  selectedIds: string[];
  onDone: (selectedIds: string[]) => void;
  onClose: () => void;
}

export function ChatSelectorModal({
  conversations,
  currentUserId,
  selectedIds: initialSelected,
  onDone,
  onClose,
}: ChatSelectorModalProps) {
  const t = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [query, setQuery] = useState('');

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((conv) => {
      const group = isGroup(conv);
      const title = (group ? groupTitle(conv) : conversationTitle(conv, currentUserId, t)).toLowerCase();
      return !q || title.includes(q);
    });
  }, [conversations, query, currentUserId, t]);

  const toggleChat = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h4 className="text-base font-bold text-ink">Выбрать чаты</h4>
          <IconButton label="Закрыть" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-canvas">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Search */}
        <div className="border-b border-line p-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-1.5">
            <Search className="h-4 w-4 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск чатов и групп..."
              className="w-full bg-transparent text-xs text-ink outline-none"
            />
          </div>
        </div>

        {/* Chats List */}
        <div className="overflow-y-auto p-2 space-y-1 divide-y divide-line/40">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted">
              Чаты не найдены
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const group = isGroup(conv);
              const title = group ? groupTitle(conv) : conversationTitle(conv, currentUserId, t);
              const isChecked = selected.has(conv.id);
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => toggleChat(conv.id)}
                  className="flex w-full items-center justify-between rounded-xl p-2.5 text-left transition hover:bg-canvas"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar
                      src={conv.avatarUrl ?? undefined}
                      name={title}
                      className="h-9 w-9 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-ink">
                        {title}
                      </div>
                      <div className="text-[10px] text-muted">
                        {group ? 'Группа' : 'Личный чат'}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition ${
                      isChecked
                        ? 'border-brand bg-brand text-white'
                        : 'border-line bg-canvas'
                    }`}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 bg-canvas/30">
          <span className="text-xs text-muted">
            Выбрано: {selected.size}
          </span>
          <Button
            variant="primary"
            className="px-4 py-1.5 text-xs font-semibold"
            onClick={() => {
              onDone(Array.from(selected));
              onClose();
            }}
          >
            Готово
          </Button>
        </div>
      </div>
    </div>
  );
}
