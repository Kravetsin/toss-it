import { IconButton } from './IconButton';

/**
 * Бордерная «коробка» со ссылкой/кодом и кнопкой копирования рядом.
 * href → рендерим как ссылку (target=_blank), иначе как <code>.
 */
export function CopyableLinkBox({
  value,
  href,
  copied,
  onCopy,
  size = 'xs',
}: {
  value: string;
  href?: string;
  copied: boolean;
  onCopy: () => void;
  size?: 'sm' | 'xs';
}) {
  const text = size === 'sm' ? 'text-sm' : 'text-xs';
  const box = `flex-1 break-all rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 font-mono ${text} text-text transition-colors duration-[180ms] ease-out`;
  return (
    <div className="flex items-center gap-2">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`${box} hover:border-border-strong hover:text-accent`}
        >
          {value}
        </a>
      ) : (
        <code className={box}>{value}</code>
      )}
      <IconButton
        name={copied ? 'check' : 'copy'}
        label="Copy"
        active={copied}
        onClick={onCopy}
      />
    </div>
  );
}
