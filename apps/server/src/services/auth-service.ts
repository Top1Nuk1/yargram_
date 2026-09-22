import bcrypt from "bcryptjs";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { AppError } from "../lib/errors.js";
import {
  RepositoryConflictError,
  type UpdateUserInput,
  type UserRepository,
} from "../repositories/types.js";
import { toCurrentUser, type CurrentUser, type User } from "../domain/models.js";

export type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
  username?: string;
};

export type AuthResult = {
  accessToken: string;
  user: CurrentUser;
};

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly options: {
      jwtSecret: string;
      jwtExpiresIn: string;
      bcryptRounds: number;
    },
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
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
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    if (username && (await this.users.findByUsername(username))) {
      throw new AppError(409, "USERNAME_TAKEN", "This username is already in use");
    }

    const passwordHash = await bcrypt.hash(input.password, this.options.bcryptRounds);
    let user: User;
    try {
      user = await this.users.create({
        email,
        passwordHash,
        displayName: input.displayName.trim(),
        ...(username ? { username } : {}),
      });
    } catch (error) {
      if (error instanceof RepositoryConflictError) {
        const isEmail = error.field === "email";
        throw new AppError(
          409,
          isEmail ? "EMAIL_TAKEN" : "USERNAME_TAKEN",
          isEmail
            ? "An account with this email already exists"
            : "This username is already in use",
        );
      }
      throw error;
    }

    return this.createResult(user);
  }

  async login(emailInput: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(emailInput.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }
    if (user.isFrozen) {
      throw new AppError(403, "ACCOUNT_FROZEN", "This account is frozen by the Yargram owner");
    }
    if (user.isDeleted) {
      throw new AppError(403, "ACCOUNT_DELETED", "This account was deleted by the Yargram owner");
    }
    return this.createResult(user);
  }

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
    return toCurrentUser(user);
  }

  async updateProfile(userId: string, input: UpdateUserInput): Promise<CurrentUser> {
    const normalized: UpdateUserInput = {
      ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
      ...(input.username === undefined
        ? {}
        : { username: input.username.trim().replace(/^@/, "") }),
      ...(input.bio === undefined ? {} : { bio: input.bio.trim() }),
      ...(input.showLastSeen === undefined ? {} : { showLastSeen: input.showLastSeen }),
      ...(input.notificationSoundEnabled === undefined ? {} : { notificationSoundEnabled: input.notificationSoundEnabled }),
      ...(input.themeColor === undefined ? {} : { themeColor: input.themeColor }),
      ...(input.wallpaperUrl === undefined ? {} : { wallpaperUrl: input.wallpaperUrl }),
      ...(input.birthday === undefined ? {} : { birthday: input.birthday }),
    };

    try {
      return toCurrentUser(await this.users.update(userId, normalized));
    } catch (error) {
      if (error instanceof RepositoryConflictError && error.field === "username") {
        throw new AppError(409, "USERNAME_TAKEN", "This username is already in use");
      }
      throw error;
    }
  }

  async authenticateToken(token: string): Promise<string> {
    let payload: string | JwtPayload;
    try {
      payload = jwt.verify(token, this.options.jwtSecret);
    } catch {
      throw new AppError(401, "INVALID_TOKEN", "Access token is invalid or expired");
    }

    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new AppError(401, "INVALID_TOKEN", "Access token has an invalid payload");
    }

    const user = await this.users.findById(payload.sub);
    if (!user) throw new AppError(401, "INVALID_TOKEN", "The token user no longer exists");
    // Заморозку проверяем на каждом запросе: старый токен не должен работать.
    if (user.isFrozen) {
      throw new AppError(403, "ACCOUNT_FROZEN", "This account is frozen by the Yargram owner");
    }
    if (user.isDeleted) {
      throw new AppError(403, "ACCOUNT_DELETED", "This account was deleted by the Yargram owner");
    }
    return user.id;
  }

  private createResult(user: User): AuthResult {
    const signOptions: SignOptions = {
      subject: user.id,
      expiresIn: this.options.jwtExpiresIn as NonNullable<SignOptions["expiresIn"]>,
    };
    return {
      accessToken: jwt.sign({}, this.options.jwtSecret, signOptions),
      user: toCurrentUser(user),
    };
  }
}
