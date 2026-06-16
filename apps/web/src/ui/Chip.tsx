import { Icon, type IconName } from './icons';

/** Небольшой чип-пилюля с иконкой и текстом (напр. лимиты канала). */
export function Chip({ icon, text }: { icon: IconName; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-none border-2 border-line bg-surface-2 px-3 py-1">
      <Icon name={icon} size={15} className="text-muted" />
      {text}
    </span>
  );
}
