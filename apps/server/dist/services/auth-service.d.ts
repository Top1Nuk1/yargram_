import { type UpdateUserInput, type UserRepository } from "../repositories/types.js";
import { type CurrentUser, type EmailCodePurpose, type User } from "../domain/models.js";
import type { SessionContext } from "../lib/session-context.js";
import type { SessionRepository } from "../repositories/types.js";
import type { MailService } from "./mail-service.js";
export type RegisterInput = {
    email: string;
    password: string;
    displayName: string;
    username?: string;
};
/** Откуда человек вошёл: сайт и браузер. По ним ведём список сеансов. */
export type AuthContext = SessionContext;
export type AuthResult = {
    accessToken: string;
    user: CurrentUser;
};
/**
 * Ответ вместо токена: доступ ещё не выдан, ждём код из письма.
 * `expiresInSeconds` нужен клиенту, чтобы показать обратный отсчёт.
 */
export type EmailCodeChallenge = {
    status: "code_sent";
    email: string;
    purpose: EmailCodePurpose;
    expiresInSeconds: number;
};
export declare class AuthService {
    private readonly users;
    private readonly options;
    constructor(users: UserRepository, options: {
        jwtSecret: string;
        jwtExpiresIn: string;
        bcryptRounds: number;
        /** Отправка писем. Без него код выдаётся, но письмо не уходит — на этом
         *  держатся тесты и разработка с драйвером `console`. */
        mail?: MailService | undefined;
        /** Требовать код из письма при регистрации и входе. */
        emailConfirmation?: boolean | undefined;
        /** Срок жизни кода; по умолчанию 10 минут. */
        emailCodeTtlSeconds?: number | undefined;
        /** Сеансы: по ним токен находит свой вход и его можно завершить. */
        sessions: SessionRepository;
    });
    register(input: RegisterInput, context?: AuthContext): Promise<AuthResult | EmailCodeChallenge>;
    login(emailInput: string, password: string, context?: AuthContext): Promise<AuthResult | EmailCodeChallenge>;
    getCurrentUser(userId: string): Promise<CurrentUser>;
    updateProfile(userId: string, input: UpdateUserInput): Promise<CurrentUser>;
    authenticateToken(token: string, context?: AuthContext): Promise<string>;
    /**
     * Выдаёт новый код и отправляет его письмом. В базу кладём хеш, а не сам
     * код: утечка базы не должна дарить готовый код для входа.
     * Возвращает срок жизни кода в секундах.
     *
     * `rotate` — повторная отправка. Письмо уходит со следующего ящика: если
     * предыдущее не дошло (улетело в спам, потерялось), повтор по тому же пути
     * попал бы в ту же папку «Спам». См. `MailService`.
     */
    private issueCode;
    /** Стирает действующий код: принять его больше нельзя. */
    private clearCode;
    /** Находит владельца действующего кода или объясняет, почему код не подходит. */
    private findUserForCode;
    private assertCodeMatches;
    /**
     * Проверяет код и выдаёт токен. Код из письма подтверждает владение почтой,
     * поэтому заодно выставляем `emailVerified`.
     */
    confirmCode(emailInput: string, code: string, purpose: EmailCodePurpose, context?: AuthContext): Promise<AuthResult>;
    /**
     * Повторная отправка: предыдущий код сгорает, действует только свежий.
     * Письмо уходит со следующего ящика — см. `issueCode`.
     */
    resendCode(emailInput: string, purpose: EmailCodePurpose): Promise<EmailCodeChallenge>;
    /**
     * Запрос на сброс пароля. Если почты в базе нет — отвечаем так же, как при
     * успехе: иначе по ответу можно узнать, существует ли такой аккаунт.
     */
    requestPasswordReset(emailInput: string): Promise<EmailCodeChallenge>;
    /** Сброс пароля по коду из письма: код списывается, сразу выдаётся токен. */
    resetPassword(emailInput: string, code: string, newPassword: string, context?: AuthContext): Promise<AuthResult>;
    /**
     * Запрос кода на удаление своего аккаунта.
     * Сначала проверяем правильность пароля, и только затем высылаем код на почту.
     */
    requestAccountDeletion(userId: string, password: string): Promise<EmailCodeChallenge>;
    /**
     * Проверка кода для удаления аккаунта.
     */
    verifyDeletionCode(userId: string, code: string): Promise<User>;
    private createResult;
    /**
     * Привязывает выданный токен к сеансу — существующему или новому.
     *
     * Вход с незнакомого сайта помечаем: владельцу покажут окно «новый вход».
     * На самый первый вход в аккаунт пометку не ставим — сравнивать ещё не с чем,
     * и пугать человека окном про его же собственный вход незачем.
     */
    private registerSession;
}
