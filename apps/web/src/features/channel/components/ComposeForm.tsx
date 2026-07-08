import { TEXT_MAX_LEN, type TtsVoiceModule } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { clock } from '@/lib/format';
import { playVoicePreview } from '@/lib/voicePreview';
import { youtubeIdFromText } from '@/lib/youtube';
import { useShop } from '@/providers/ShopProvider';
import { Icon } from '@/ui/icons';
import { Accordion, Alert, Button, IconButton, Select, Textarea } from '@/ui';
import { FileDropzone } from './FileDropzone';
import { SelectedFileCard } from './SelectedFileCard';
import { YouTubePreview } from './YouTubePreview';
import { GifPicker } from './GifPicker';
import type { SelectedGif } from '../hooks/useMediaSubmission';

export function ComposeForm({
  file,
  gif = null,
  gifAutoApprove = true,
  previewUrl,
  text,
  senderName,
  errorMessage,
  cooldownSec = 0,
  voice = 'auto',
  voices,
  onVoiceChange,
  onPickFile,
  onRemoveFile,
  onPickGif,
  onRemoveGif,
  onTextChange,
  onSend,
}: {
  file: File | null;
  gif?: SelectedGif | null;
  /** Channel setting: do safe GIFs bypass moderation here? Drives the picker copy and the notice. */
  gifAutoApprove?: boolean;
  previewUrl: string | null;
  text: string;
  senderName: string;
  errorMessage: string | null;
  /** Cooldown in seconds: >0 disables send button, but input form remains accessible. */
  cooldownSec?: number;
  /** Selected TTS voice id or 'auto'. Picker renders only when voices+onVoiceChange are given. */
  voice?: string;
  voices?: TtsVoiceModule[];
  onVoiceChange?: (id: string) => void;
  onPickFile: (file: File | null) => void;
  onRemoveFile: () => void;
  onPickGif?: (gif: SelectedGif) => void;
  onRemoveGif?: () => void;
  onTextChange: (value: string) => void;
  onSend: () => void;
}) {
  const { t } = useI18n();
  const { openShop } = useShop();
  const cooling = cooldownSec > 0;
  // YouTube preview only for a text link with no file/gif selected.
  const ytId = file || gif ? null : youtubeIdFromText(text);

  return (
    <div className="flex flex-col gap-4">
      {file ? (
        <SelectedFileCard file={file} url={previewUrl} onRemove={onRemoveFile} />
      ) : gif ? (
        <div className="flex flex-col gap-2">
          <div className="relative overflow-hidden rounded-[var(--radius)] border border-border">
            <img src={gif.previewUrl} alt={gif.title} className="max-h-56 w-full object-contain" />
            <button
              type="button"
              aria-label={t('channel.gifRemove')}
              onClick={onRemoveGif}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-bg/70 text-text backdrop-blur-sm transition-colors hover:text-danger"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          {!gifAutoApprove && (
            <Alert tone="warn">
              <Icon name="square-alert" size={16} />
              <span>{t('channel.gifModerationNotice')}</span>
            </Alert>
          )}
        </div>
      ) : (
        <>
          <FileDropzone onPick={onPickFile} />
          {onPickGif && (
            <Accordion title={t('channel.gifButton')} icon="gift">
              <GifPicker autoApprove={gifAutoApprove} onPick={onPickGif} />
            </Accordion>
          )}
        </>
      )}

      {ytId && <YouTubePreview ytId={ytId} />}

      <div>
        <Textarea
          value={text}
          maxLength={TEXT_MAX_LEN}
          rows={3}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={file || gif ? t('channel.captionPlaceholder') : t('channel.textPlaceholder')}
          className="resize-none"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{t('channel.sendingAs', { name: senderName })}</span>
          <span className="label-mono text-faint">
            {text.length}/{TEXT_MAX_LEN}
          </span>
        </div>
      </div>

      {/* No owned voices yet: a second door into the shop, right when picking one matters. */}
      {voices && voices.length === 0 && onVoiceChange && (
        <button
          type="button"
          onClick={openShop}
          className="flex cursor-pointer items-center gap-2 self-start text-sm text-muted outline-none transition-colors hover:text-accent focus-visible:text-accent"
        >
          <Icon name="volume-2" size={16} className="shrink-0" />
          <span className="underline decoration-dotted underline-offset-4">
            {t('channel.voiceShopCta')}
          </span>
        </button>
      )}

      {voices && voices.length > 0 && onVoiceChange && (
        <div className="flex items-center gap-2">
          <Icon name="volume-2" size={16} className="shrink-0 text-muted" />
          <Select
            className="min-w-0 flex-1"
            label={t('channel.voice')}
            value={voice}
            onChange={onVoiceChange}
            options={[
              { value: 'auto', label: t('channel.voiceAuto') },
              ...voices.map((v) => ({
                value: v.id,
                label: `${t(v.labels.name)} · ${t(v.labels.desc)}`,
              })),
            ]}
          />
          {voice !== 'auto' && (
            <IconButton
              name="play"
              size="sm"
              label={t('channel.voicePreview')}
              onClick={() => playVoicePreview(voice)}
            />
          )}
        </div>
      )}

      <Button
        variant="primary"
        className="justify-center"
        disabled={cooling || (!file && !gif && !text.trim())}
        onClick={onSend}
      >
        <Icon name={cooling ? 'clock' : 'send'} size={16} />
        {cooling ? t('channel.cooldown', { time: clock(cooldownSec) }) : t('channel.send')}
      </Button>

      {errorMessage && (
        <Alert tone="danger">
          <Icon name="close" />
          <span>{errorMessage}</span>
        </Alert>
      )}
    </div>
  );
}
