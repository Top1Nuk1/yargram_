import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bot,
  ChevronDown,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Trash2,
  Undo2,
  UserRound,
  UsersRound,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { Avatar, Button } from '../../components/ui';
import { UserName } from '../../components/UserName';
import { useLanguage, useTranslation, type TranslateFn } from '../../hooks/useLanguage';
import { formatShortDate } from '../../lib/format';
import { mergeHandles } from '../../lib/handles';
import { LANGUAGE_LOCALES } from '../../lib/i18n';
import { avatarProps } from '../../lib/user';
import type {
  AdminAccount,
  AdminAccountsFilter,
  AdminAccountsMark,
  AdminAccountsScope,
  AdminGroup,
  AdminStats,
  User,
} from '../../types';

interface AdminPanelProps {
  token: string;
  /** Кто открыл панель: владелец. Нужен для кнопки «Подставить свой ник». */
  viewer: User;
  onClose: () => void;
  /** Аккаунт удалили или вернули — список бесед стоит перечитать. */
  onChanged?: () => void;
}

/**
 * Что администрируем: аккаунт, группу или ботов. Знаки у аккаунта и группы
 * одинаковые, но ищутся по-разному; боты — отдельная полка со своим списком.
 */
type AdminMode = 'account' | 'group' | 'bot';

