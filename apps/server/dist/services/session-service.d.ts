import type { Session, User } from "../domain/models.js";
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
export declare const SESSION_TERMINATION_GATE_MS: number;
/** Отпечаток токена. Сам токен в базе не лежит. */
export declare function tokenFingerprint(token: string): string;
/**
 * Сеанс простаивает дольше срока из настроек. `null` и отсутствие настройки
 * означают «никогда» — сеанс живёт, пока его не закроют руками.
 */
export declare function sessionIsExpired(session: Session, user: Pick<User, "sessionAutoTerminateDays"> | null | undefined, now?: number): boolean;
/** Достаточно ли сеанс «взрослый», чтобы закрывать остальные. */
export declare function canTerminateOthers(session: Session, now?: number): boolean;
/**
 * Привязывает токен к сеансу: находит живой сеанс того же сайта и браузера или
 * заводит новый. `newDevice` помечает вход с незнакомого сайта — его владельцу
 * покажут отдельным окном.
 */
export declare function attachSession(sessions: SessionRepository, userId: string, tokenHash: string, context?: SessionContext, options?: {
    newDevice?: boolean;
}): Promise<Session>;
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
export declare class SessionService {
    private readonly sessions;
    private readonly users;
    private readonly events;
    constructor(sessions: SessionRepository, users: UserRepository, events: RealtimeEvents);
    /** Список сеансов глазами их владельца. */
    overview(userId: string, token: string | null): Promise<SessionOverview>;
    /** Закрыть один сеанс. Свой — можно всегда, чужой — через сутки после входа. */
    terminate(userId: string, token: string | null, sessionId: string): Promise<SessionOverview>;
    /** Закрыть все сеансы, кроме того, с которого это сделали. */
    terminateAll(userId: string, token: string | null): Promise<SessionOverview>;
    /** Владелец подтвердил вход: «это был я». Окно больше не показываем. */
    acknowledge(userId: string, sessionId: string, token: string | null): Promise<SessionOverview>;
    /** Переименовать устройство. Новое имя сохраняется на сервере и отображается для всех сеансов с этого устройства. */
    rename(userId: string, sessionId: string, rawName: string, token: string | null): Promise<SessionOverview>;
    private currentSession;
    /**
     * Автозавершение. Простаивающие сеансы помечаем завершёнными (не стираем:
     * стёртый токен при следующем запросе приняли бы за новый вход), а записи о
     * давно завершённых стираем, чтобы список не рос бесконечно.
     */
    private sweep;
}
/** Раз в минуту достаточно: «последняя активность» не требует точности до запроса. */
export declare function shouldTouch(session: Session, now?: number): boolean;
