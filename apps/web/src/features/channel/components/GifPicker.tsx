import { useEffect, useMemo, useRef, useState } from 'react';
import { GiphyFetch, type GifsResult } from '@giphy/js-fetch-api';
import { Grid } from '@giphy/react-components';
import { giphyClipUrl } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Input } from '@/ui';
import { Icon } from '@/ui/icons';
import type { SelectedGif } from '../hooks/useMediaSubmission';

const KEY = import.meta.env.VITE_GIPHY_KEY as string | undefined;
// Created once: the SDK debounces fetches internally; we add term debounce on top.
const gf = KEY ? new GiphyFetch(KEY) : null;

// Big page so a single request covers many GIFs (the beta key is rate-limited).
const PAGE = 50;
// Browse breadth (Giphy scale). Content is gated by Giphy + the channel's auto-approve
// toggle, not per-GIF here — bump to 'r' to widen, drop to 'g' to tighten.
const RATING = 'pg-13';

/** Giphy's own three libraries. 'videos' is what their API calls Clips — real video, with sound. */
const TABS = [
  { type: 'gifs', label: 'channel.gifTabGifs' },
  { type: 'stickers', label: 'channel.gifTabStickers' },
  { type: 'videos', label: 'channel.gifTabClips' },
] as const;
type TabType = (typeof TABS)[number]['type'];

/** Where a viewer uploads their own GIF; Giphy publishes it under their account. */
const CREATE_URL = 'https://giphy.com/create/gifmaker';

/** Which library was open last (a real preference) and what was typed (only this visit). */
const TAB_KEY = 'tossit-giphy-tab';
const TERM_KEY = 'tossit-giphy-term';

// Storage is a nice-to-have here: a locked-down browser just loses the sticky tab, nothing else.
function readPref(store: 'local' | 'session', key: string): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function writePref(store: 'local' | 'session', key: string, value: string): void {
  try {
    (store === 'local' ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    /* private mode */
  }
}

/**
 * Result cache, module-level so it outlives the picker. Picking a GIF makes ComposeForm render its
 * "selected" branch, which throws the accordion (and the grid inside it) away — so every send used
 * to cost another request against a quota we keep hitting. The SDK caches too, but for 60 s only:
 * far shorter than "pick a GIF, write a caption, send, come back".
 *
 * Keyed per library + term + page, so switching tabs back and forth is free too.
 */
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_MAX = 40;
const pages = new Map<string, { at: number; result: GifsResult }>();

async function fetchPage(type: TabType, term: string, offset: number): Promise<GifsResult> {
  const key = `${type}|${term}|${offset}`;
  const hit = pages.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    // Re-insert: Map keeps insertion order, which is what makes the trim below an LRU.
    pages.delete(key);
    pages.set(key, hit);
    return hit.result;
  }
  const result = term
    ? await gf!.search(term, { offset, limit: PAGE, rating: RATING, type })
    : await gf!.trending({ offset, limit: PAGE, rating: RATING, type });
  pages.set(key, { at: Date.now(), result });
  while (pages.size > CACHE_MAX) {
    const oldest = pages.keys().next().value;
    if (oldest === undefined) break;
    pages.delete(oldest);
  }
  return result;
}

/** Marks a clip as playable video in the grid — otherwise it reads as just another silent GIF. */
function ClipBadge() {
  return (
    <span className="pointer-events-none absolute bottom-1 left-1 grid size-6 place-items-center rounded-full bg-bg/70 text-text">
      <Icon name="play" size={13} />
    </span>
  );
}

/** Don't pull a clip on every cell a moving cursor crosses. */
const HOVER_DELAY_MS = 160;

/**
 * Hover-to-listen, the way giphy.com does it: the hovered cell plays the real clip with its sound,
 * so a viewer hears what they are about to send. Autoplay WITH sound needs user activation — opening
 * the picker is normally enough for the whole document, but where the browser refuses we drop to
 * muted playback and offer a speaker button instead of silently pretending there is no sound.
 */
function ClipHoverPreview({
  gif,
  isHovered,
}: {
  gif: { id: string | number };
  isHovered: boolean;
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isHovered) {
      setSrc(null);
      setMuted(false);
      return;
    }
    const timer = window.setTimeout(() => setSrc(giphyClipUrl(String(gif.id))), HOVER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isHovered, gif.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
    el.muted = muted;
    el.play().catch(() => setMuted(true));
  }, [src, muted]);

  if (!src) return <ClipBadge />;
  return (
    <>
      {/* pointer-events-none: the grid decides what is hovered and what a click selects. */}
      <video
        ref={videoRef}
        src={src}
        loop
        playsInline
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      {muted && (
        <button
          type="button"
          aria-label={t('channel.clipUnmute')}
          title={t('channel.clipUnmute')}
          // Must not reach the cell: a click there picks the clip.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMuted(false);
          }}
          className="absolute bottom-1 left-1 grid size-6 cursor-pointer place-items-center rounded-full bg-bg/70 text-text hover:text-accent"
        >
          <Icon name="volume-x" size={13} />
        </button>
      )}
    </>
  );
}

