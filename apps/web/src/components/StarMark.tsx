/**
 * Брендовая звезда «Tossit» — четырёхлучевая искра (а не заезженная пятиконечная).
 * Смысл: звезда = показанная на стриме отправка. Задел под будущую валюту канала,
 * поэтому живёт отдельным компонентом, а не в общем наборе Icon. Тонируется currentColor.
 */
export function StarMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
    >
      <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" />
    </svg>
  );
}
