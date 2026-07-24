import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { OnboardingStatus } from '@tmw/shared';
import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';

interface StepDef {
  key: string;
  icon: IconName;
  title: string;
  why: string;
  done: boolean;
  /** Counts toward the X/Y progress and the "all set" state. Optional (info-only) steps don't. */
  required: boolean;
  body: ReactNode;
}

/**
 * The new-streamer setup flow — the home page's teaching layer. Each step self-explains (what + why)
 * and carries its action inline (copy the overlay URL, the viewer link, the /mod command), so a
 * newcomer never has to hunt for the right card below. Once every required step is done the whole
 * thing collapses to a slim strip that reopens on demand — the links stay reachable, they just stop
 * nagging. The chat step lives here only for Twitch owners; for the rest the chat feature has its
 * own permanent home (ChatUpsellCard), so it doesn't vanish when the guide collapses.
 */
export function SetupGuide({
  status,
  overlayUrl,
  chatUrl,
  viewerUrl,
  viewerLogin,
  hasTwitch,
  onRotate,
}: {
  status: OnboardingStatus | null;
  overlayUrl: string;
  /** Chat overlay URL (same token) — the second Browser Source. */
  chatUrl: string;
  viewerUrl: string;
  viewerLogin: string;
  /** Owner has a linked Twitch identity — the chat bot is Twitch-only. */
  hasTwitch: boolean;
  onRotate: () => void;
}) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const steps = useMemo<StepDef[] | null>(() => {
    if (!status) return null;
    const chatActionable = status.botAvailable;

    const overlayBody = (
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-sm text-muted">
          <Icon name="square-alert" size={15} className="mt-0.5 shrink-0 text-warn" />
          <span>{t('home.overlayDesc')}</span>
        </p>
        <CopyableLinkBox
          value={overlayUrl}
          secret
          size="sm"
          copied={copiedKey === 'overlay'}
          onCopy={() => copy(overlayUrl, 'overlay')}
        />
        <p className="flex items-start gap-2 text-xs text-faint">
          <Icon name="monitor" size={14} className="mt-0.5 shrink-0" />
          <span>{t('home.overlayResTip')}</span>
        </p>
        <button
          type="button"
          onClick={onRotate}
          className="flex cursor-pointer items-center gap-1.5 self-start text-xs text-faint outline-none transition-colors hover:text-danger focus-visible:text-danger"
        >
          <Icon name="reload" size={13} />
          {t('home.rotate')}
        </button>
      </div>
    );

    const viewerBody = (
      <div className="flex flex-col gap-3">
        <CopyableLinkBox
          value={viewerUrl}
          href={viewerUrl}
          size="sm"
          copied={copiedKey === 'viewer'}
          onCopy={() => copy(viewerUrl, 'viewer')}
        />
        <Link to={`/c/${viewerLogin}`} className="self-start">
          <Button variant="secondary" size="sm">
            <Icon name="eye" size={15} />
            {t('home.viewerPageBtn')}
          </Button>
        </Link>
      </div>
    );

    const botLogin = status.botLogin;
    const modBox = botLogin ? (
      <CopyableLinkBox
        value={`/mod ${botLogin}`}
        size="sm"
        copied={copiedKey === 'mod'}
        onCopy={() => copy(`/mod ${botLogin}`, 'mod')}
      />
    ) : null;
    const chatOverlayBlock = (
      <div className="border-t border-line pt-3">
        <p className="mb-2 flex items-start gap-2 text-xs text-muted">
          <Icon name="message-circle" size={14} className="mt-0.5 shrink-0 text-accent" />
          <span>{t('home.chatOverlayDesc')}</span>
        </p>
        <CopyableLinkBox
          value={chatUrl}
          secret
          size="sm"
          copied={copiedKey === 'chat'}
          onCopy={() => copy(chatUrl, 'chat')}
        />
      </div>
    );

    // The chat step is Twitch-only here: either actionable (mod/reading), or a rare "bot service is
    // down" note. The not-linked case is not a guide step at all — it's the standalone ChatUpsellCard.
    const chatBody: ReactNode = chatActionable ? (
      <div className="flex flex-col gap-3">
        {status.botReading ? (
          <p className="flex items-center gap-1.5 text-sm text-ok">
            <Icon name="check" size={15} />
            {t('chatDust.reading')}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">{t('guide.chat.modInstruction')}</p>
            {modBox}
          </>
        )}
        {chatOverlayBlock}
      </div>
    ) : (
      <p className="text-sm text-muted">{t('guide.chat.unavailable')}</p>
    );

    return [
      {
        key: 'overlay',
        icon: 'monitor',
        title: t('guide.overlay.title'),
        why: t('guide.overlay.why'),
        done: status.overlayAdded,
        required: true,
        body: overlayBody,
      },
      {
        key: 'viewer',
        icon: 'send',
        title: t('guide.viewer.title'),
        why: t('guide.viewer.why'),
        done: status.hasViewerSend,
        required: true,
        body: viewerBody,
      },
      // Only Twitch owners get a chat step; for the rest the feature is a permanent card, so it
      // survives the guide collapsing on the required steps.
      ...(hasTwitch
        ? [
            {
              key: 'chat',
              icon: 'message-circle' as const,
              title: t('guide.chat.title'),
              why: t('guide.chat.why'),
              done: chatActionable && status.botReading,
              required: chatActionable,
              body: chatBody,
            },
          ]
        : []),
    ];
  }, [status, overlayUrl, chatUrl, viewerUrl, viewerLogin, hasTwitch, copiedKey, t]);

  // Open the first unfinished required step by default — that's "the next thing to do".
  useEffect(() => {
    if (!steps || openKey !== null) return;
    const next = steps.find((s) => s.required && !s.done) ?? steps.find((s) => !s.done);
    if (next) setOpenKey(next.key);
  }, [steps, openKey]);

  if (!steps) return null;

  const required = steps.filter((s) => s.required);
  const doneCount = required.filter((s) => s.done).length;
  const allDone = doneCount === required.length;

  // Fully set up: collapse to a slim confirmation that reopens to expose the links again.
  if (allDone && !expanded) {
    return (
      <Card corners className="flex items-center justify-between gap-3 border-ok/30">
        <span className="flex items-center gap-2 text-sm text-text">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-ok/40 bg-ok-soft text-ok">
            <Icon name="check" size={14} />
          </span>
          {t('guide.allDoneTitle')}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex cursor-pointer items-center gap-1 label-mono text-muted outline-none transition-colors hover:text-accent focus-visible:text-accent"
        >
          {t('guide.showSteps')}
          <Icon name="chevron-down" size={14} />
        </button>
      </Card>
    );
  }

  return (
    <Card corners className="border-accent/30">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2">
          <Icon name="sparkles" size={18} className="text-accent" />
          {t('guide.title')}
        </h2>
        <span className="label-mono text-muted">
          {doneCount}/{required.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{t('guide.subtitle')}</p>

      <ul className="mt-4 flex flex-col gap-2">
        {steps.map((s, i) => {
          const open = openKey === s.key;
          return (
            <li
              key={s.key}
              className={`rounded-[var(--radius)] border transition-colors ${
                open ? 'border-accent/40 bg-surface' : 'border-border'
              }`}
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenKey(open ? null : s.key)}
                className="flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-left"
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                    s.done
                      ? 'border-ok/40 bg-ok-soft text-ok'
                      : s.required
                        ? 'border-accent/40 bg-accent-soft text-accent'
                        : 'border-border text-faint'
                  }`}
                >
                  {s.done ? (
                    <Icon name="check" size={13} />
                  ) : s.required ? (
                    i + 1
                  ) : (
                    <Icon name={s.icon} size={13} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`text-sm ${s.done ? 'text-muted' : 'text-text'}`}>
                      {s.title}
                    </span>
                    {!s.required && (
                      <span className="label-mono shrink-0 text-faint">{t('guide.optional')}</span>
                    )}
                  </span>
                  {!open && <span className="mt-0.5 block text-xs text-muted">{s.why}</span>}
                </span>
                <Icon
                  name="chevron-down"
                  size={16}
                  className={`mt-0.5 shrink-0 text-muted transition-transform duration-300 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
              >
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 pl-12">
                    <p className="mb-3 text-sm text-muted">{s.why}</p>
                    {s.body}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
