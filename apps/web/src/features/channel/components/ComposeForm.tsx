import {
  giphyClipUrl,
  renderedMediaPct,
  TEXT_MAX_LEN,
  type OverlayLayout,
  type TtsVoiceModule,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { clock } from '@/lib/format';
import { playVoicePreview } from '@/lib/voicePreview';
import { captionBesideYoutube, youtubeIdFromText } from '@/lib/youtube';
import { useShop } from '@/providers/ShopProvider';
import { Icon } from '@/ui/icons';
import {
  Accordion,
  Alert,
  Button,
  IconButton,
  LayoutPreview,
  PositionGrid,
  Select,
  Slider,
  Textarea,
} from '@/ui';
import { FileDropzone } from './FileDropzone';
import { SelectedFileCard } from './SelectedFileCard';
import { YouTubePreview } from './YouTubePreview';
import { GifPicker } from './GifPicker';
import { usePasteFile } from '../hooks/usePasteFile';
import type { SelectedGif } from '../hooks/useMediaSubmission';

export function ComposeForm({
  file,
  gif = null,
  gifAutoApprove = true,
  textAutoApprove = true,
  youtubeAutoApprove = false,
  previewUrl,
  text,
  senderName,
  errorMessage,
  cooldownSec = 0,
  voice = 'auto',
  voices,
  onVoiceChange,
  layout = {},
  channelLayout,
  naturalSize = null,
  onLayoutChange,
  onPickFile,
  onRemoveFile,
  onPickGif,
  onRemoveGif,
  onTextChange,
  onSend,
}: {
  file: File | null;
  gif?: SelectedGif | null;
  /** Channel setting: does Giphy media bypass moderation here? Drives the picker copy and notice. */
  gifAutoApprove?: boolean;
  /** Channel setting: may viewer text air unmoderated? false = a caption on an instant send is dropped. */
  textAutoApprove?: boolean;
  /** Channel setting: may YouTube links air unmoderated? Same caption rule applies to them. */
  youtubeAutoApprove?: boolean;
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
  /** What this send overrides of the channel's layout; empty = all of it stays the streamer's.
   *  The picker renders only when the channel allows it (onLayoutChange given). */
  layout?: Partial<OverlayLayout>;
  /** The channel's own layout — where the sliders start when the sender hasn't moved them. */
  channelLayout?: OverlayLayout;
  /** Pixel size of the selected file, when it has one — makes the preview show real coverage. */
  naturalSize?: { width: number; height: number } | null;
  onLayoutChange?: (next: Partial<OverlayLayout>) => void;
  onPickFile: (file: File | null) => void;
  onRemoveFile: () => void;
  onPickGif?: (gif: SelectedGif) => void;
  onRemoveGif?: () => void;
  onTextChange: (value: string) => void;
  onSend: () => void;
}) {
  const { t } = useI18n();
  const { openShop } = useShop();
  usePasteFile(onPickFile);
  const cooling = cooldownSec > 0;
  // YouTube preview only for a text link with no file/gif selected.
  const ytId = file || gif ? null : youtubeIdFromText(text);
  // Placement: every knob the sender hasn't touched shows the channel's own value, so an untouched
  // slider states what will actually happen instead of a number nobody chose.
  const touched = Object.keys(layout).length > 0;
  const anchor = layout.position ?? channelLayout?.position;
  const size = layout.size ?? channelLayout?.size ?? 80;
  const margin = layout.margin ?? channelLayout?.margin ?? 0;
  // What the file will really cover: the slider is a ceiling, and media smaller than it only grows
  // to the upscale cap. Unknown for a Giphy pick or audio — there the slider is the best we know.
  const cover = naturalSize ? renderedMediaPct(naturalSize, size) : null;
  // Flag it only when the gap is worth a sentence; a few percent of rounding is not.
  const undersized = !!cover && cover.width < size - 5;
  // The server drops the caption when the media would air instantly but the words wouldn't — say so
  // now, because afterwards they are simply gone and it reads as the streamer ignoring them.
  const captionWillDrop =
    !textAutoApprove &&
    ((!!gif && gifAutoApprove && !!text.trim()) ||
      (!!ytId && youtubeAutoApprove && !!captionBesideYoutube(text)));

  return (
    <div className="flex flex-col gap-4">
      {file ? (
        <SelectedFileCard file={file} url={previewUrl} onRemove={onRemoveFile} />
      ) : gif ? (
        <div className="flex flex-col gap-2">
          <div className="relative overflow-hidden rounded-[var(--radius)] border border-border">
            {gif.kind === 'clip' ? (
              // Real player, not the silent preview loop: this is where the sound is always
              // reachable, whatever the browser thinks of autoplay in the picker's grid.
              <video
                src={giphyClipUrl(gif.id)}
                poster={gif.previewUrl}
                controls
                loop
                autoPlay
                muted
                playsInline
                className="max-h-56 w-full object-contain"
              />
            ) : (
              <img
                src={gif.previewUrl}
                alt={gif.title}
                className="max-h-56 w-full object-contain"
              />
            )}
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
      ) : null}

      {/* Hidden while something is selected, never unmounted: taking it out of the tree would throw
          away the picker's warm grid — its open tab, decoded images and scroll — on every single
          send, and the accordion would come back closed. Also keeps it open across a send. */}
      <div className={file || gif ? 'hidden' : 'flex flex-col gap-4'}>
        <FileDropzone onPick={onPickFile} />
        {onPickGif && (
          <Accordion
            title={t('channel.gifButton')}
            icon="gift"
            // Required Giphy attribution — the picker uses hideAttribution, so we surface it here.
            titleAccessory={
              <img
                src="/powered-by-giphy.png"
                alt="Powered by GIPHY"
                className="ml-1 h-3.5 w-auto opacity-90"
              />
            }
          >
            <GifPicker autoApprove={gifAutoApprove} onPick={onPickGif} />
          </Accordion>
        )}
      </div>

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
        {captionWillDrop && (
          <div className="mt-2">
            <Alert tone="warn">
              <Icon name="square-alert" size={16} />
              <span>{t('channel.captionDroppedNotice')}</span>
            </Alert>
          </div>
        )}
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

      {/* Folded away on purpose: placement is a flourish, not a step on the way to sending. */}
      {onLayoutChange && channelLayout && (
        <Accordion title={t('channel.placement')} icon="monitor">
          <div className="flex flex-col gap-3">
            <span className="text-xs text-muted">{t('channel.placementNote')}</span>
            {/* Grid and screen side by side, same as the streamer's settings: the preview is what
                makes the knobs mean anything, but full-width it swallows the whole form. */}
            <div className="flex items-start gap-3">
              <PositionGrid
                value={layout.position ?? null}
                onChange={(p) => onLayoutChange({ ...layout, position: p })}
              />
              <div className="min-w-0 max-w-[280px] flex-1">
                <LayoutPreview
                  position={anchor ?? channelLayout.position}
                  size={size}
                  margin={margin}
                  label={t('channel.placementYou')}
                  cover={cover ?? undefined}
                />
              </div>
            </div>
            {/* The streamer's size is the ceiling — the server caps to it anyway, and a slider
                that promises more than it can give is worse than one that stops. Their own size
                being the minimum leaves nothing to choose, so the slider goes away entirely. */}
            {channelLayout.size > 10 && (
              <Slider
                icon="image"
                label={t('channel.placementSize', { n: size })}
                min={10}
                max={channelLayout.size}
                value={Math.min(size, channelLayout.size)}
                onChange={(n) => onLayoutChange({ ...layout, size: n })}
              />
            )}
            {/* Margin is padding on the anchor's flex container, so on a centred anchor it moves
                nothing — hide the slider rather than hand over a knob that does nothing. */}
            {anchor !== 'center' && (
              <Slider
                icon="monitor"
                label={t('channel.placementMargin', { n: margin })}
                min={0}
                max={25}
                value={margin}
                onChange={(n) => onLayoutChange({ ...layout, margin: n })}
              />
            )}
            {/* Say why the slider looks ignored: the file is simply too few pixels to fill it. */}
            {undersized && naturalSize && (
              <span className="text-xs text-warn">
                {t('channel.placementSmallMedia', {
                  w: naturalSize.width,
                  h: naturalSize.height,
                  n: Math.round(cover.width),
                })}
              </span>
            )}
            {touched && (
              <Button variant="ghost" className="self-start" onClick={() => onLayoutChange({})}>
                {t('channel.placementReset')}
              </Button>
            )}
          </div>
        </Accordion>
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
