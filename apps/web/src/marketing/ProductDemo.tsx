import { useEffect, useRef, useState } from 'react';
import type { LiveStatus, UploadResponse } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { ComposeForm } from '@/features/channel/components/ComposeForm';
import { Vessel } from '@/features/channel/components/Vessel/Vessel';
import { useFilePreview } from '@/features/channel/hooks/useFilePreview';
import type { Phase } from '@/features/channel/hooks/useMediaSubmission';
import './overlayCard.css';

// Shape a 'done' phase needs; nothing here hits the server — the whole lifecycle is simulated.
const DEMO_RESULT: UploadResponse = {
  id: 'demo',
  status: 'pending',
  durationMs: 0,
  queuePosition: 1,
  cooldownSec: 0,
  stardustBalance: 0,
};

/**
 * Landing demo: the REAL send flow, playable. The visitor picks a file / types / hits send, the
 * actual Vessel + ComposeForm run their real lifecycle (upload → processing → moderation → on
 * stream), and the window beside it shows the file exactly as it airs — lit "on stream" at the
 * playing beat. Reuses the shipped components (not lookalikes), driven by a simulated phase clock
 * since a logged-out visitor has no channel to upload to.
 */
export function ProductDemo() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState(t('demo.captionSample'));
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const previewUrl = useFilePreview(file);
  // Bumped on each play and on unmount; scheduled steps whose token is stale no-op.
  const tok = useRef(0);
  useEffect(() => () => void (tok.current += 1), []);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec]);

  const play = () => {
    const my = (tok.current += 1);
    const at = (ms: number, fn: () => void) =>
      window.setTimeout(() => {
        if (my === tok.current) fn();
      }, ms);
    setStatus(null);
    setCooldownSec(0);
    setPhase({ name: 'uploading', progress: 0 });
    at(150, () => setPhase({ name: 'uploading', progress: 0.4 }));
    at(700, () => setPhase({ name: 'uploading', progress: 0.75 }));
    at(1200, () => setPhase({ name: 'uploading', progress: 1 }));
    at(1600, () => setPhase({ name: 'uploading', progress: null }));
    at(3200, () => {
      setPhase({ name: 'done', result: DEMO_RESULT });
      setStatus('pending');
    });
    at(4400, () => setStatus('approved'));
    at(5500, () => setStatus('playing'));
    at(7800, () => setStatus('played'));
    at(9000, () => {
      setStatus(null);
      setPhase({ name: 'idle' });
    });
  };

  return (
    <section className="py-8">
      <div className="mx-auto w-full max-w-6xl px-4">
        <p className="mb-5 text-center label-mono text-muted">{t('demo.title')}</p>
        <div className="grid gap-6 md:grid-cols-2 md:items-start">
          <Vessel phase={phase} status={status} cooldownSec={cooldownSec}>
            <ComposeForm
              file={file}
              previewUrl={previewUrl}
              text={text}
              senderName={t('demo.sender')}
              errorMessage={null}
              cooldownSec={cooldownSec}
              onPickFile={setFile}
              onRemoveFile={() => setFile(null)}
              onTextChange={setText}
              onSend={play}
            />
          </Vessel>
          <StreamWindow
            file={file}
            url={previewUrl}
            text={text}
            sender={t('demo.sender')}
            status={status}
          />
        </div>
      </div>
    </section>
  );
}

/** The streamer's screen: empty until the post airs, then the real overlay card pops in. Live badge. */
function StreamWindow({
  file,
  url,
  text,
  sender,
  status,
}: {
  file: File | null;
  url: string | null;
  text: string;
  sender: string;
  status: LiveStatus | null;
}) {
  const { t } = useI18n();
  const live = status === 'playing' || status === 'played';
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden border bg-black transition-colors duration-300 ${
        live ? 'border-accent/60' : 'border-border'
      }`}
    >
      <span className="absolute left-2 top-2 z-10 flex items-center gap-1.5 label-mono text-[10px]">
        <span
          className={`inline-block size-2 rounded-full ${live ? 'animate-pulse bg-danger' : 'bg-faint'}`}
        />
        <span className={live ? 'text-danger' : 'text-muted'}>
          {live ? t('demo.live') : t('demo.screen')}
        </span>
      </span>

      {/* The submission only reaches the streamer's screen once it airs — before that (uploading,
          moderation, queue) the screen stays empty, mirroring the real flow. */}
      {live ? (
        <OverlayCard file={file} url={url} text={text} sender={sender} />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-6 text-center">
          <span className="text-sm text-faint">{t('demo.streamEmpty')}</span>
        </div>
      )}
    </div>
  );
}

/** The overlay's real submission card (.player), reproduced from apps/overlay for the demo: media on
 *  top, then a one-line "name · caption" meta row. Styling lives in overlayCard.css. */
function OverlayCard({
  file,
  url,
  text,
  sender,
}: {
  file: File | null;
  url: string | null;
  text: string;
  sender: string;
}) {
  const caption = text.trim();
  const hasMedia = !!(file && url);
  return (
    <div className="demo-overlay">
      <div className={`player ${hasMedia ? 'has-media' : 'is-text'}`}>
        <div className="player-media">
          {hasMedia ? (
            <Media file={file} url={url} />
          ) : (
            <div className="text-body">{caption || sender}</div>
          )}
        </div>
        <div className="player-meta">
          <span className="name">{sender}</span>
          {hasMedia && caption && (
            <>
              <span className="meta-sep">·</span>
              <span className="player-caption">{caption}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** img/video are sized by overlayCard.css; audio has no visual, so a compact stand-in (the real
 *  overlay renders audio through its own music widget). */
function Media({ file, url }: { file: File; url: string }) {
  if (file.type.startsWith('image/')) return <img src={url} alt="" />;
  if (file.type.startsWith('video/')) return <video src={url} muted loop autoPlay playsInline />;
  return (
    <span
      className="flex items-center gap-2 px-2 py-1 text-[13px] text-text"
      style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)" }}
    >
      <Icon name="volume-2" size={18} className="text-accent" />
      audio
    </span>
  );
}
