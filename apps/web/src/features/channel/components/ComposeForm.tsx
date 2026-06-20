import { TEXT_MAX_LEN } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { clock } from '@/lib/format';
import { youtubeIdFromText } from '@/lib/youtube';
import { Icon } from '@/ui/icons';
import { Alert, Button, Textarea } from '@/ui';
import { FileDropzone } from './FileDropzone';
import { SelectedFileCard } from './SelectedFileCard';
import { YouTubePreview } from './YouTubePreview';

export function ComposeForm({
  file,
  previewUrl,
  text,
  senderName,
  errorMessage,
  cooldownSec = 0,
  onPickFile,
  onRemoveFile,
  onTextChange,
  onSend,
}: {
  file: File | null;
  previewUrl: string | null;
  text: string;
  senderName: string;
  errorMessage: string | null;
  /** Cooldown in seconds: >0 disables send button, but input form remains accessible. */
  cooldownSec?: number;
  onPickFile: (file: File | null) => void;
  onRemoveFile: () => void;
  onTextChange: (value: string) => void;
  onSend: () => void;
}) {
  const { t } = useI18n();
  const cooling = cooldownSec > 0;
  // Show YouTube preview only if text contains URL and no file is selected.
  const ytId = file ? null : youtubeIdFromText(text);

  return (
    <div className="flex flex-col gap-4">
      {file ? (
        <SelectedFileCard file={file} url={previewUrl} onRemove={onRemoveFile} />
      ) : (
        <FileDropzone onPick={onPickFile} />
      )}

      {!file && ytId && <YouTubePreview ytId={ytId} />}

      <div>
        <Textarea
          value={text}
          maxLength={TEXT_MAX_LEN}
          rows={3}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={file ? t('channel.captionPlaceholder') : t('channel.textPlaceholder')}
          className="resize-none"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{t('channel.sendingAs', { name: senderName })}</span>
          <span className="label-mono text-faint">
            {text.length}/{TEXT_MAX_LEN}
          </span>
        </div>
      </div>

      <Button
        variant="primary"
        className="justify-center"
        disabled={cooling || (!file && !text.trim())}
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
