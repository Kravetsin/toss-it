import { Icon, type IconName } from './icons';

/**
 * Outlined pill that is either on or off — a toggle on its own, a segmented choice in a row. Shared
 * so the same setting looks the same wherever it is reachable from (dashboard modal, settings page).
 */
export function TogglePill({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex w-max cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 label-mono outline-none transition-colors focus-visible:[box-shadow:var(--shadow-focus)] ${
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border text-muted hover:text-text'
      }`}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}
