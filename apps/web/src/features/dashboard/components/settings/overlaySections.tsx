import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChannelSettings, MusicDisplay, OverlayPosition } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { LayoutPreview, PositionGrid, Slider, Switch, TogglePill } from '@/ui';
import { Icon } from '@/ui/icons';
import { SaveRow } from './controls';
import { ChatBurstButton } from './ChatBurstButton';
import { ChatPreview } from './ChatPreview';
import { MusicDisplayChoice } from '../MusicDisplayChoice';

type Save = (patch: Partial<ChannelSettings>) => void;

/** Where media appears on the overlay: position anchor, size, margin, playback volume. */
export function MediaLayoutSettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: Save;
}) {
  const { t } = useI18n();
  const [position, setPosition] = useState<OverlayPosition>(settings.overlayPosition);
  const [mediaSize, setMediaSize] = useState(settings.overlaySize);
  const [margin, setMargin] = useState(settings.overlayMargin);
  const [ytAsMusic, setYtAsMusic] = useState(settings.youtubeAsMusic);
  const [parallel, setParallel] = useState(settings.parallelSlots);
  const [viewerPos, setViewerPos] = useState(settings.allowViewerPosition);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="text-sm text-muted">{t('dash.position')}</span>
          <div className="mt-1">
            <PositionGrid value={position} onChange={setPosition} />
          </div>
        </div>
        <LayoutPreview
          position={position}
          size={mediaSize}
          margin={margin}
          label={t('dash.previewMedia')}
          caption={t('dash.preview')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          icon="image"
          label={t('dash.sliderMediaSize', { n: mediaSize })}
          min={10}
          max={100}
          value={mediaSize}
          onChange={setMediaSize}
        />
        <Slider
          icon="monitor"
          label={t('dash.sliderMargin', { n: margin })}
          min={0}
          max={25}
          value={margin}
          onChange={setMargin}
        />
      </div>
      {/* Right under the anchor it overrides: this is the one setting that can move a post away
          from the corner chosen above, so it belongs next to that corner. */}
      <Switch
        icon="monitor"
        label={t('dash.allowViewerPosition')}
        description={t('settings.allowViewerPositionNote')}
        checked={viewerPos}
        onChange={setViewerPos}
      />
      {/* Lives here, next to the big player, because it answers "what even lands in this one". */}
      <Switch
        icon="youtube"
        label={t('dash.youtubeAsMusic')}
        description={t('settings.youtubeAsMusicNote')}
        checked={ytAsMusic}
        onChange={setYtAsMusic}
      />
      {/* Only meaningful while YouTube goes to the compact player: otherwise the music stage would
          only ever receive uploaded audio files, and nothing would run in parallel. */}
      {ytAsMusic && (
        <Switch
          icon="image"
          label={t('dash.parallelSlots')}
          description={t('settings.parallelSlotsNote')}
          checked={parallel}
          onChange={setParallel}
        />
      )}
      {/* Overlapping anchors are allowed — just say what will happen, don't block the save. */}
      {ytAsMusic && parallel && !settings.musicSeparate && (
        <p className="flex items-start gap-1.5 text-xs text-faint">
          <Icon name="monitor" size={13} className="mt-px shrink-0" />
          {t('settings.sameAnchorNote')}
        </p>
      )}
      <SaveRow
        onClick={() =>
          onSave({
            overlayPosition: position,
            overlaySize: mediaSize,
            overlayMargin: margin,
            allowViewerPosition: viewerPos,
            youtubeAsMusic: ytAsMusic,
            parallelSlots: parallel,
          })
        }
      />
    </div>
  );
}

/** Music player layout: position/size/margin drive the background player always; the switch also
 *  applies them to song-request cards (otherwise those follow the media overlay position). */
export function MusicSettings({ settings, onSave }: { settings: ChannelSettings; onSave: Save }) {
  const { t } = useI18n();
  const [separate, setSeparate] = useState(settings.musicSeparate);
  const [musicPos, setMusicPos] = useState<OverlayPosition>(settings.musicPosition);
  const [musicSize, setMusicSize] = useState(settings.musicSize);
  const [musicMargin, setMusicMargin] = useState(settings.musicMargin);
  // The same knob the music manager carries — streamers look for it in both places.
  const [display, setDisplay] = useState<MusicDisplay>(settings.bgMusicDisplay);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">{t('dash.musicLayoutNote')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="text-sm text-muted">{t('dash.positionShort')}</span>
          <div className="mt-1">
            <PositionGrid value={musicPos} onChange={setMusicPos} />
          </div>
        </div>
        <LayoutPreview
          position={musicPos}
          size={musicSize}
          margin={musicMargin}
          label={t('dash.previewMusic')}
          caption={t('dash.preview')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          icon="image"
          label={t('dash.sliderMusicSize', { n: musicSize })}
          min={10}
          max={100}
          value={musicSize}
          onChange={setMusicSize}
        />
        <Slider
          icon="monitor"
          label={t('dash.sliderMargin', { n: musicMargin })}
          min={0}
          max={25}
          value={musicMargin}
          onChange={setMusicMargin}
        />
      </div>
      <Switch
        icon="volume-2"
        label={t('dash.musicSeparate')}
        description={t('settings.musicSeparateNote')}
        checked={separate}
        onChange={setSeparate}
      />
      <MusicDisplayChoice value={display} onChange={setDisplay} />
      <SaveRow
        onClick={() =>
          onSave({
            musicSeparate: separate,
            musicPosition: musicPos,
            musicSize,
            musicMargin,
            bgMusicDisplay: display,
          })
        }
      />
    </div>
  );
}

