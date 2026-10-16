/** Один ящик, с которого можно отправить письмо. */
export type MailAccount = {
    /** Логин на SMTP. Он же — адрес отправителя, если `from` не задан отдельно. */
    user: string;
    pass: string;
    from: string;
};
export type ServerConfig = {
    nodeEnv: "development" | "test" | "production";
    databaseDriver: "json" | "postgres";
    databaseUrl?: string;
    host: string;
    port: number;
    httpsPort?: number;
    tlsPfxPath?: string;
    tlsPfxPassword?: string;
    jwtSecret: string;
    /** Ключ шифрования данных в покое (текст сообщений и файлы). */
    dbEncryptionKey: string;
    jwtExpiresIn: string;
    bcryptRounds: number;
    mediaTokenTtlSeconds: number;
    corsOrigins: string[];
    /** Настройка `trust proxy` для Express: `false`, `true` или список подсетей. */
    trustProxy: boolean | string;
    /** Уводить ли вход по HTTP на HTTPS. По умолчанию выключено. */
    forceHttps: boolean;
    /** Публичный адрес Yargram, если задан: `https://yargram.example.com`. */
    publicOrigin?: string;
    dataDirectory: string;
    dataFile: string;
    uploadDirectory: string;
    /** Собранная веб-версия Yargram: её отдаём по `/app`. */
    webDistPath: string;
    /** Собранный лендинг: название, описание и кнопка входа. Отдаётся по `/`. */
    landingDistPath: string;
    /** Настройки отправки писем с кодом подтверждения. */
    mail: {
        driver: "smtp" | "console" | "none";
        host?: string;
        port: number;
        secure: boolean;
        fromName: string;
        /**
         * Ящики для отправки: основной первым, запасные следом. Пустой список —
         * писем не будет, письмо уйдёт в лог (драйвер `console`).
         *
         * `from` у каждого свой: Gmail подставляет адрес по логину, и чужой
         * отправитель ему не понравится.
         */
        accounts: MailAccount[];
    };
    /** Требовать код из письма при регистрации и входе. */
    emailConfirmation: boolean;
    /** Срок жизни кода из письма. */
    emailCodeTtlSeconds: number;
    /** Внешний сервис временных данных TURN. Не задан — реле нет. */
    turnCredentialsUrl?: string;
    /** Сколько кэшировать ответ сервиса TURN. */
    turnCredentialsTtlSeconds: number;
};
export declare function loadConfig(environment?: NodeJS.ProcessEnv): ServerConfig;
