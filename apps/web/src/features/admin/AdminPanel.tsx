import { useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck, Snowflake, Trash2, Undo2, X } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Button } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { mergeHandles } from '../../lib/handles';
import type { User } from '../../types';

interface AdminPanelProps {
  token: string;
  /** Кто открыл панель: владелец. Нужен для кнопки «Подставить свой ник». */
  viewer: User;
  onClose: () => void;
  /** Аккаунт удалили или вернули — список бесед стоит перечитать. */
  onChanged?: () => void;
}

function adminErrorMessage(reason: unknown): string {
  return reason instanceof ApiError ? reason.message : 'Не удалось выполнить действие';
}

/**
 * Панель владельца: галочка, значок Yargram, дополнительные юзернеймы,
 * заморозка, отметка SCAM, удаление и возврат аккаунта.
 *
 * Раньше это была вкладка в настройках профиля. Отдельным окном удобнее:
 * личные настройки и администрирование чужих аккаунтов — разные занятия, и
 * открывать панель из главного меню быстрее, чем искать вкладку.
 */
export function AdminPanel({ token, viewer, onClose, onChanged }: AdminPanelProps) {
  /** Юзернейм цели: и поиск, и назначение прав идут по нему. */
  const [query, setQuery] = useState('');
  /** Кого администрируем: его состояние показывает карточка ниже. */
  const [target, setTarget] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function fail(reason: unknown) {
    setError(adminErrorMessage(reason));
  }

  /** Показывает состояние цели: галочка, значок, отметка SCAM и доп. юзернеймы. */
  function inspect() {
    const wanted = query.trim().replace(/^@/, '').toLowerCase();
    if (!wanted) {
      setError('Укажите юзернейм');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .users(token, wanted)
      .then((result) => {
        const found = result.items.find(
          (candidate) =>
            candidate.username?.toLowerCase() === wanted ||
            (candidate.usernames ?? []).some((alias) => alias.toLowerCase() === wanted),
        );
        if (!found) {
          setTarget(null);
          setError(`Пользователь @${wanted} не найден`);
          return;
        }
        setTarget(found);
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Выдача и снятие атрибутов. Цель — юзернейм из поля ввода; пустой массив
   * usernames очищает список дополнительных ников.
   */
  function grant(
    input: { isVerified?: boolean; badge?: 'yargram' | null; usernames?: string[] },
    success: string,
  ) {
    const wanted = query.trim().replace(/^@/, '');
    if (!wanted) {
      setError('Укажите юзернейм');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminGrant(token, viewer.id, { targetUsername: wanted, ...input })
      .then((updated) => {
        setNotice(success);
        // Карточка цели должна показать свежие данные, а не те, что были до правки.
        setTarget((current) => (current ? { ...current, ...updated } : current));
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /** Заморозка: аккаунт остаётся, но человек не сможет войти и писать. */
  function toggleFreeze() {
    if (!target) return;
    const next = !target.isFrozen;
    const handle = target.username ? `@${target.username}` : target.displayName;
    if (
      next &&
      !window.confirm(`Заморозить аккаунт ${handle}? Он не сможет войти и писать, пока вы не разморозите его.`)
    ) {
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminFreeze(token, target.id, next)
      .then((updated) => {
        setTarget({ ...target, ...updated });
        setNotice(next ? `Аккаунт ${handle} заморожен.` : `Аккаунт ${handle} разморожен.`);
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Отметка SCAM: рядом с именем появляется красная рамка, а описание
   * заменяется предупреждением о мошенничестве и больше не меняется.
   */
  function toggleScam() {
    if (!target) return;
    const next = !target.scam;
    const handle = target.username ? `@${target.username}` : target.displayName;
    if (
      next &&
      !window.confirm(
        `Пометить аккаунт ${handle} как SCAM? Рядом с именем появится красная отметка, а описание заменится предупреждением о мошенничестве — менять его человек больше не сможет.`,
      )
    ) {
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminSetScam(token, target.id, next)
      .then((updated) => {
        setTarget({ ...target, ...updated });
        setNotice(
          next
            ? `Аккаунт ${handle} помечен как SCAM.`
            : `Отметка SCAM с аккаунта ${handle} снята, описание вернулось.`,
        );
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /** Снятие прав администратора: у аккаунта остаётся обычный набор. */
  function unassign() {
    if (!target) return;
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminUnassign(token, target.id)
      .then((updated) => {
        setTarget({ ...target, ...updated });
        setNotice('Права администратора сняты.');
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Удаление аккаунта: личное стирается, а история переписки остаётся у
   * собеседников. Почта и ник остаются занятыми, аккаунт можно вернуть.
   */
  function removeAccount() {
    if (!target) return;
    const handle = target.username ? `@${target.username}` : target.displayName;
    if (!window.confirm(`Удалить аккаунт ${handle}? Его почта и ник останутся занятыми, а историю переписки собеседники сохранят.`)) {
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminDeleteUser(token, target.id)
      .then(() => {
        setTarget(null);
        setNotice(`Аккаунт ${handle} удалён.`);
        onChanged?.();
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /** Возврат удалённого аккаунта: профиль и история снова на месте. */
  function restoreAccount() {
    if (!target) return;
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminRestoreUser(token, target.id)
      .then((updated) => {
        setTarget({ ...target, ...updated });
        setNotice('Аккаунт возвращён.');
        onChanged?.();
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  const inputClass =
    'h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10';

  return (
    <div
      className="fixed inset-0 z-[70] grid items-end bg-[#171724]/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-title"
        className="max-h-[92dvh] w-full animate-slide-up overflow-y-auto rounded-t-xl border border-line bg-surface p-5 sm:max-w-[560px] sm:rounded-xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Только владелец</p>
              <h2 id="admin-title" className="text-xl font-extrabold tracking-[-0.025em] text-ink">
                Админ-панель
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <p className="mt-3 text-sm leading-6 text-muted">
          Галочка, значок Yargram и дополнительные юзернеймы для любого аккаунта — выдача и снятие.
          Сначала укажите юзернейм и нажмите «Показать состояние».
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Юзернейм аккаунта</span>
            <input
              className={inputClass}
              value={query}
              placeholder="например: top1nuk1"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                inspect();
              }}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" className="text-xs" loading={busy} onClick={inspect}>
              <RefreshCw className="h-3.5 w-3.5" />
              Показать состояние
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => setQuery(viewer.username ?? '')}
            >
              Подставить свой ник
            </Button>
          </div>

          {target && (
            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="text-sm font-semibold text-ink">
                <UserName name={target.displayName} user={target} size="sm" />
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                галочка {target.isVerified ? 'есть' : 'нет'}, значок{' '}
                {target.badge === 'yargram' ? 'Yargram' : 'нет'}, отметка SCAM{' '}
                {target.scam ? 'есть' : 'нет'}
                {target.isFrozen ? ', аккаунт заморожен' : ''}
                {target.isDeleted ? ', аккаунт удалён' : ''}
              </p>
              {(target.usernames ?? []).length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {(target.usernames ?? []).map((alias) => (
                    <li key={alias} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">@{alias}</span>
                      <button
                        type="button"
                        className="shrink-0 font-semibold text-danger hover:underline"
                        onClick={() =>
                          grant(
                            { usernames: (target.usernames ?? []).filter((item) => item !== alias) },
                            `Юзернейм @${alias} удалён.`,
                          )
                        }
                      >
                        убрать
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">Дополнительных юзернеймов нет.</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ isVerified: true }, 'Галочка выдана.')}
            >
              Подтвердить (галочка)
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ badge: 'yargram' }, 'Значок Yargram выдан.')}
            >
              Значок Yargram
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ isVerified: false }, 'Галочка снята.')}
            >
              Снять галочку
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ badge: null }, 'Значок Yargram снят.')}
            >
              Снять значок Yargram
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={!target || busy}
              onClick={unassign}
            >
              Снять права админа
            </Button>
          </div>

          <AliasField
            disabled={busy}
            existing={target?.usernames ?? []}
            onAssign={(aliases) =>
              grant({ usernames: aliases }, `Юзернеймы аккаунта: ${aliases.join(', ')}.`)
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ usernames: [] }, 'Доп. юзернеймы очищены.')}
            >
              Очистить доп. юзернеймы
            </Button>
          </div>

          {/* Заморозка, отметка SCAM, удаление и возврат. */}
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={!target || target.isDeleted || busy}
              onClick={toggleFreeze}
            >
              <Snowflake className="h-3.5 w-3.5" />
              {target?.isFrozen ? 'Разморозить аккаунт' : 'Заморозить аккаунт'}
            </Button>
            <Button
              type="button"
              variant={target?.scam ? 'secondary' : 'danger'}
              className="text-xs"
              disabled={!target || target.isDeleted || busy}
              onClick={toggleScam}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {target?.scam ? 'Снять отметку SCAM' : 'Выдать отметку SCAM'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={!target?.isDeleted || busy}
              onClick={restoreAccount}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Вернуть аккаунт
            </Button>
            <Button
              type="button"
              variant="danger"
              className="text-xs"
              disabled={!target || target.isDeleted || busy}
              onClick={removeAccount}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Удалить аккаунт
            </Button>
          </div>

          <p className="text-xs leading-5 text-muted">
            Заморозка закрывает вход: человек сможет читать переписку, но не писать, и написать ему
            тоже никто не сможет. Отметка SCAM оставляет аккаунт рабочим, но рядом с именем горит
            красная рамка, а описание заменяется предупреждением о мошенничестве. Удаление оставляет
            историю переписки собеседникам, но почта и ник остаются занятыми — аккаунт можно вернуть.
          </p>
          <p className="text-xs leading-5 text-muted">
            Себя тоже можно администрировать: дополнительные юзернеймы назначаются и своему аккаунту,
            кроме прав администратора.
          </p>
        </div>

        {notice && (
          <p className="mt-4 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </section>
    </div>
  );
}

/**
 * Поле дополнительных юзернеймов. Кнопка именно **добавляет** к уже выданным:
 * раньше она заменяла весь список, и от одного нового ника прежние исчезали.
 */
function AliasField({
  disabled,
  existing,
  onAssign,
}: {
  disabled: boolean;
  /** Уже выданные ники цели — с ними и складываем вписанное. */
  existing: string[];
  onAssign: (aliases: string[]) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="mb-1.5 block text-sm font-semibold text-ink">Дополнительные юзернеймы</span>
        <input
          className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
          value={value}
          placeholder="добавить через запятую: kotik, second_name"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
      </label>
      <Button type="button" variant="secondary" className="text-xs" disabled={disabled} onClick={add}>
        Добавить
      </Button>
    </div>
  );

  function add() {
    const next = mergeHandles(existing, value);
    // Ничего нового не вписали — не дёргаем сервер и не стираем поле.
    if (next.length === existing.length) return;
    onAssign(next);
    setValue('');
  }
}
