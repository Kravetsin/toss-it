import { Button } from './Button';
import { Icon } from './icons';

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
  const box = `flex-1 break-all rounded-none border-2 border-line bg-surface-2 px-3 py-2 ${text} text-twitch-light`;
  return (
    <div className="flex items-center gap-2">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={`${box} hover:underline`}>
          {value}
        </a>
      ) : (
        <code className={box}>{value}</code>
      )}
      <Button className="shrink-0" onClick={onCopy}>
        <Icon name={copied ? 'check' : 'copy'} size={16} />
      </Button>
    </div>
  );
}
