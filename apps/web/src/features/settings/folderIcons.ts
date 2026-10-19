import {
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Cat,
  ClipboardList,
  Coins,
  Crown,
  Flower2,
  Folder,
  Gamepad2,
  GraduationCap,
  Heart,
  Home,
  Lightbulb,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Music,
  Paintbrush,
  Plane,
  Send,
  Star,
  ThumbsUp,
  TrendingUp,
  Trophy,
  User,
  Users,
  VenetianMask,
  Wine,
  type LucideIcon,
} from 'lucide-react';

export interface FolderIconOption {
  id: string;
  name: string;
  Icon: LucideIcon;
}

export const FOLDER_ICONS: FolderIconOption[] = [
  { id: 'cat', name: 'Кот', Icon: Cat },
  { id: 'book', name: 'Книга', Icon: BookOpen },
  { id: 'coins', name: 'Монеты', Icon: Coins },
  { id: 'gamepad', name: 'Игры', Icon: Gamepad2 },
  { id: 'lightbulb', name: 'Идеи', Icon: Lightbulb },
  { id: 'like', name: 'Лайк', Icon: ThumbsUp },
  { id: 'music', name: 'Музыка', Icon: Music },
  { id: 'paintbrush', name: 'Творчество', Icon: Paintbrush },
  { id: 'plane', name: 'Путешествия', Icon: Plane },
  { id: 'trophy', name: 'Победы', Icon: Trophy },
  { id: 'star', name: 'Избранное', Icon: Star },
  { id: 'cap', name: 'Учёба', Icon: GraduationCap },
  { id: 'send', name: 'Отправка', Icon: Send },
  { id: 'user', name: 'Контакты', Icon: User },
  { id: 'users', name: 'Группы', Icon: Users },
  { id: 'chat', name: 'Чат', Icon: MessageSquare },
  { id: 'message', name: 'Сообщение', Icon: MessageCircle },
  { id: 'bot', name: 'Боты', Icon: Bot },
  { id: 'crown', name: 'VIP', Icon: Crown },
  { id: 'flower', name: 'Цветы', Icon: Flower2 },
  { id: 'home', name: 'Дом', Icon: Home },
  { id: 'heart', name: 'Любимое', Icon: Heart },
  { id: 'mask', name: 'Театр', Icon: VenetianMask },
  { id: 'cocktail', name: 'Отдых', Icon: Wine },
  { id: 'chart', name: 'Тренды', Icon: TrendingUp },
  { id: 'briefcase', name: 'Работа', Icon: Briefcase },
  { id: 'bell', name: 'Уведомления', Icon: Bell },
  { id: 'megaphone', name: 'Каналы', Icon: Megaphone },
  { id: 'folder', name: 'Папка', Icon: Folder },
  { id: 'clipboard', name: 'Задачи', Icon: ClipboardList },
];

export function getFolderIconComponent(iconId?: string | null): LucideIcon {
  if (!iconId) return Folder;
  const match = FOLDER_ICONS.find((item) => item.id === iconId);
  return match?.Icon ?? Folder;
}
