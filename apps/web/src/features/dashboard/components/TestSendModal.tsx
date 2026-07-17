import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PublicChannelInfo } from '@tmw/shared';
import { getChannel } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { IconButton, Loader } from '@/ui';
import { Icon } from '@/ui/icons';
import { ComposeForm } from '@/features/channel/components/ComposeForm';
import { useMediaSubmission } from '@/features/channel/hooks/useMediaSubmission';

/**
 * The viewer compose form in a dialog: text, GIF, file and TTS voice all testable from the
 * dashboard. Hits the same upload endpoint as the viewer page — the server bypasses limits
 * and the cooldown for the channel owner.
 */
export function TestSendModal({
  open,
  onClose,
  login,
}: {
  open: boolean;
  onClose: () => void;
  /** The owner's channel login — the test send targets their own viewer page. */
  login: string;
}) {
  const { t } = useI18n();
  // The body fetches the channel and its cooldown on mount, so keep it out of the tree
  // until the streamer actually opens the dialog.
  const [everOpened, setEverOpened] = useState(open);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <div
      inert={!open}
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[var(--dur)] ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        // Not transition-all: the dialog is content-sized, so animating every property makes it
        // lag behind every height change inside the form (picking a file, opening the GIF list).
        className={`glass glass-strong relative flex max-h-[85vh] w-full max-w-lg flex-col border border-glass-border p-5 shadow-4 transition-[opacity,transform] duration-[var(--dur)] ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 label-mono text-text">
            <Icon name="send" size={16} className="text-accent" />
            {t('dash.testSend')}
          </h2>
          <IconButton
            name="close"
            label={t('common.close')}
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        </div>
        <p className="mb-4 text-sm text-muted">{t('dash.testSendHint')}</p>
        {/* The p-1/-mx-1 slack is load-bearing: `.cornerframe::before` sits at inset -1px (-3px on
            hover), and without room to bleed it counts as scroll overflow — phantom scrollbars that
            resize the box and make it judder. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto p-1">
          {everOpened && <TestSendBody login={login} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TestSendBody({ login }: { login: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { me } = useMe();
  const [channel, setChannel] = useState<PublicChannelInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getChannel(login)
      .then((c) => {
        if (!cancelled) setChannel(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [login]);

  const sub = useMediaSubmission(channel, login, () => {});
  const toastedRef = useRef<string | null>(null);

  useEffect(() => {
    if (sub.phase.name !== 'done') return;
    const { id } = sub.phase.result;
    if (toastedRef.current === id) return;
    toastedRef.current = id;
    toast(t('toast.testSent'));
  }, [sub.phase, toast, t]);

  if (!channel || !me?.user) return <Loader label={t('common.loading')} />;

  return (
    <ComposeForm
      file={sub.file}
      gif={sub.gif}
      gifAutoApprove={channel.autoApproveGifs}
      previewUrl={sub.previewUrl}
      text={sub.text}
      senderName={me.user.displayName}
      errorMessage={sub.phase.name === 'error' ? sub.phase.message : null}
      voice={sub.voice}
      voices={channel.ttsEnabled ? sub.availableVoices : undefined}
      onVoiceChange={sub.setVoice}
      onPickFile={sub.pickFile}
      onRemoveFile={sub.removeFile}
      onPickGif={sub.pickGif}
      onRemoveGif={sub.removeGif}
      onTextChange={sub.setText}
      onSend={() => void sub.send()}
    />
  );
}
