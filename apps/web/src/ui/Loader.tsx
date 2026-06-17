import { Icon } from '@/ui/icons';

// Лоадер в стиле Motion-dark: по центру крутится тонкая иконка-спиннер,
// под ней — локализованная подпись моно-капсом. Подпись берём из `label`
// (убираем хвостовое многоточие/пробелы). Без пиксельной механики —
// вращение через `animate-spin`, которое само гасится под prefers-reduced-motion.
export function Loader({ label }: { label?: string }) {
  const word = (label ?? 'Loading').replace(/[.…\s]+$/u, '');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      className="flex min-h-[50vh] flex-col items-center justify-center gap-5"
    >
      <Icon name="loader" size={36} className="animate-spin text-accent" />
      <span aria-hidden="true" className="label-mono text-muted">
        {word}
      </span>
    </div>
  );
}
