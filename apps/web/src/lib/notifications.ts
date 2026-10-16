export interface YargramNotificationOptions {
  title: string;
  body: string;
  avatarUrl?: string | null;
  conversationId?: string;
  tag?: string;
  requireInteraction?: boolean;
  onlyWhenHidden?: boolean;
  onClick?: () => void;
}

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function browserNotificationPermission(): NotificationPermission | 'unsupported' {
  return browserNotificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!browserNotificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showBrowserNotification(options: YargramNotificationOptions): Notification | null {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return null;
  if ((options.onlyWhenHidden ?? true) && !document.hidden) return null;

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      ...(options.avatarUrl ? { icon: options.avatarUrl } : {}),
      tag: options.tag ?? (options.conversationId ? `yargram-chat-${options.conversationId}` : undefined),
      ...(options.requireInteraction ? { requireInteraction: true } : {}),
    });
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
    return notification;
  } catch {
    return null;
  }
}
