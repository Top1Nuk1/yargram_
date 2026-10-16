import { createHash } from "node:crypto";
import type { Session, User } from "../domain/models.js";
import { AppError } from "../lib/errors.js";
import type { SessionContext } from "../lib/session-context.js";
import type { RealtimeEvents } from "../realtime/events.js";
import type { SessionRepository, UserRepository } from "../repositories/types.js";

/**
 * Право завершать чужие сеансы появляется не сразу, а через сутки после входа.
 *
 * Смысл в том, что чужой пароль не должен выкидывать владельца: если в аккаунт
 * зашли со нового сайта, у человека есть день, чтобы увидеть предупреждение,
 * закрыть чужой вход и сменить пароль. Свой сеанс закрыть можно всегда —
 * запрет касается только чужих.
 */
export const SESSION_TERMINATION_GATE_MS = 24 * 60 * 60 * 1_000;

/** Сколько живёт запись о завершённом сеансе, прежде чем её стереть. */
const TOMBSTONE_TTL_MS = 30 * 86_400_000;
/** «Последняя активность» обновляется не чаще раза в минуту: иначе на каждый
 *  запрос приходилась бы запись в базу. */
const TOUCH_INTERVAL_MS = 60_000;
/** Сколько токенов помнит один сеанс. Повторные входы с того же сайта и
 *  браузера складываются сюда, а не плодят новые строки в списке. */
const MAX_TOKEN_HASHES = 20;

const DAY_MS = 86_400_000;

/** Отпечаток токена. Сам токен в базе не лежит. */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Сеанс простаивает дольше срока из настроек. `null` и отсутствие настройки
 * означают «никогда» — сеанс живёт, пока его не закроют руками.
 */
export function sessionIsExpired(
  session: Session,
  user: Pick<User, "sessionAutoTerminateDays"> | null | undefined,
  now = Date.now(),
): boolean {
  const days = user?.sessionAutoTerminateDays;
  if (days === null || days === undefined) return false;
  return now - Date.parse(session.lastSeenAt) > days * DAY_MS;
}

/** Достаточно ли сеанс «взрослый», чтобы закрывать остальные. */
export function canTerminateOthers(session: Session, now = Date.now()): boolean {
  return now - Date.parse(session.createdAt) >= SESSION_TERMINATION_GATE_MS;
}

/**
 * Привязывает токен к сеансу: находит живой сеанс того же сайта и браузера или
 * заводит новый. `newDevice` помечает вход с незнакомого сайта — его владельцу
 * покажут отдельным окном.
 */
export async function attachSession(
  sessions: SessionRepository,
  userId: string,
  tokenHash: string,
  context?: SessionContext,
  options: { newDevice?: boolean } = {},
): Promise<Session> {
  const site = context?.site ?? "";
  const device = context?.device ?? "";
  const deviceId = context?.deviceId;
  const timestamp = new Date().toISOString();
  const userSessions = await sessions.listForUser(userId);
  const existing = userSessions.find(
    (candidate) =>
      !candidate.terminatedAt &&
      (deviceId && candidate.deviceId
        ? candidate.deviceId === deviceId
        : candidate.site === site && candidate.device === device),
  );

  let customDeviceName = context?.customDeviceName;
  if (!customDeviceName && deviceId) {
    customDeviceName = (await sessions.findDeviceName(deviceId)) ?? undefined;
  }

  if (existing) {
    const hashes = [...new Set([...existing.tokenHashes, tokenHash])];
    return sessions.update(existing.id, {
      tokenHashes: hashes.slice(-MAX_TOKEN_HASHES),
      lastSeenAt: timestamp,
      ...(deviceId && !existing.deviceId ? { deviceId } : {}),
      ...(customDeviceName && !existing.customDeviceName ? { customDeviceName } : {}),
    });
  }
  return sessions.create({
    userId,
    tokenHashes: [tokenHash],
    site,
    device,
    ...(deviceId ? { deviceId } : {}),
    ...(customDeviceName ? { customDeviceName } : {}),
    newDevice: options.newDevice ?? false,
  });
}

export type SessionView = {
  id: string;
  site: string;
  device: string;
  deviceId?: string | undefined;
  customDeviceName?: string | null | undefined;
  createdAt: string;
  lastSeenAt: string;
  /** Это тот сеанс, с которого смотрят список. */
  current: boolean;
  /** Вход был с незнакомого сайта. */
  newDevice: boolean;
  /** Владелец подтвердил: «это был я». */
  acknowledged: boolean;
};

export type SessionOverview = {
  sessions: SessionView[];
  currentSessionId: string | null;
  /** Можно ли закрывать чужие сеансы: право появляется через сутки после входа. */
  canTerminateOthers: boolean;
  /** Когда право появится. Пока его нет — в интерфейсе идёт обратный отсчёт. */
  gateUntil: string | null;
  /** Вход с нового сайта, который владелец ещё не подтвердил. */
  alert: SessionView | null;
  /** Через сколько дней бездействия сеанс закрывается сам; `null` — никогда. */
  autoTerminateDays: number | null;
};

