import { useId, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/**
 * Collapsible section with a smooth open/close. Animates via grid-template-rows 0fr↔1fr
 * (transitions to the content's natural height, no max-height guessing). Children mount
 * on first open and stay mounted after, so heavy content (e.g. a remote picker) doesn't
 * load until the user asks for it, and re-opening is instant.
 */
export function Accordion({
  title,
  icon,
  titleAccessory,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: IconName;
  /** Optional node rendered right after the title (e.g. a "Powered by" attribution mark). */
  titleAccessory?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const id = useId();

  const toggle = () => {
    setOpen((o) => !o);
    setMounted(true);
  };

  return (
    <div className="rounded-[var(--radius)] border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm text-text"
      >
        <span className="flex items-center gap-1.5">
          {icon && <Icon name={icon} size={16} />}
          {title}
          {titleAccessory}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={`text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">{mounted ? children : null}</div>
        </div>
      </div>
    </div>
  );
}
