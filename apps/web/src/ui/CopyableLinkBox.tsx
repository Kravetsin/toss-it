import { useState } from 'react';
import { IconButton } from './IconButton';

/** Маскирует секрет после первого '=' (токен в URL), оставляя контекст ссылки. */
function maskSecret(v: string): string {
  const i = v.indexOf('=');
  const dots = '•'.repeat(12);
  return i < 0 ? dots : v.slice(0, i + 1) + dots;
}

/**
 * Бордерная «коробка» со ссылкой/кодом и кнопкой копирования рядом.
 * href → рендерим ссылкой (target=_blank), иначе <code>.
 * secret → значение замаскировано до нажатия «глаза» (копирование копирует реальное).
 */
export function CopyableLinkBox({
  value,
  href,
  copied,
  onCopy,
  size = 'xs',
  secret = false,
}: {
  value: string;
  href?: string;
  copied: boolean;
  onCopy: () => void;
  size?: 'sm' | 'xs';
  secret?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const shown = !secret || revealed;
  const display = shown ? value : maskSecret(value);

  const text = size === 'sm' ? 'text-sm' : 'text-xs';
  const box = `flex-1 break-all rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 font-mono ${text} transition-colors duration-[180ms] ease-out`;
  const color = shown ? 'text-text' : 'select-none text-muted';

  return (
    <div className="flex items-center gap-2">
      {href && shown ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`${box} ${color} hover:border-border-strong hover:text-accent`}
        >
          {display}
        </a>
      ) : (
        <code className={`${box} ${color}`}>{display}</code>
      )}
      {secret && (
        <IconButton
          name={revealed ? 'eye-off' : 'eye'}
          label={revealed ? 'Hide' : 'Show'}
          active={revealed}
          onClick={() => setRevealed((r) => !r)}
        />
      )}
      <IconButton name={copied ? 'check' : 'copy'} label="Copy" active={copied} onClick={onCopy} />
    </div>
  );
}
