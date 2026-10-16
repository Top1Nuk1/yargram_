import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../hooks/useLanguage';
import { CallPrivacyExceptionsModal } from './CallPrivacyExceptionsModal';
import type { CallPrivacyRule, Conversation, User } from '../../types';

interface CallPrivacyScreenProps {
  user: User;
  conversations?: Conversation[];
  token?: string;
  onUpdateCallPrivacy: (
    privacy: CallPrivacyRule,
    allowedUserIds: string[],
    deniedUserIds: string[],
  ) => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

export function formatExceptionsCount(count: number, t: (key: string) => string): string {
  if (count <= 0) return t('privacy.nobodyCount');
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return t('privacy.userCountOne').replace('{count}', String(count));
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return t('privacy.userCountFew').replace('{count}', String(count));
  }
  return t('privacy.userCountMany').replace('{count}', String(count));
}

export function CallPrivacyScreen({
  user,
  conversations = [],
  token,
  onUpdateCallPrivacy,
  onBack,
  onClose,
}: CallPrivacyScreenProps) {
  const t = useTranslation();
  const [rule, setRule] = useState<CallPrivacyRule>(user.callPrivacy ?? 'everyone');
  const [allowedIds, setAllowedIds] = useState<string[]>(user.callPrivacyAllowedUserIds ?? []);
  const [deniedIds, setDeniedIds] = useState<string[]>(user.callPrivacyDeniedUserIds ?? []);
  const [modalMode, setModalMode] = useState<'allowed' | 'denied' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !modalMode) {
        onBack();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalMode, onBack]);

  async function updateSettings(
    nextRule: CallPrivacyRule,
    nextAllowed: string[],
    nextDenied: string[],
  ) {
    const prevRule = rule;
    const prevAllowed = allowedIds;
    const prevDenied = deniedIds;

    setRule(nextRule);
    setAllowedIds(nextAllowed);
    setDeniedIds(nextDenied);
    setSaving(true);
    setError('');

    try {
      await onUpdateCallPrivacy(nextRule, nextAllowed, nextDenied);
    } catch (reason) {
      setRule(prevRule);
      setAllowedIds(prevAllowed);
      setDeniedIds(prevDenied);
      setError(reason instanceof Error && reason.message ? reason.message : t('privacy.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const options: { value: CallPrivacyRule; label: string }[] = [
    { value: 'everyone', label: t('privacy.ruleEveryone') },
    { value: 'contacts', label: t('privacy.ruleContacts') },
    { value: 'nobody', label: t('privacy.ruleNobody') },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[70] grid items-end bg-[#171724]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
        role="presentation"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <section
          className="flex max-h-[88dvh] w-full animate-slide-up flex-col rounded-t-xl border border-line bg-surface sm:max-w-[460px] sm:rounded-xl shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label={t('privacy.calls')}
        >
          {/* Header */}
          <header className="flex items-center gap-2 border-b border-line/70 px-4 py-3 sm:px-5">
            <button
              type="button"
              aria-label={t('common.back')}
              onClick={onBack}
              className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-brand-soft/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-[-0.02em] text-ink">
              {t('privacy.calls')}
            </h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-5">
            {error && (
              <div className="rounded-lg bg-danger/10 p-2.5 text-xs font-semibold text-danger">
                {error}
              </div>
            )}

            {/* Section: Who can call me */}
            <div>
              <h3 className="text-[13px] font-semibold text-brand tracking-wide">
                {t('privacy.whoCanCallMe')}
              </h3>

              <div className="mt-2 space-y-1">
                {options.map((opt) => {
                  const selected = rule === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={saving}
                      onClick={() => void updateSettings(opt.value, allowedIds, deniedIds)}
                      className="flex w-full items-center gap-3.5 rounded-lg py-2.5 px-1 text-left transition hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <div
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
                          selected ? 'border-brand' : 'border-muted/50'
                        }`}
                      >
                        {selected && (
                          <div className="h-2.5 w-2.5 rounded-full bg-brand" />
                        )}
                      </div>
                      <span className="text-[15px] font-medium text-ink">
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-line/70" />

            {/* Section: Add exceptions */}
            <div>
              <h3 className="text-[13px] font-semibold text-brand tracking-wide">
                {t('privacy.addExceptions')}
              </h3>

              <div className="mt-2 space-y-1">
                {/* Always allow row */}
                {(rule === 'nobody' || rule === 'contacts') && (
                  <button
                    type="button"
                    onClick={() => setModalMode('allowed')}
                    className="flex w-full items-center justify-between py-2.5 px-1 rounded-lg text-left transition hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="text-[15px] font-medium text-ink">
                      {t('privacy.alwaysAllow')}
                    </span>
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-brand">
                      {formatExceptionsCount(allowedIds.length, t)}
                      <ChevronRight className="h-4 w-4 text-muted/60" />
                    </span>
                  </button>
                )}

                {/* Never allow row */}
                {(rule === 'everyone' || rule === 'contacts') && (
                  <button
                    type="button"
                    onClick={() => setModalMode('denied')}
                    className="flex w-full items-center justify-between py-2.5 px-1 rounded-lg text-left transition hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="text-[15px] font-medium text-ink">
                      {t('privacy.neverAllow')}
                    </span>
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-brand">
                      {formatExceptionsCount(deniedIds.length, t)}
                      <ChevronRight className="h-4 w-4 text-muted/60" />
                    </span>
                  </button>
                )}
              </div>

              <p className="mt-3 text-xs leading-5 text-muted">
                {t('privacy.exceptionsHint')}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Exceptions Modal */}
      {modalMode && (
        <CallPrivacyExceptionsModal
          title={modalMode === 'allowed' ? t('privacy.alwaysAllow') : t('privacy.neverAllow')}
          initialUserIds={modalMode === 'allowed' ? allowedIds : deniedIds}
          conversations={conversations}
          token={token}
          onSave={(ids) => {
            if (modalMode === 'allowed') {
              void updateSettings(rule, ids, deniedIds);
            } else {
              void updateSettings(rule, allowedIds, ids);
            }
          }}
          onClose={() => setModalMode(null)}
        />
      )}
    </>
  );
}