/** Giphy search/trending grid over GIFs, stickers and clips. Helper copy reflects moderation. */
export function GifPicker({
  onPick,
  autoApprove = true,
}: {
  onPick: (gif: SelectedGif) => void;
  /** Channel setting: does Giphy media bypass moderation here? Drives the helper copy. */
  autoApprove?: boolean;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabType>(() => {
    const saved = readPref('local', TAB_KEY);
    return TABS.some((tb) => tb.type === saved) ? (saved as TabType) : 'gifs';
  });
  const [term, setTerm] = useState(() => readPref('session', TERM_KEY) ?? '');
  // Seeded with the restored term, not '': otherwise the first mount would fetch trending and
  // then immediately fetch the search — two requests to show one screen.
  const [debounced, setDebounced] = useState(term);
  // Non-zero default so the Grid mounts and fetches immediately; the observer refines
  // it to the real (scrollbar-excluded) width for layout.
  const [width, setWidth] = useState(320);
  const boxes = useRef(new Map<TabType, HTMLDivElement>());
  /**
   * Which libraries stay mounted. A tab the viewer has opened keeps its grid — and with it the
   * decoded images and its own scroll position — so coming back is instant instead of building the
   * list again. Tracked WITH the term it belongs to and derived below rather than synced in an
   * effect: a new search must drop the other tabs in the same render, or their remount would fire
   * a request each for a library nobody is looking at.
   */
  const [opened, setOpened] = useState<{ term: string; tabs: TabType[] }>({
    term: debounced,
    tabs: [tab],
  });
  const mountedTabs = opened.term === debounced ? opened.tabs : [tab];

  // Debounce keystrokes so we don't burn the rate-limited beta quota on every character.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = term.trim();
      setDebounced(next);
      writePref('session', TERM_KEY, next);
    }, 450);
    return () => clearTimeout(id);
  }, [term]);

  // Measure the scroll container's inner width (excludes the scrollbar) → no horizontal scroll.
  // The VISIBLE tab's box: a hidden one reports 0, and each tab scrolls on its own now.
  useEffect(() => {
    const el = boxes.current.get(tab);
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure(); // immediate: don't rely on the observer's first callback firing
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, mountedTabs.length]);

  // One fetcher per library, stable as long as the term is: a hidden grid must not see a new
  // fetchGifs just because the active tab changed — that alone would make it refetch.
  const fetchers = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((tb) => [tb.type, (offset: number) => fetchPage(tb.type, debounced, offset)]),
      ) as Record<TabType, (offset: number) => Promise<GifsResult>>,
    [debounced],
  );

  const openTab = (next: TabType) => {
    setTab(next);
    writePref('local', TAB_KEY, next);
    setOpened((prev) =>
      prev.term !== debounced
        ? { term: debounced, tabs: [next] }
        : prev.tabs.includes(next)
          ? prev
          : { ...prev, tabs: [...prev.tabs, next] },
    );
  };

  if (!gf) {
    return <p className="text-sm text-danger">{t('channel.gifUnavailable')}</p>;
  }

  const helper = autoApprove ? t('channel.gifInstant') : t('channel.gifAllReviewed');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-full border border-border bg-surface-2 p-1">
        {TABS.map((tb) => (
          <button
            key={tb.type}
            type="button"
            aria-pressed={tab === tb.type}
            onClick={() => openTab(tb.type)}
            className={`flex-1 rounded-full px-3 py-1.5 label-mono transition-colors duration-[var(--dur-fast)] ${
              tab === tb.type ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
            }`}
          >
            {t(tb.label)}
          </button>
        ))}
      </div>
      <Input
        value={term}
        placeholder={t('channel.gifSearch')}
        onChange={(e) => setTerm(e.target.value)}
      />
      {/* Moderation reads the same for every library (one channel flag covers all of Giphy); the
          clips tab adds the one thing only it has — sound. */}
      <p className="text-xs text-faint">
        {helper}
        {tab === 'videos' && ` ${t('channel.clipNotice')}`}
      </p>
      {/* One box per opened library, all but the active one hidden — that is what makes going back
          instant: the grid, its images and its scroll offset are all still there. */}
      {mountedTabs.map((tb) => (
        <div
          key={tb}
          ref={(el) => {
            if (el) boxes.current.set(tb, el);
            else boxes.current.delete(tb);
          }}
          className={`max-h-72 overflow-y-auto overflow-x-hidden ${tb === tab ? '' : 'hidden'}`}
        >
          {width > 100 && (
            // Keyed by term as well: a new search must refetch from offset 0, not paginate the old one.
            <Grid
              key={`${tb}:${debounced}`}
              width={width}
              columns={3}
              gutter={6}
              noLink
              hideAttribution
              overlay={tb === 'videos' ? ClipHoverPreview : undefined}
              fetchGifs={fetchers[tb]}
              onGifClick={(gif, e) => {
                e.preventDefault();
                onPick({
                  id: gif.id.toString(),
                  // Clips carry the same gif renditions as anything else, so the compose preview is
                  // a silent loop either way; what differs is the send — video with sound.
                  previewUrl: gif.images.fixed_height.url,
                  title: gif.title,
                  kind: tb === 'videos' ? 'clip' : 'gif',
                });
              }}
            />
          )}
        </div>
      ))}
      <a
        href={CREATE_URL}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center gap-1.5 self-start text-xs text-muted transition-colors duration-[var(--dur-fast)] hover:text-accent"
      >
        <Icon name="upload" size={13} />
        {t('channel.gifCreate')}
      </a>
    </div>
  );
}
