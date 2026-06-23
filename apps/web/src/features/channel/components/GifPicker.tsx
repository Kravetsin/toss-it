import { useEffect, useMemo, useRef, useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import { Grid } from '@giphy/react-components';
import { useI18n } from '@/i18n';
import { Input } from '@/ui';
import type { SelectedGif } from '../hooks/useMediaSubmission';

const KEY = import.meta.env.VITE_GIPHY_KEY as string | undefined;
// Created once: the SDK debounces fetches internally; we add term debounce on top.
const gf = KEY ? new GiphyFetch(KEY) : null;

// Big page so a single request covers many GIFs (the beta key is rate-limited).
const PAGE = 50;
// Browse breadth (Giphy scale). Content is gated by Giphy + the channel's auto-approve
// toggle, not per-GIF here — bump to 'r' to widen, drop to 'g' to tighten.
const RATING = 'pg-13';

/** Giphy search/trending grid. Helper copy reflects whether GIFs skip moderation on this channel. */
export function GifPicker({
  onPick,
  autoApprove = true,
}: {
  onPick: (gif: SelectedGif) => void;
  /** Channel setting: do GIFs bypass moderation here? Drives the helper copy. */
  autoApprove?: boolean;
}) {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  // Non-zero default so the Grid mounts and fetches immediately; the observer refines
  // it to the real (scrollbar-excluded) width for layout.
  const [width, setWidth] = useState(320);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounce keystrokes so we don't burn the rate-limited beta quota on every character.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 450);
    return () => clearTimeout(id);
  }, [term]);

  // Measure the scroll container's inner width (excludes the scrollbar) → no horizontal scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure(); // immediate: don't rely on the observer's first callback firing
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fetchGifs = useMemo(
    () => (offset: number) =>
      debounced
        ? gf!.search(debounced, { offset, limit: PAGE, rating: RATING })
        : gf!.trending({ offset, limit: PAGE, rating: RATING }),
    [debounced],
  );

  if (!gf) {
    return <p className="text-sm text-danger">{t('channel.gifUnavailable')}</p>;
  }

  const helper = autoApprove ? t('channel.gifInstant') : t('channel.gifAllReviewed');

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={term}
        placeholder={t('channel.gifSearch')}
        onChange={(e) => setTerm(e.target.value)}
      />
      <p className="text-xs text-faint">{helper}</p>
      <div ref={scrollRef} className="max-h-72 overflow-y-auto overflow-x-hidden">
        {width > 100 && (
          <Grid
            key={debounced}
            width={width}
            columns={3}
            gutter={6}
            noLink
            hideAttribution
            fetchGifs={fetchGifs}
            onGifClick={(gif, e) => {
              e.preventDefault();
              onPick({
                id: gif.id.toString(),
                previewUrl: gif.images.fixed_height.url,
                title: gif.title,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