/** Chat overlay toggle + its font size and fade. (Grows over time.) */
export function ChatSettings({
  settings,
  onSave,
  channelId,
  login,
}: {
  settings: ChannelSettings;
  onSave: Save;
  channelId: string;
  /** Whose name the preview row carries: the streamer's own, so it reads as their chat. */
  login: string;
}) {
  const { t } = useI18n();
  const [chatOverlay, setChatOverlay] = useState(settings.chatOverlayEnabled);
  const [chatFont, setChatFont] = useState(settings.chatFontSize);
  const [chatFade, setChatFade] = useState(settings.chatFadeSeconds);
  const [chatBg, setChatBg] = useState(settings.chatBgOpacity);
  const [chatCompact, setChatCompact] = useState(settings.chatCompact);
  const [showBadges, setShowBadges] = useState(settings.chatShowBadges);
  const [roleBorders, setRoleBorders] = useState(settings.chatRoleBorders);
  return (
    <div className="flex flex-col gap-4">
      <Switch
        icon="message-circle"
        label={t('dash.chatOverlay')}
        description={t('dash.chatOverlayNote')}
        checked={chatOverlay}
        onChange={setChatOverlay}
      />
      {chatOverlay && (
        <div className="flex flex-col gap-4 border-l border-accent/40 pl-4">
          {/* Above the sliders that drive it: the row is what they are all about, and it has to
              stay in frame while a slider under the thumb moves. */}
          <ChatPreview
            name={login}
            fontSize={chatFont}
            bgOpacity={chatBg}
            compact={chatCompact}
            showBadges={showBadges}
            roleBorders={roleBorders}
          />
          {/* Right under the preview that shows what it does: the two words alone do not tell a
              streamer which one their chat becomes. */}
          <div>
            <span className="label-mono text-muted">{t('dash.chatLayout')}</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <TogglePill
                active={!chatCompact}
                icon="message-circle"
                label={t('dash.chatLayoutRoomy')}
                onClick={() => setChatCompact(false)}
              />
              <TogglePill
                active={chatCompact}
                icon="menu"
                label={t('dash.chatLayoutCompact')}
                onClick={() => setChatCompact(true)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Slider
              icon="message-circle"
              label={t('dash.chatFont', { n: chatFont })}
              min={12}
              max={40}
              value={chatFont}
              onChange={setChatFont}
            />
            <Slider
              icon="clock"
              label={chatFade === 0 ? t('dash.chatFadeOff') : t('dash.chatFade', { n: chatFade })}
              min={0}
              max={120}
              value={chatFade}
              onChange={setChatFade}
            />
            <Slider
              icon="palette"
              label={t('dash.chatBgOpacity', { n: chatBg })}
              min={0}
              max={100}
              value={chatBg}
              onChange={setChatBg}
            />
          </div>
          <Switch
            icon="sparkles"
            label={t('dash.chatBadges')}
            checked={showBadges}
            onChange={setShowBadges}
          />
          {/* The level switch is NOT here: the numeral shows on the media overlay too, and this
              whole block disappears when the chat overlay is off — a streamer who turned chat off
              would have had no way left to control it. It lives with the other "what shows on a
              viewer's stuff" flags, in SettingsToggles. */}
          <Switch
            icon="shield"
            label={t('dash.chatRoleBorders')}
            checked={roleBorders}
            onChange={setRoleBorders}
          />
          {/* Right next to the sliders it exists to serve: the lines keep coming while they move. */}
          <ChatBurstButton channelId={channelId} />
        </div>
      )}
      {/* This section is about RENDERING chat; how the bot answers commands is a property of the
          bot, and lives on its own tab. Only the signpost stays here — "chat" is a word that sends
          people to two different screens, so each has to point at the other. */}
      <p className="flex items-start gap-1.5 text-xs text-faint">
        <Icon name="sparkles" size={13} className="mt-px shrink-0" />
        <span>
          {t('dash.chatBotNote')}{' '}
          <Link
            to="/dashboard/settings/bot"
            className="text-accent underline-offset-2 outline-none hover:underline focus-visible:underline"
          >
            {t('dash.chatBotLink')}
          </Link>
        </span>
      </p>
      <SaveRow
        onClick={() =>
          onSave({
            chatOverlayEnabled: chatOverlay,
            chatFontSize: chatFont,
            chatFadeSeconds: chatFade,
            chatBgOpacity: chatBg,
            chatCompact,
            chatShowBadges: showBadges,
            chatRoleBorders: roleBorders,
          })
        }
      />
    </div>
  );
}
