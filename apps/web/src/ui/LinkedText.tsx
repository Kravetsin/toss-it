import type { ReactNode } from 'react';

// Only http(s):// and bare www. — a plain "example.com" produces too many false hits, and any other
// scheme (javascript:, data:) must never turn into a clickable link.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const TAIL_PUNCT = `.,!?:;'"«»`;

/** Punctuation glued to the end of a URL is sentence punctuation — except a ')' that closes one inside it. */
function trimTail(url: string): string {
  let end = url.length;
  while (end > 0) {
    const c = url.charAt(end - 1);
    const head = url.slice(0, end);
    if (TAIL_PUNCT.includes(c)) end--;
    else if (c === ')' && (head.match(/\(/g)?.length ?? 0) < (head.match(/\)/g)?.length ?? 0))
      end--;
    else break;
  }
  return url.slice(0, end);
}

/**
 * Renders plain text with URLs turned into external links. The link text is the URL itself, so the
 * target is always visible — viewers write this text, nothing here may hide where a link goes.
 */
export function LinkedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    const raw = trimTail(m[0]);
    URL_RE.lastIndex = m.index + raw.length;
    if (!raw) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={raw.startsWith('www.') ? `https://${raw}` : raw}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className="break-all text-accent underline decoration-dotted underline-offset-2 transition-colors hover:text-accent-hover"
      >
        {raw}
      </a>,
    );
    last = URL_RE.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
