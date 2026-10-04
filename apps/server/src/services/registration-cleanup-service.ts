import { isFailedRegistration } from "../domain/models.js";
import type { UserRepository } from "../repositories/types.js";

/**
 * Уборщик брошенных регистраций.
 *
 * Человек завёл аккаунт, но код из письма так и не ввёл. Пока код действует,
 * аккаунт ждёт: он неподтверждён и токена у него нет. Когда срок вышел, ждать
 * больше нечего — запись стирается начисто, «будто её не было»: почта и ник
 * освобождаются, и человек может зарегистрироваться заново.
 *
 * 🔥 Само правило — `isFailedRegistration` (`domain/models.ts`), здесь только
 * расписание. Уборка не полагается на один таймер: те же записи `AuthService`
 * стирает сразу, когда человек пробует занять ту же почту или ник. Иначе между
 * тиками уборщика регистрация отвечала бы «почта занята» сама себе.
 *
 * Ошибки глотаем и пишем в лог: не сумели убрать сейчас — уберём на следующем
 * круге. Падать из-за уборки сервер не должен.
 */
export class RegistrationCleanupService {
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly users: UserRepository,
    /** Раз в минуту достаточно: срок кода измеряется минутами. */
    private readonly intervalMs = 60_000,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Стирает всё, что уже не подтвердится; возвращает число удалённых. */
  async sweep(): Promise<number> {
    const now = this.clock();
    const failed = await this.users.listFailedRegistrations(now.toISOString());
    let removed = 0;
    for (const user of failed) {
      // Проверяем ещё раз перед удалением: список мог устареть, а правило —
      // единственный источник правды о том, что регистрация брошена.
      if (!isFailedRegistration(user, now)) continue;
      await this.users.delete(user.id);
      removed += 1;
    }
    return removed;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Уборка не должна держать процесс живым сама по себе.
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.sweep();
    } catch (error) {
      console.error("Cannot clean up failed registrations", error);
    } finally {
      this.sweeping = false;
    }
  }
}