function toView(session: Session, current: boolean): SessionView {
  return {
    id: session.id,
    site: session.site,
    device: session.device,
    deviceId: session.deviceId,
    customDeviceName: session.customDeviceName ?? null,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    current,
    newDevice: session.newDevice ?? false,
    acknowledged: Boolean(session.acknowledgedAt),
  };
}

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly events: RealtimeEvents,
  ) {}

  /** Список сеансов глазами их владельца. */
  async overview(userId: string, token: string | null): Promise<SessionOverview> {
    const user = await this.users.findById(userId);
    await this.sweep(userId, user);

    const hash = token ? tokenFingerprint(token) : null;
    const alive = (await this.sessions.listForUser(userId)).filter((session) => !session.terminatedAt);
    const current = hash ? alive.find((session) => session.tokenHashes.includes(hash)) ?? null : null;
    const views = alive
      .map((session) => toView(session, session.id === current?.id))
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
    // Свой сеанс поднимаем наверх: человек открывает список, чтобы найти себя.
    if (current) {
      const index = views.findIndex((view) => view.current);
      if (index > 0) views.unshift(...views.splice(index, 1));
    }

    const isOldSession = current ? canTerminateOthers(current) : false;
    const alertCandidate = isOldSession
      ? alive
          .filter((s) => s.id !== current?.id && s.newDevice && !s.acknowledgedAt)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
      : null;

    return {
      sessions: views,
      currentSessionId: current?.id ?? null,
      canTerminateOthers: isOldSession,
      gateUntil: current ? new Date(Date.parse(current.createdAt) + SESSION_TERMINATION_GATE_MS).toISOString() : null,
      alert: alertCandidate ? toView(alertCandidate, false) : null,
      autoTerminateDays: user?.sessionAutoTerminateDays ?? null,
    };
  }

  /** Закрыть один сеанс. Свой — можно всегда, чужой — через сутки после входа. */
  async terminate(userId: string, token: string | null, sessionId: string): Promise<SessionOverview> {
    const target = await this.sessions.findById(sessionId);
    if (!target || target.userId !== userId || target.terminatedAt) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Сеанс не найден или уже завершён");
    }
    const current = await this.currentSession(token);
    if (current && current.id !== target.id && !canTerminateOthers(current)) {
      throw new AppError(
        403,
        "SESSION_TOO_NEW",
        "Завершать другие сеансы можно через 24 часа после входа",
      );
    }
    const terminated = await this.sessions.update(sessionId, {
      terminatedAt: new Date().toISOString(),
    });
    this.events.publishSessionTerminated({ userId, tokenHashes: terminated.tokenHashes });
    return this.overview(userId, token);
  }

  /** Закрыть все сеансы, кроме того, с которого это сделали. */
  async terminateAll(userId: string, token: string | null): Promise<SessionOverview> {
    const current = await this.currentSession(token);
    if (current && !canTerminateOthers(current)) {
      throw new AppError(
        403,
        "SESSION_TOO_NEW",
        "Завершать другие сеансы можно через 24 часа после входа",
      );
    }
    const timestamp = new Date().toISOString();
    const hashes: string[] = [];
    for (const session of await this.sessions.listForUser(userId)) {
      if (session.terminatedAt) continue;
      if (current && session.id === current.id) continue;
      await this.sessions.update(session.id, { terminatedAt: timestamp });
      hashes.push(...session.tokenHashes);
    }
    if (hashes.length > 0) this.events.publishSessionTerminated({ userId, tokenHashes: hashes });
    return this.overview(userId, token);
  }

  /** Владелец подтвердил вход: «это был я». Окно больше не показываем. */
  async acknowledge(
    userId: string,
    sessionId: string,
    token: string | null,
  ): Promise<SessionOverview> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Сеанс не найден");
    }
    await this.sessions.update(sessionId, { acknowledgedAt: new Date().toISOString() });
    return this.overview(userId, token);
  }

  /** Переименовать устройство. Новое имя сохраняется на сервере и отображается для всех сеансов с этого устройства. */
  async rename(
    userId: string,
    sessionId: string,
    rawName: string,
    token: string | null,
  ): Promise<SessionOverview> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId || session.terminatedAt) {
      throw new AppError(404, "SESSION_NOT_FOUND", "Сеанс не найден или уже завершён");
    }
    const trimmed = rawName.trim();
    const finalName = trimmed.length > 0 ? trimmed.slice(0, 100) : null;

    await this.sessions.update(sessionId, { customDeviceName: finalName });
    if (session.deviceId) {
      await this.sessions.updateDeviceName(session.deviceId, finalName);
    }
    return this.overview(userId, token);
  }

  private async currentSession(token: string | null): Promise<Session | null> {
    if (!token) return null;
    return this.sessions.findByTokenHash(tokenFingerprint(token));
  }

  /**
   * Автозавершение. Простаивающие сеансы помечаем завершёнными (не стираем:
   * стёртый токен при следующем запросе приняли бы за новый вход), а записи о
   * давно завершённых стираем, чтобы список не рос бесконечно.
   */
  private async sweep(userId: string, user: User | null): Promise<void> {
    const now = Date.now();
    for (const session of await this.sessions.listForUser(userId)) {
      if (session.terminatedAt) {
        if (now - Date.parse(session.terminatedAt) > TOMBSTONE_TTL_MS) await this.sessions.delete(session.id);
        continue;
      }
      if (sessionIsExpired(session, user, now)) {
        await this.sessions.update(session.id, { terminatedAt: new Date(now).toISOString() });
      }
    }
  }
}

/** Раз в минуту достаточно: «последняя активность» не требует точности до запроса. */
export function shouldTouch(session: Session, now = Date.now()): boolean {
  return now - Date.parse(session.lastSeenAt) > TOUCH_INTERVAL_MS;
}
