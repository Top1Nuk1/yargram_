import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../lib/errors.js";
import { RepositoryConflictError, } from "../repositories/types.js";
import { isFailedRegistration, toCurrentUser, } from "../domain/models.js";
import { attachSession, sessionIsExpired, shouldTouch, tokenFingerprint, } from "./session-service.js";
/** Сколько неверных попыток ввода кода допустимо, прежде чем код сгорит. */
const EMAIL_CODE_MAX_ATTEMPTS = 5;
export class AuthService {
    users;
    options;
    constructor(users, options) {
        this.users = users;
        this.options = options;
    }
    async register(input, context) {
        const email = input.email.trim().toLowerCase();
        const username = input.username?.trim().replace(/^@/, "");
        // Почта удалённого или замороженного аккаунта остаётся занятой: на неё
        // нельзя зарегистрировать новый аккаунт.
        const byEmail = await this.users.findByEmail(email);
        if (byEmail) {
            if (byEmail.isDeleted) {
                throw new AppError(409, "EMAIL_RESERVED", "Эта почта принадлежала удалённому аккаунту");
            }
            if (byEmail.isFrozen) {
                throw new AppError(409, "EMAIL_RESERVED", "Эта почта принадлежит замороженному аккаунту");
            }
            // Брошенная регистрация на этой же почте — не помеха: код так и не ввели,
            // аккаунта будто не было. Стираем и продолжаем, как будто почта свободна,
            // — ждать тика уборщика нельзя, иначе человек получил бы «почта занята»
            // на собственную же попытку зарегистрироваться заново.
            if (isFailedRegistration(byEmail)) {
                await this.users.delete(byEmail.id);
            }
            else {
                throw new AppError(409, "EMAIL_TAKEN", "Аккаунт с такой почтой уже существует");
            }
        }
        if (username) {
            const byUsername = await this.users.findByUsername(username);
            // Ник брошенной регистрации освобождаем по тому же правилу.
            if (byUsername && isFailedRegistration(byUsername)) {
                await this.users.delete(byUsername.id);
            }
            else if (byUsername) {
                throw new AppError(409, "USERNAME_TAKEN", "Этот ник уже занят");
            }
        }
        const passwordHash = await bcrypt.hash(input.password, this.options.bcryptRounds);
        let user;
        try {
            user = await this.users.create({
                email,
                passwordHash,
                displayName: input.displayName.trim(),
                ...(username ? { username } : {}),
                // Подтверждение включено — аккаунт рождается неподтверждённым и не
                // получает токен, пока человек не введёт код из письма.
                emailVerified: !this.options.emailConfirmation,
            });
        }
        catch (error) {
            if (error instanceof RepositoryConflictError) {
                const isEmail = error.field === "email";
                throw new AppError(409, isEmail ? "EMAIL_TAKEN" : "USERNAME_TAKEN", isEmail ? "Аккаунт с такой почтой уже существует" : "Этот ник уже занят");
            }
            throw error;
        }
        if (!this.options.emailConfirmation)
            return this.createResult(user, context);
        const registerTtl = await this.issueCode(user, "register");
        return {
            status: "code_sent",
            email: user.email,
            purpose: "register",
            expiresInSeconds: registerTtl,
        };
    }
    async login(emailInput, password, context) {
        const user = await this.users.findByEmail(emailInput.trim().toLowerCase());
        // Служебный аккаунт бота — это адрес поддержки, а не человек. Пароль у него
        // случайный, но запрет нужен явно: иначе однажды кто-то задал бы ему пароль
        // и вошёл в него как в обычный аккаунт.
        if (user?.isBot) {
            throw new AppError(403, "BOT_ACCOUNT", "В служебный аккаунт бота войти нельзя");
        }
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            throw new AppError(401, "INVALID_CREDENTIALS", "Неверный email или пароль");
        }
        // Брошенную регистрацию не оживляем входом: код так и не ввели, аккаунта
        // будто не было. Иначе попытка войти вернула бы к жизни запись, которая
        // уже освободила бы почту и ник, — а пароль её владелец и так знает.
        if (isFailedRegistration(user)) {
            await this.users.delete(user.id);
            throw new AppError(401, "INVALID_CREDENTIALS", "Неверный email или пароль");
        }
        // Замороженного пускаем внутрь: он читает историю, но ничего не отправляет
        // и не получает — запрет на запись живёт в middleware и сервисах.
        if (user.isDeleted) {
            throw new AppError(403, "ACCOUNT_DELETED", "Этот аккаунт удалён владельцем Yargram");
        }
        // Подтверждение включено: пароль принят, но токен выдаём только после кода
        // из письма. Это второй шаг входа, как в Telegram, — сам пароль уже проверен.
        if (!this.options.emailConfirmation)
            return this.createResult(user, context);
        const loginTtl = await this.issueCode(user, "login");
        return {
            status: "code_sent",
            email: user.email,
            purpose: "login",
            expiresInSeconds: loginTtl,
        };
    }
    async getCurrentUser(userId) {
        const user = await this.users.findById(userId);
        if (!user)
            throw new AppError(401, "INVALID_TOKEN", "Пользователь этого токена больше не существует");
        return toCurrentUser(user);
    }
    async updateProfile(userId, input) {
        const existing = await this.users.findById(userId);
        if (!existing)
            throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден");
        // Помеченному SCAM описание не меняем. Поле не отклоняем, а тихо
        // игнорируем: форма профиля отправляет его вместе с остальными
        // настройками, и отказ закрыл бы человеку и смену темы, и день рождения.
        // Описание заперто и при SCAM, и при FAKE: оба подменяют его на чтении,
        // так что правка всё равно не была бы видна.
        const bioLocked = Boolean(existing.scam || existing.fake);
        const username = input.username?.trim().replace(/^@/, "");
        // Занятым считается и основной ник, и любой дополнительный: поиск идёт по
        // обоим спискам. Проверять одни основные ники мало — иначе адрес из алиасов
        // чужого аккаунта достался бы второму владельцу, и @ник начал бы находить
        // не того, кому его выдали.
        if (username && username.toLowerCase() !== existing.username?.toLowerCase()) {
            const taken = await this.users.findByUsername(username);
            if (taken && taken.id !== userId) {
                throw new AppError(409, "USERNAME_TAKEN", "Этот ник уже занят");
            }
        }
        // Свой же дополнительный ник, ставший основным, из списка убираем: дубль не
        // нужен, а сохранить такой список админ-панель уже не смогла бы.
        const aliases = username === undefined
            ? undefined
            : existing.usernames?.filter((handle) => handle.toLowerCase() !== username.toLowerCase());
        const aliasesChanged = aliases !== undefined && aliases.length !== (existing.usernames?.length ?? 0);
        const normalized = {
            ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
            ...(username === undefined ? {} : { username }),
            ...(aliasesChanged ? { usernames: aliases ?? [] } : {}),
            ...(input.bio === undefined || bioLocked ? {} : { bio: input.bio.trim() }),
            ...(input.showLastSeen === undefined ? {} : { showLastSeen: input.showLastSeen }),
            ...(input.callPrivacy === undefined ? {} : { callPrivacy: input.callPrivacy }),
            ...(input.callPrivacyAllowedUserIds === undefined ? {} : { callPrivacyAllowedUserIds: input.callPrivacyAllowedUserIds }),
            ...(input.callPrivacyDeniedUserIds === undefined ? {} : { callPrivacyDeniedUserIds: input.callPrivacyDeniedUserIds }),
            ...(input.notificationSoundEnabled === undefined ? {} : { notificationSoundEnabled: input.notificationSoundEnabled }),
            // Язык интерфейса: его читает служебный бот поддержки, чтобы отвечать
            // на том же языке, что и кнопки вокруг.
            ...(input.language === undefined ? {} : { language: input.language }),
            ...(input.themeColor === undefined ? {} : { themeColor: input.themeColor }),
            ...(input.wallpaperUrl === undefined
                ? {}
                : {
                    wallpaperUrl: input.wallpaperUrl,
                    // Тип приходит только вместе с загрузкой файла. Вписали ссылку
                    // руками — считаем её картинкой: иначе прежний «video/mp4» заставил
                    // бы рисовать <video> поверх чужой картинки, а пустая строка —
                    // это «фон убран».
                    wallpaperMimeType: input.wallpaperMimeType ?? "",
                }),
            // Пустая строка и null означают «убрать заливку» — тогда баннер не рисуется.
            ...(input.bannerColor === undefined
                ? {}
                : { bannerColor: input.bannerColor === "" ? null : input.bannerColor }),
            // Прямая ссылка на баннер: пустая строка и null — «убрать».
            ...(input.bannerUrl === undefined
                ? {}
                : { bannerUrl: input.bannerUrl === "" ? null : input.bannerUrl }),
            ...(input.birthday === undefined ? {} : { birthday: input.birthday }),
            // Срок автозавершения сеансов. `null` — «никогда», его тоже сохраняем:
            // иначе переключатель вернулся бы в «никогда» после перезахода.
            ...(input.sessionAutoTerminateDays === undefined
                ? {}
                : { sessionAutoTerminateDays: input.sessionAutoTerminateDays }),
        };
        try {
            return toCurrentUser(await this.users.update(userId, normalized));
        }
        catch (error) {
            if (error instanceof RepositoryConflictError && error.field === "username") {
                throw new AppError(409, "USERNAME_TAKEN", "Этот ник уже занят");
            }
            throw error;
        }
    }
    async authenticateToken(token, context) {
        let payload;
        try {
            payload = jwt.verify(token, this.options.jwtSecret);
        }
        catch {
            throw new AppError(401, "INVALID_TOKEN", "Токен доступа недействителен или истёк");
        }
        if (typeof payload === "string" || typeof payload.sub !== "string") {
            throw new AppError(401, "INVALID_TOKEN", "Токен доступа содержит неверные данные");
        }
        const user = await this.users.findById(payload.sub);
        if (!user)
            throw new AppError(401, "INVALID_TOKEN", "Пользователь этого токена больше не существует");
        // Заморозку здесь не проверяем: замороженный должен входить и читать.
        // Запрет на запись накладывает middleware на небезопасные методы.
        if (user.isDeleted) {
            throw new AppError(403, "ACCOUNT_DELETED", "Этот аккаунт удалён владельцем Yargram");
        }
        // Токен без сеанса — это токен, выданный до того, как сеансы появились.
        // Запись заводим на месте: иначе после обновления разом вылетели бы все,
        // кто уже вошёл. Дальше токен проверяется как обычный.
        const hash = tokenFingerprint(token);
        const session = (await this.options.sessions.findByTokenHash(hash)) ??
            (await attachSession(this.options.sessions, user.id, hash, context));
        if (session.terminatedAt) {
            throw new AppError(401, "SESSION_ENDED", "Этот сеанс завершён. Войдите снова.");
        }
        // Автозавершение: сеанс, который не использовался дольше срока из настроек,
        // умирает сам. Помечаем завершённым, а не стираем — стёртый токен при
        // следующем запросе приняли бы за новый вход.
        if (sessionIsExpired(session, user)) {
            await this.options.sessions.update(session.id, { terminatedAt: new Date().toISOString() });
            throw new AppError(401, "SESSION_ENDED", "Сеанс завершён: им давно не пользовались. Войдите снова.");
        }
        const sessionUpdates = {};
        if (shouldTouch(session)) {
            sessionUpdates.lastSeenAt = new Date().toISOString();
        }
        if (context?.deviceId && !session.deviceId) {
            sessionUpdates.deviceId = context.deviceId;
            if (!session.customDeviceName) {
                const existingName = await this.options.sessions.findDeviceName(context.deviceId);
                if (existingName) {
                    sessionUpdates.customDeviceName = existingName;
                }
            }
        }
        if (Object.keys(sessionUpdates).length > 0) {
            await this.options.sessions.update(session.id, sessionUpdates);
        }
        return user.id;
    }
    /**
     * Выдаёт новый код и отправляет его письмом. В базу кладём хеш, а не сам
     * код: утечка базы не должна дарить готовый код для входа.
     * Возвращает срок жизни кода в секундах.
     *
     * `rotate` — повторная отправка. Письмо уходит со следующего ящика: если
     * предыдущее не дошло (улетело в спам, потерялось), повтор по тому же пути
     * попал бы в ту же папку «Спам». См. `MailService`.
     */
    async issueCode(user, purpose, options = {}) {
        const ttlSeconds = this.options.emailCodeTtlSeconds ?? 600;
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
        await this.users.update(user.id, {
            emailCodeHash: await bcrypt.hash(code, this.options.bcryptRounds),
            emailCodePurpose: purpose,
            emailCodeExpiresAt: expiresAt,
            emailCodeAttempts: 0,
        });
        await this.options.mail?.sendCode({
            to: user.email,
            code,
            minutes: Math.max(1, Math.round(ttlSeconds / 60)),
            purpose,
            ...(options.rotate ? { rotate: true } : {}),
        });
        return ttlSeconds;
    }
    /** Стирает действующий код: принять его больше нельзя. */
    async clearCode(userId) {
        await this.users.update(userId, {
            emailCodeHash: null,
            emailCodePurpose: null,
            emailCodeExpiresAt: null,
            emailCodeAttempts: 0,
        });
    }
    /** Находит владельца действующего кода или объясняет, почему код не подходит. */
    async findUserForCode(emailInput, purpose) {
        const user = await this.users.findByEmail(emailInput.trim().toLowerCase());
        if (!user || user.isDeleted) {
            throw new AppError(400, "CODE_NOT_FOUND", "Запросите код заново");
        }
        // Брошенная регистрация: код так и не ввели, срок вышел. Аккаунта будто не
        // было — стираем и отвечаем как на незнакомую почту. Проверяем **до** кода:
        // просроченный код при этом уже стёрт, и по одному лишь коду отличить
        // брошенную регистрацию от чужого запроса было бы нельзя.
        if (isFailedRegistration(user)) {
            await this.users.delete(user.id);
            throw new AppError(400, "CODE_NOT_FOUND", "Запросите код заново");
        }
        // Назначение сверяем обязательно: код, выданный на вход, не должен
        // подтверждать регистрацию и тем более сбрасывать пароль.
        if (!user.emailCodeHash || !user.emailCodeExpiresAt || user.emailCodePurpose !== purpose) {
            throw new AppError(400, "CODE_NOT_FOUND", "Запросите код заново");
        }
        if (new Date(user.emailCodeExpiresAt).getTime() <= Date.now()) {
            await this.clearCode(user.id);
            throw new AppError(400, "CODE_EXPIRED", "Срок действия кода истёк. Запросите новый.");
        }
        if ((user.emailCodeAttempts ?? 0) >= EMAIL_CODE_MAX_ATTEMPTS) {
            await this.clearCode(user.id);
            throw new AppError(429, "CODE_ATTEMPTS_EXCEEDED", "Слишком много неверных попыток. Запросите новый код.");
        }
        return user;
    }
    async assertCodeMatches(user, code) {
        if (!(await bcrypt.compare(code.trim(), user.emailCodeHash))) {
            await this.users.update(user.id, { emailCodeAttempts: (user.emailCodeAttempts ?? 0) + 1 });
            throw new AppError(400, "INVALID_CODE", "Неверный код");
        }
    }
    /**
     * Проверяет код и выдаёт токен. Код из письма подтверждает владение почтой,
     * поэтому заодно выставляем `emailVerified`.
     */
    async confirmCode(emailInput, code, purpose, context) {
        const user = await this.findUserForCode(emailInput, purpose);
        await this.assertCodeMatches(user, code);
        const updated = await this.users.update(user.id, {
            emailCodeHash: null,
            emailCodePurpose: null,
            emailCodeExpiresAt: null,
            emailCodeAttempts: 0,
            emailVerified: true,
        });
        return this.createResult(updated, context);
    }
    /**
     * Повторная отправка: предыдущий код сгорает, действует только свежий.
     * Письмо уходит со следующего ящика — см. `issueCode`.
     */
    async resendCode(emailInput, purpose) {
        const user = await this.findUserForCode(emailInput, purpose);
        const expiresInSeconds = await this.issueCode(user, purpose, { rotate: true });
        return { status: "code_sent", email: user.email, purpose, expiresInSeconds };
    }
    /**
     * Запрос на сброс пароля. Если почты в базе нет — отвечаем так же, как при
     * успехе: иначе по ответу можно узнать, существует ли такой аккаунт.
     */
    async requestPasswordReset(emailInput) {
        const email = emailInput.trim().toLowerCase();
        const purpose = "reset";
        const user = await this.users.findByEmail(email);
        if (!user || user.isDeleted) {
            // Письмо не уходит, но ответ ничем не отличается от успешного.
            return {
                status: "code_sent",
                email,
                purpose,
                expiresInSeconds: this.options.emailCodeTtlSeconds ?? 600,
            };
        }
        // Брошенная регистрация: сброс пароля её не оживляет — стираем и молчим,
        // как про незнакомую почту. Иначе «забыли пароль» продлевало бы жизнь
        // записи, которую мы только что считали несостоявшейся.
        if (isFailedRegistration(user)) {
            await this.users.delete(user.id);
            return {
                status: "code_sent",
                email,
                purpose,
                expiresInSeconds: this.options.emailCodeTtlSeconds ?? 600,
            };
        }
        const ttlSeconds = this.options.emailCodeTtlSeconds ?? 600;
        // Дедупликация и защита от спама: если код на сброс пароля уже был отправлен
        // недавно (меньше 60 секунд назад), не спамим ящик новым письмом и не дёргаем SMTP.
        // Возвращаем тот же статус и оставшееся время жизни.
        if (user.emailCodeExpiresAt && user.emailCodePurpose === purpose) {
            const expiresAtMs = new Date(user.emailCodeExpiresAt).getTime();
            const remainingSeconds = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
            if (remainingSeconds > ttlSeconds - 60 && remainingSeconds > 0) {
                return {
                    status: "code_sent",
                    email: user.email,
                    purpose,
                    expiresInSeconds: remainingSeconds,
                };
            }
        }
        const expiresInSeconds = await this.issueCode(user, purpose);
        return { status: "code_sent", email: user.email, purpose, expiresInSeconds };
    }
    /** Сброс пароля по коду из письма: код списывается, сразу выдаётся токен. */
    async resetPassword(emailInput, code, newPassword, context) {
        const user = await this.findUserForCode(emailInput, "reset");
        await this.assertCodeMatches(user, code);
        const passwordHash = await bcrypt.hash(newPassword, this.options.bcryptRounds);
        const updated = await this.users.update(user.id, {
            passwordHash,
            emailCodeHash: null,
            emailCodePurpose: null,
            emailCodeExpiresAt: null,
            emailCodeAttempts: 0,
            emailVerified: true,
        });
        return this.createResult(updated, context);
    }
    /**
     * Запрос кода на удаление своего аккаунта.
     * Сначала проверяем правильность пароля, и только затем высылаем код на почту.
     */
    async requestAccountDeletion(userId, password) {
        const user = await this.users.findById(userId);
        if (!user || user.isDeleted) {
            throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден");
        }
        const matches = await bcrypt.compare(password, user.passwordHash);
        if (!matches) {
            throw new AppError(400, "INVALID_PASSWORD", "Неверный пароль");
        }
        const purpose = "delete";
        const ttlSeconds = await this.issueCode(user, purpose, { rotate: true });
        return {
            status: "code_sent",
            email: user.email,
            purpose,
            expiresInSeconds: ttlSeconds,
        };
    }
    /**
     * Проверка кода для удаления аккаунта.
     */
    async verifyDeletionCode(userId, code) {
        const user = await this.users.findById(userId);
        if (!user || user.isDeleted) {
            throw new AppError(404, "USER_NOT_FOUND", "Пользователь не найден");
        }
        const found = await this.findUserForCode(user.email, "delete");
        if (found.id !== userId) {
            throw new AppError(400, "CODE_NOT_FOUND", "Запросите код заново");
        }
        await this.assertCodeMatches(found, code);
        await this.clearCode(userId);
        return found;
    }
    async createResult(user, context) {
        const signOptions = {
            subject: user.id,
            expiresIn: this.options.jwtExpiresIn,
            // У каждого входа свой `jti`. Без него два входа в одну и ту же секунду
            // дали бы два полностью одинаковых токена: сеансы нельзя было бы
            // различить, и вход с чужого сайта выглядел бы как свой.
            jwtid: randomUUID(),
        };
        const accessToken = jwt.sign({}, this.options.jwtSecret, signOptions);
        await this.registerSession(user, accessToken, context);
        return { accessToken, user: toCurrentUser(user) };
    }
    /**
     * Привязывает выданный токен к сеансу — существующему или новому.
     *
     * Вход с незнакомого сайта помечаем: владельцу покажут окно «новый вход».
     * На самый первый вход в аккаунт пометку не ставим — сравнивать ещё не с чем,
     * и пугать человека окном про его же собственный вход незачем.
     */
    async registerSession(user, token, context) {
        if (!context)
            return;
        const live = (await this.options.sessions.listForUser(user.id)).filter((session) => !session.terminatedAt);
        const known = live.some((session) => session.site === context.site && session.device === context.device);
        await attachSession(this.options.sessions, user.id, tokenFingerprint(token), context, {
            newDevice: live.length > 0 && !known,
        });
    }
}
//# sourceMappingURL=auth-service.js.map