function adminErrorMessage(t: TranslateFn, reason: unknown): string {
  return reason instanceof ApiError ? reason.message : t('admin.actionFailed');
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
  const t = useTranslation();
  /** Что администрируем: знаки у аккаунта и группы одинаковые, но ищутся по-разному. */
  const [mode, setMode] = useState<AdminMode>('account');
  /** Юзернейм цели: и поиск, и назначение прав идут по нему. */
  const [query, setQuery] = useState('');
  /** Кого администрируем: его состояние показывает карточка ниже. */
  const [target, setTarget] = useState<User | null>(null);
  /** Поиск группы: название, код из ссылки-приглашения или id. */
  const [groupQuery, setGroupQuery] = useState('');
  const [groupResults, setGroupResults] = useState<AdminGroup[]>([]);
  /** Какая группа выбрана в результатах поиска. */
  const [groupTarget, setGroupTarget] = useState<AdminGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  /** Сводка по всей установке: сколько аккаунтов и групп. */
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  /** Список аккаунтов раскрывается из плитки «Аккаунтов». */
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState<AdminAccountsFilter>('all');
  /** Включённые знаки: складываются между собой и с состоянием. */
  const [accountMarks, setAccountMarks] = useState<AdminAccountsMark[]>([]);
  /** Где искать введённое: ник, @юзернеймы или всё сразу. */
  const [accountScope, setAccountScope] = useState<AdminAccountsScope>('any');
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsFailed, setAccountsFailed] = useState(false);
  /** Чей список юзернеймов раскрыт: у остальных ники подрезаны по ширине. */
  const [expandedHandles, setExpandedHandles] = useState<string | null>(null);
  /**
   * Служебные боты: перечень целиком, отдельно от общего списка аккаунтов.
   * Ботов на установке единицы, и владельцу нужен именно список, а не поиск.
   */
  const [bots, setBots] = useState<AdminAccount[]>([]);
  const [botsLoading, setBotsLoading] = useState(false);
  const [botsFailed, setBotsFailed] = useState(false);
  /** Кому владелец ставит или снимает метку «BOT»: ищется по нику. */
  const [botQuery, setBotQuery] = useState('');
  const [botTarget, setBotTarget] = useState<User | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  /**
   * Счётчики читаем при открытии панели. Ошибку показываем отдельной строкой,
   * а не общим `error`: если сводка почему-то не посчиталась, это не должно
   * мешать поиску аккаунтов и выдаче знаков.
   */
  useEffect(() => {
    let active = true;
    api
      .adminStats(token)
      .then((result) => {
        if (active) setStats(result);
      })
      .catch(() => {
        if (active) setStatsFailed(true);
      });
    return () => {
      active = false;
    };
  }, [token]);

  /**
   * Список аккаунтов. Читаем при раскрытии и при смене фильтра или поиска —
   * поиск идёт на сервер, поэтому запросы приглушаем: пока человек набирает,
   * шлём только последний. Ошибка списка не трогает общий `error`: это
   * отдельная справка, и панель из-за неё работать не перестаёт.
   */
  const loadAccounts = useCallback(() => {
    setAccountsLoading(true);
    setAccountsFailed(false);
    api
      .adminAccounts(token, accountSearch, accountFilter, accountMarks, accountScope)
      .then((result) => setAccounts(result))
      .catch(() => setAccountsFailed(true))
      .finally(() => setAccountsLoading(false));
  }, [token, accountSearch, accountFilter, accountMarks, accountScope]);

  useEffect(() => {
    if (!accountsOpen) return;
    // Пауза только для поиска: набор идёт по символу, и слать запрос на каждый
    // незачем. Первое раскрытие и смена фильтра грузятся сразу.
    const timer = window.setTimeout(loadAccounts, accountSearch ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [accountsOpen, loadAccounts, accountSearch]);

  /**
   * Перечень служебных ботов. Читаем при открытии вкладки «Боты» — она нужна
   * редко, и держать этот список загруженным всё время незачем. Ошибка списка
   * не трогает общий `error`: это справка, и метку поставить она не мешает.
   */
  const loadBots = useCallback(() => {
    setBotsLoading(true);
    setBotsFailed(false);
    api
      .adminBots(token)
      .then((result) => setBots(result))
      .catch(() => setBotsFailed(true))
      .finally(() => setBotsLoading(false));
  }, [token]);

  useEffect(() => {
    if (mode !== 'bot') return;
    loadBots();
  }, [mode, loadBots]);

  /** Включает и выключает знак в отборе, не трогая остальные. */
  function toggleMark(mark: AdminAccountsMark) {
    setAccountMarks((current) =>
      current.includes(mark) ? current.filter((item) => item !== mark) : [...current, mark],
    );
  }

  /** Сбрасывает весь отбор: и состояние, и знаки, и область поиска, и строку. */
  function resetAccountFilters() {
    setAccountSearch('');
    setAccountFilter('all');
    setAccountMarks([]);
    setAccountScope('any');
  }

  function fail(reason: unknown) {
    setError(adminErrorMessage(t, reason));
  }

  /**
   * Клик по строке списка: подставляем ник в поле и открываем карточку.
   *
   * Через точный поиск `adminLookup`, а не из строки списка: строка — обзорная
   * выжимка, а карточка работает с полным профилем (доп. юзернеймы, почта,
   * кнопки знаков). Владелец ждёт, что клик по аккаунту сразу даст то же, что
   * и ввод ника руками.
   */
  function openAccount(account: AdminAccount) {
    const handle = account.username ?? account.usernames[0];
    setMode('account');
    setExpandedHandles(null);
    if (!handle) {
      // Ни основного, ни дополнительных ников — точный поиск по нику не найдёт.
      setError(t('admin.noUsername'));
      return;
    }
    setQuery(handle);
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminLookup(token, handle)
      .then((found) => {
        if (found) setTarget(found);
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /** Показывает состояние цели: галочка, значок, отметка SCAM и доп. юзернеймы. */
  function inspect() {
    const wanted = query.trim().replace(/^@/, '').toLowerCase();
    if (!wanted) {
      setError(t('admin.noUsername'));
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminLookup(token, wanted)
      .then((found) => {
        if (!found) {
          setTarget(null);
          setError(t('admin.userNotFound', { name: wanted }));
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
      setError(t('admin.noUsername'));
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
      !window.confirm(t('admin.confirmFreeze', { handle }))
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
        setNotice(next ? t('admin.accountFrozen', { handle }) : t('admin.accountUnfrozen', { handle }));
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
      !window.confirm(t('admin.confirmScam', { handle }))
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
            ? t('admin.scamSet', { handle })
            : t('admin.scamCleared', { handle }),
        );
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Отметка FAKE: рядом с именем загорается рамка «FAKE», а описание
   * заменяется предупреждением о подделке под официальный аккаунт.
   */
  function toggleFake() {
    if (!target) return;
    const next = !target.fake;
    const handle = target.username ? `@${target.username}` : target.displayName;
    if (next && !window.confirm(t('admin.confirmFake', { handle }))) {
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminSetFake(token, target.id, next)
      .then((updated) => {
        setTarget({ ...target, ...updated });
        setNotice(
          next
            ? t('admin.fakeSet', { handle })
            : t('admin.fakeCleared', { handle }),
        );
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Точный поиск аккаунта, которому владелец ставит или снимает метку «BOT».
   * Через `adminLookup`, как и остальные карточки: строка списка — обзорная
   * выжимка, а метку надо ставить по полному профилю.
   */
  function findBotTarget() {
    const wanted = botQuery.trim().replace(/^@/, '').toLowerCase();
    if (!wanted) {
      setError(t('admin.noUsername'));
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminLookup(token, wanted)
      .then((found) => {
        if (!found) {
          setBotTarget(null);
          setError(t('admin.userNotFound', { name: wanted }));
          return;
        }
        setBotTarget(found);
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Метка «BOT»: аккаунт становится служебным ботом.
   *
   * 🔥 Метка не косметическая — войти в такой аккаунт больше нельзя. Поэтому
   * перед постановкой спрашиваем подтверждение, а после — перечитываем перечень
   * ботов и трогаем `onChanged`, чтобы метка появилась в открытых чатах сразу.
   */
  function toggleBot(user: User | null) {
    if (!user) return;
    const next = !user.isBot;
    const handle = user.username ? `@${user.username}` : user.displayName;
    if (next && !window.confirm(t('admin.confirmBot', { handle }))) return;
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminSetBot(token, user.id, next)
      .then((updated) => {
        setNotice(next ? t('admin.botSetDone', { handle }) : t('admin.botClearedDone', { handle }));
        const patch = (current: User | null) =>
          current && current.id === updated.id ? { ...current, ...updated } : current;
        setBotTarget(patch);
        setTarget(patch);
        setAccounts((current) =>
          current.map((account) =>
            account.id === updated.id ? { ...account, isBot: updated.isBot ?? false } : account,
          ),
        );
        loadBots();
        onChanged?.();
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
        setNotice(t('admin.adminRightsRevoked'));
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
    if (!window.confirm(t('admin.confirmDelete', { handle }))) {
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminDeleteUser(token, target.id)
      .then(() => {
        setTarget(null);
        setNotice(t('admin.accountDeleted', { handle }));
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
        setNotice(t('admin.accountRestored'));
        onChanged?.();
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Поиск группы. Пустой запрос тоже осмысленный: он показывает первые группы
   * — так владелец находит нужную, когда название помнит неточно.
   */
  function findGroups() {
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminSearchGroups(token, groupQuery.trim())
      .then((groups) => {
        setGroupResults(groups);
        // Единственное совпадение выбираем сразу: лишний клик ни к чему.
        setGroupTarget(groups.length === 1 ? groups[0] : null);
        if (groups.length === 0) setError(t('admin.groupsNotFound'));
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /** Знаки группы: галочка, значок Yargram и отметки SCAM/FAKE. */
  function setGroupMarks(
    input: { isVerified?: boolean; badge?: 'yargram' | null; scam?: boolean; fake?: boolean },
    success: string,
  ) {
    if (!groupTarget) {
      setError(t('admin.selectGroupFirst'));
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    api
      .adminSetGroupMarks(token, groupTarget.id, input)
      .then((updated) => {
        setGroupTarget(updated);
        setGroupResults((current) =>
          current.map((group) => (group.id === updated.id ? updated : group)),
        );
        setNotice(success);
        // Значок у названия группы должен появиться сразу, без перезагрузки.
        onChanged?.();
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }

  /**
   * Отметка SCAM группы: рядом с названием загорается красная рамка, а описание
   * подменяется предупреждением — о мошенничестве предупреждают всю группу, а
   * не её создателя.
   */
  function toggleGroupScam() {
    if (!groupTarget) return;
    const next = !groupTarget.scam;
    if (
      next &&
      !window.confirm(
        t('admin.confirmGroupScam', { title: groupTarget.title }),
      )
    ) {
      return;
    }
    setGroupMarks(
      { scam: next },
      next
        ? t('admin.groupScamSet', { title: groupTarget.title })
        : t('admin.groupScamCleared'),
    );
  }

  /**
   * Отметка FAKE группы: группа выдаёт себя за официальную. Работает так же,
   * как SCAM, но с другим текстом предупреждения — и обе могут стоять разом.
   */
  function toggleGroupFake() {
    if (!groupTarget) return;
    const next = !groupTarget.fake;
    setGroupMarks(
      { fake: next },
      next
        ? t('admin.groupFakeSet', { title: groupTarget.title })
        : t('admin.groupFakeCleared'),
    );
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{t('admin.ownerOnly')}</p>
              <h2 id="admin-title" className="text-xl font-extrabold tracking-[-0.025em] text-ink">
                {t('admin.title')}
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-canvas hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <p className="mt-3 text-sm leading-6 text-muted">
          {t('admin.intro')}
        </p>

        {/* Сводка по всей установке. Плитка «Аккаунтов» — не только число:
            она раскрывает список, где владелец ищет и фильтрует аккаунты. */}
        <section className="mt-4 rounded-xl border border-line bg-canvas p-3" aria-label={t('admin.overview')}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            {t('admin.overview')}
          </p>
          {stats ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SummaryTile
                icon={UserRoundCheck}
                value={stats.totalUsers}
                label={t('admin.accountsTotal')}
                onClick={() => setAccountsOpen((open) => !open)}
                expanded={accountsOpen}
                hint={accountsOpen ? t('admin.accountsHide') : t('admin.accountsToggle')}
              />
              <SummaryTile icon={UsersRound} value={stats.groups} label={t('admin.groupsTotal')} />
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              {statsFailed ? t('admin.statsFailed') : t('common.loading')}
            </p>
          )}
          {stats && !accountsOpen && (
            <p className="mt-2 text-xs leading-5 text-muted">{t('admin.overviewHint')}</p>
          )}
        </section>

        {accountsOpen && (
          <AccountList
            accounts={accounts}
            loading={accountsLoading}
            failed={accountsFailed}
            search={accountSearch}
            filter={accountFilter}
            marks={accountMarks}
            scope={accountScope}
            selectedId={target?.id ?? null}
            expandedHandles={expandedHandles}
            onSearch={setAccountSearch}
            onFilter={setAccountFilter}
            onToggleMark={toggleMark}
            onScope={setAccountScope}
            onReset={resetAccountFilters}
            onToggleHandles={(id) =>
              setExpandedHandles((current) => (current === id ? null : id))
            }
            onSelect={openAccount}
            onRetry={loadAccounts}
          />
        )}

        {/* Что администрируем: набор знаков одинаковый, а поиск разный. */}
        <div className="mt-4 grid grid-cols-3 gap-2" role="tablist" aria-label={t('admin.modeLabel')}>
          {(
            [
              ['account', t('admin.account'), UserRound],
              ['group', t('admin.group'), UsersRound],
              ['bot', t('admin.bot'), Bot],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setNotice('');
                setError('');
              }}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${
                mode === value
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line bg-surface text-muted hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {mode === 'bot' ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs leading-5 text-muted">{t('admin.botsIntro')}</p>

            {/* Перечень целиком: владелец видит, какие служебные аккаунты заведены. */}
            <section
              className="rounded-xl border border-line bg-canvas p-3"
              aria-label={t('admin.botsListLabel')}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                {t('admin.botsListLabel')}
              </p>
              {botsFailed ? (
                <p className="mt-2 text-xs text-muted">
                  {t('admin.botsFailed')}{' '}
                  <button
                    type="button"
                    className="font-semibold text-brand hover:underline"
                    onClick={loadBots}
                  >
                    {t('common.retry')}
                  </button>
                </p>
              ) : botsLoading && bots.length === 0 ? (
                <p className="mt-2 text-xs text-muted">{t('admin.botsLoading')}</p>
              ) : bots.length === 0 ? (
                <p className="mt-2 text-xs text-muted">{t('admin.botsEmpty')}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {bots.map((bot) => (
                    <li key={bot.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                      <Avatar
                        name={bot.displayName}
                        src={bot.avatarUrl}
                        size="sm"
                        seed={avatarProps(bot).seed}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          <UserName name={bot.displayName} user={bot} size="sm" />
                        </span>
                        {bot.username && (
                          <span className="block truncate text-xs text-muted">@{bot.username}</span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0 text-xs"
                        disabled={busy}
                        onClick={() => toggleBot(bot)}
                      >
                        {t('admin.botClear')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                {t('admin.botUsernameLabel')}
              </span>
              <input
                className={inputClass}
                value={botQuery}
                placeholder={t('admin.usernamePlaceholder')}
                onChange={(event) => setBotQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  findBotTarget();
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                loading={busy}
                onClick={findBotTarget}
              >
                <Search className="h-3.5 w-3.5" />
                {t('admin.showState')}
              </Button>
            </div>

            {botTarget && (
              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="text-sm font-semibold text-ink">
                  <UserName name={botTarget.displayName} user={botTarget} size="sm" />
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {botTarget.isBot ? t('admin.botStateOn') : t('admin.botStateOff')}
                </p>
                <Button
                  type="button"
                  variant={botTarget.isBot ? 'secondary' : 'primary'}
                  className="mt-2 text-xs"
                  disabled={busy}
                  onClick={() => toggleBot(botTarget)}
                >
                  {botTarget.isBot ? t('admin.botClear') : t('admin.botSet')}
                </Button>
              </div>
            )}

            <p className="text-xs leading-5 text-muted">{t('admin.botWarning')}</p>
          </div>
        ) : mode === 'group' ? (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">{t('admin.groupLabel')}</span>
              <input
                className={inputClass}
                value={groupQuery}
                placeholder={t('admin.groupPlaceholder')}
                onChange={(event) => setGroupQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  findGroups();
                }}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" className="text-xs" loading={busy} onClick={findGroups}>
                <Search className="h-3.5 w-3.5" />
                {t('admin.findGroups')}
              </Button>
              <span className="text-xs text-muted">{t('admin.emptyQueryHint')}</span>
            </div>

            {groupResults.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line bg-canvas p-2">
                {groupResults.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      onClick={() => setGroupTarget(group)}
                      aria-current={groupTarget?.id === group.id ? 'true' : undefined}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        groupTarget?.id === group.id ? 'bg-brand-soft text-brand' : 'hover:bg-surface'
                      }`}
                    >
                      <UserName name={group.title || t('admin.group')} user={group} subject="group" size="sm" />
                      <span className="shrink-0 text-muted">{t('admin.memberCount', { count: group.memberCount })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {groupTarget && (
              <div className="rounded-xl border border-line bg-canvas p-3">
                <p className="text-sm font-semibold text-ink">
                  <UserName name={groupTarget.title || t('admin.group')} user={groupTarget} subject="group" size="sm" />
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {t('admin.markSummary', {
                    verified: groupTarget.isVerified ? t('admin.yes') : t('admin.no'),
                    badge: groupTarget.badge === 'yargram' ? 'Yargram' : t('admin.no'),
                    scam: groupTarget.scam ? t('admin.yes') : t('admin.no'),
                    fake: groupTarget.fake ? t('admin.yes') : t('admin.no'),
                  })}
                </p>
                {groupTarget.inviteCode && (
                  <p className="mt-1 truncate text-xs text-muted">{t('admin.groupLink', { code: groupTarget.inviteCode })}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                disabled={!groupTarget || busy}
                onClick={() => setGroupMarks({ isVerified: true }, t('admin.verifyGrantedGroup'))}
              >
                {t('admin.verify')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                disabled={!groupTarget || busy}
                onClick={() => setGroupMarks({ isVerified: false }, t('admin.verifyRemoved'))}
              >
                {t('admin.removeVerify')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                disabled={!groupTarget || busy}
                onClick={() => setGroupMarks({ badge: 'yargram' }, t('admin.badgeGrantedGroup'))}
              >
                {t('admin.badgeYargram')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                disabled={!groupTarget || busy}
                onClick={() => setGroupMarks({ badge: null }, t('admin.badgeRemoved'))}
              >
                {t('admin.removeBadgeYargram')}
              </Button>
              <Button
                type="button"
                variant={groupTarget?.scam ? 'secondary' : 'danger'}
                className="text-xs"
                disabled={!groupTarget || busy}
                onClick={toggleGroupScam}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                {groupTarget?.scam ? t('admin.clearScam') : t('admin.setScam')}
              </Button>
              <Button
                type="button"
                variant={groupTarget?.fake ? 'secondary' : 'danger'}
                className="text-xs"
                disabled={!groupTarget || busy}
                onClick={toggleGroupFake}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                {groupTarget?.fake ? t('admin.clearFake') : t('admin.setFake')}
              </Button>
            </div>

            <p className="text-xs leading-5 text-muted">
              {t('admin.groupScamNote')}
            </p>
          </div>
        ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">{t('admin.accountUsernameLabel')}</span>
            <input
              className={inputClass}
              value={query}
              placeholder={t('admin.usernamePlaceholder')}
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
              {t('admin.showState')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => setQuery(viewer.username ?? '')}
            >
              {t('admin.useOwnUsername')}
            </Button>
          </div>

          {target && (
            <div className="rounded-xl border border-line bg-canvas p-3">
              <p className="text-sm font-semibold text-ink">
                <UserName name={target.displayName} user={target} size="sm" />
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                  {t('admin.markSummary', {
                    verified: target.isVerified ? t('admin.yes') : t('admin.no'),
                    badge: target.badge === 'yargram' ? 'Yargram' : t('admin.no'),
                    scam: target.scam ? t('admin.yes') : t('admin.no'),
                    fake: target.fake ? t('admin.yes') : t('admin.no'),
                  })}
                {target.isFrozen ? t('admin.frozenSuffix') : ''}
                {target.isDeleted ? t('admin.deletedSuffix') : ''}
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
                            t('admin.aliasRemoved', { alias }),
                          )
                        }
                      >
                        {t('admin.removeAlias')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">{t('admin.noAliases')}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ isVerified: true }, t('admin.verifyGranted'))}
            >
              {t('admin.verify')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ badge: 'yargram' }, t('admin.badgeGranted'))}
            >
              {t('admin.badgeYargram')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ isVerified: false }, t('admin.verifyRemoved'))}
            >
              {t('admin.removeVerify')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ badge: null }, t('admin.badgeRemoved'))}
            >
              {t('admin.removeBadgeYargram')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={!target || busy}
              onClick={unassign}
            >
              {t('admin.unassignAdmin')}
            </Button>
          </div>

          <AliasField
            disabled={busy}
            existing={target?.usernames ?? []}
            onAssign={(aliases) =>
              grant({ usernames: aliases }, t('admin.aliasesAssigned', { aliases: aliases.join(', ') }))
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={busy}
              onClick={() => grant({ usernames: [] }, t('admin.aliasesCleared'))}
            >
              {t('admin.clearAliases')}
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
              {target?.isFrozen ? t('admin.unfreeze') : t('admin.freeze')}
            </Button>
            <Button
              type="button"
              variant={target?.scam ? 'secondary' : 'danger'}
              className="text-xs"
              disabled={!target || target.isDeleted || busy}
              onClick={toggleScam}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {target?.scam ? t('admin.clearScam') : t('admin.setScam')}
            </Button>
            <Button
              type="button"
              variant={target?.fake ? 'secondary' : 'danger'}
              className="text-xs"
              disabled={!target || target.isDeleted || busy}
              onClick={toggleFake}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {target?.fake ? t('admin.clearFake') : t('admin.setFake')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={!target?.isDeleted || busy}
              onClick={restoreAccount}
            >
              <Undo2 className="h-3.5 w-3.5" />
              {t('admin.restoreAccount')}
            </Button>
            <Button
              type="button"
              variant="danger"
              className="text-xs"
              disabled={!target || target.isDeleted || busy}
              onClick={removeAccount}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('admin.deleteAccount')}
            </Button>
          </div>

          <p className="text-xs leading-5 text-muted">
            {t('admin.accountNotes')}
          </p>
          <p className="text-xs leading-5 text-muted">
            {t('admin.selfNote')}
          </p>
        </div>
        )}

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
            {t('common.close')}
          </Button>
        </div>
      </section>
    </div>
  );
}

/**
 * Плитка сводки: число крупно, подпись под ним. Иконка нужна, чтобы
 * «аккаунты» и «группы» различались с одного взгляда, а не только по подписи.
 *
 * Без `onClick` — просто справка. С ним плитка становится кнопкой, которая
 * раскрывает список: так счётчик «Аккаунтов» и вход в список — одно место,
 * а не две сущности, которые надо связывать глазами.
 */
function SummaryTile({
  icon: Icon,
  value,
  label,
  onClick,
  expanded,
  hint,
}: {
  icon: typeof UserRound;
  value: number;
  label: string;
  onClick?: () => void;
  expanded?: boolean;
  hint?: string;
}) {
  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-xl font-extrabold leading-tight tracking-[-0.02em] text-ink">
          {value}
        </span>
        <span className="block truncate text-xs text-muted">{label}</span>
      </span>
    </>
  );
  const shell = `flex items-center gap-3 rounded-lg border px-3 py-2 ${
    expanded ? 'border-brand bg-brand-soft/40' : 'border-line bg-surface'
  }`;
  if (!onClick) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded ?? false}
      title={hint}
      className={`${shell} w-full transition hover:border-brand/40 hover:bg-brand-soft/30`}
    >
      {body}
      <ChevronDown
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

/** Сколько юзернеймов показываем в строке списка, пока он не раскрыт. */
const VISIBLE_HANDLES = 2;

/**
 * Список аккаунтов. Отдельным компонентом, а не в теле панели: у него своя
 * возня с поиском, тремя слоями фильтров и раскрытием ников, и панель от этого
 * только разрасталась бы.
 *
 * Фильтры разделены на три слоя намеренно: состояние записи (живой /
 * замороженный / удалённый), знаки владельца (складываются между собой) и
 * область поиска. Так «удалённые со SCAM» или «владельцы с галочкой» — это
 * две галочки, а не отдельный пункт меню под каждую комбинацию.
 */
function AccountList({
  accounts,
  loading,
  failed,
  search,
  filter,
  marks,
  scope,
  selectedId,
  expandedHandles,
  onSearch,
  onFilter,
  onToggleMark,
  onScope,
  onReset,
  onToggleHandles,
  onSelect,
  onRetry,
}: {
  accounts: AdminAccount[];
  loading: boolean;
  failed: boolean;
  search: string;
  filter: AdminAccountsFilter;
  marks: AdminAccountsMark[];
  scope: AdminAccountsScope;
  /** Аккаунт, который сейчас открыт в карточке. */
  selectedId: string | null;
  /** Чей список ников раскрыт целиком. */
  expandedHandles: string | null;
  onSearch: (value: string) => void;
  onFilter: (value: AdminAccountsFilter) => void;
  onToggleMark: (mark: AdminAccountsMark) => void;
  onScope: (value: AdminAccountsScope) => void;
  onReset: () => void;
  onToggleHandles: (id: string) => void;
  onSelect: (account: AdminAccount) => void;
  onRetry: () => void;
}) {
  const t = useTranslation();
  const states: Array<[AdminAccountsFilter, string]> = [
    ['all', t('admin.filterAll')],
    ['active', t('admin.filterActive')],
    ['frozen', t('admin.filterFrozen')],
    ['deleted', t('admin.filterDeleted')],
  ];
  const markOptions: Array<[AdminAccountsMark, string]> = [
    ['verified', t('admin.markVerified')],
    ['badge', t('admin.markBadge')],
    ['scam', t('admin.markScam')],
    ['fake', t('admin.markFake')],
    ['owner', t('admin.markOwner')],
    ['bot', t('admin.markBot')],
  ];
  const scopeOptions: Array<[AdminAccountsScope, string]> = [
    ['any', t('admin.scopeAny')],
    ['name', t('admin.scopeName')],
    ['handle', t('admin.scopeHandle')],
  ];
  const filtersTouched =
    search !== '' || filter !== 'all' || marks.length > 0 || scope !== 'any';
  return (
    <section
      className="mt-3 rounded-xl border border-line bg-canvas p-3"
      aria-label={t('admin.accountsTotal')}
    >
      <label className="block">
        <span className="sr-only">{t('admin.accountsSearchPlaceholder')}</span>
        <span className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          />
          <input
            className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
            value={search}
            placeholder={t('admin.accountsSearchPlaceholder')}
            onChange={(event) => onSearch(event.target.value)}
          />
        </span>
      </label>

      <FilterGroup label={t('admin.filterStateLabel')}>
        {states.map(([value, label]) => (
          <FilterChip key={value} active={filter === value} onClick={() => onFilter(value)}>
            {label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label={t('admin.filterMarksLabel')}>
        {markOptions.map(([value, label]) => (
          <FilterChip key={value} active={marks.includes(value)} onClick={() => onToggleMark(value)}>
            {label}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label={t('admin.filterScopeLabel')}>
        {scopeOptions.map(([value, label]) => (
          <FilterChip
            key={value}
            active={scope === value}
            onClick={() => onScope(value)}
            disabled={!search.trim()}
          >
            {label}
          </FilterChip>
        ))}
        {filtersTouched && (
          <button
            type="button"
            onClick={onReset}
            className="ml-1 inline-flex min-h-9 items-center rounded-full px-2 text-xs font-semibold text-danger hover:underline"
          >
            {t('admin.filtersReset')}
          </button>
        )}
      </FilterGroup>

      {failed ? (
        <p className="mt-3 text-xs text-muted">
          {t('admin.accountsFailed')}{' '}
          <button type="button" className="font-semibold text-brand hover:underline" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </p>
      ) : loading && accounts.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{t('admin.accountsLoading')}</p>
      ) : accounts.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{t('admin.accountsEmpty')}</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted">{t('admin.accountsFound', { count: accounts.length })}</p>
          <ul className="mt-1.5 max-h-72 space-y-1 overflow-y-auto">
            {accounts.map((account) => (
              <li key={account.id}>
                <AccountRow
                  account={account}
                  selected={selectedId === account.id}
                  handlesExpanded={expandedHandles === account.id}
                  onToggleHandles={() => onToggleHandles(account.id)}
                  onSelect={() => onSelect(account)}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-muted">{t('admin.accountsHint')}</p>
        </>
      )}
    </section>
  );
}

/** Подпись и ряд кнопок одного слоя фильтров. */
function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Кнопка-фильтр. `aria-pressed` несёт состояние и заодно даёт тестам понятную
 * роль: чип — это переключатель, а не кнопка действия.
 */
function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'border-brand bg-brand-soft text-brand'
          : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** Одна строка списка: аватар, ник со знаками, юзернеймы и даты. */
function AccountRow({
  account,
  selected,
  handlesExpanded,
  onToggleHandles,
  onSelect,
}: {
  account: AdminAccount;
  selected: boolean;
  handlesExpanded: boolean;
  onToggleHandles: () => void;
  onSelect: () => void;
}) {
  // Язык нужен не только для подписей: даты пишет `Intl`, и без локали они
  // всегда выходили бы по-русски — на английском это сразу бросается в глаза.
  const { t, language } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const handles = [account.username, ...account.usernames].filter(
    (handle): handle is string => Boolean(handle),
  );
  const hidden = handles.length - VISIBLE_HANDLES;
  const shown = handlesExpanded ? handles : handles.slice(0, VISIBLE_HANDLES);
  const { seed } = avatarProps(account);
  return (
    // Строка — `div`, а не кнопка: внутри живёт кнопка «ещё», а вложенные
    // кнопки в HTML запрещены. Клик по строке открывает карточку, клик по
    // «ещё» обрабатывается отдельным обработчиком и всплывает не дальше.
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 text-left transition ${
        selected ? 'border-brand bg-brand-soft/40' : 'border-transparent hover:bg-surface'
      }`}
    >
      <Avatar
        name={account.displayName}
        src={account.avatarUrl}
        size="sm"
        seed={seed}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1">
          {/* Ник подрезаем до 10 знаков: длинные ломают строку, а полный
              виден в подсказке и в карточке выше. */}
          <span title={account.displayName} className="min-w-0">
            <UserName name={truncateName(account.displayName)} user={account} size="sm" />
          </span>
          {account.isOwner && (
            <span
              title={t('admin.ownerMark')}
              className="shrink-0 rounded-full bg-brand-soft px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.06em] text-brand"
            >
              {t('admin.ownerMark')}
            </span>
          )}
        </span>
        {handles.length > 0 && (
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {shown.map((handle) => (
              <span key={handle} className="truncate text-xs text-muted">
                @{handle}
              </span>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  // Кнопка «ещё» не должна заодно открывать карточку.
                  event.stopPropagation();
                  onToggleHandles();
                }}
                aria-expanded={handlesExpanded}
                title={t('admin.allUsernames')}
                className="shrink-0 text-xs font-semibold text-brand hover:underline"
              >
                {handlesExpanded ? t('admin.lessHandles') : t('admin.moreHandles', { count: hidden })}
              </button>
            )}
          </span>
        )}
        <span className="mt-1 block text-[11px] leading-4 text-muted">
          {t('admin.createdAt', { date: formatShortDate(account.createdAt, locale) })}
          {` · ${t('admin.lastSeenAt', { date: formatShortDate(account.lastSeenAt, locale) })}`}
          {account.isDeleted && account.deletedAt
            ? ` · ${t('admin.deletedAt', { date: formatShortDate(account.deletedAt, locale) })}`
            : ''}
          {!account.isDeleted && account.isFrozen ? ` · ${t('admin.frozenAt')}` : ''}
        </span>
      </span>
    </div>
  );
}

/** Сколько знаков ника показываем: длинные имена ломают строку списка. */
const NAME_LIMIT = 10;

/** Обрезает ник до `NAME_LIMIT` знаков, добавляя многоточие. */
function truncateName(name: string): string {
  if (name.length <= NAME_LIMIT) return name;
  return `${name.slice(0, NAME_LIMIT).trimEnd()}…`;
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
  const t = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="mb-1.5 block text-sm font-semibold text-ink">{t('admin.aliasesLabel')}</span>
        <input
          className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-brand/60 focus:ring-4 focus:ring-brand/10"
          value={value}
          placeholder={t('admin.aliasesPlaceholder')}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
      </label>
      <Button type="button" variant="secondary" className="text-xs" disabled={disabled} onClick={add}>
        {t('admin.aliasAdd')}
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
