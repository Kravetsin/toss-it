import { StarMark } from '@/components/StarMark';
import { Icon, type IconName } from './icons';

/**
 * On/off switch styled to the star theme: the knob is a spark that lights mint and
 * twinkles when turned on (see .switch-star in index.css). Renders a full clickable
 * row — optional icon + label (+ description) on the left, the switch on the right.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      {icon && <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-muted" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`switch-star mt-0.5 shrink-0 ${disabled ? '' : 'cursor-pointer'}`}
      >
        <span className="switch-star-knob">
          <StarMark size={11} className="switch-star-spark" />
        </span>
      </button>
    </label>
  );
}
