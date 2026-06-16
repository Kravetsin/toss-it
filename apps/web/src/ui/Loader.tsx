import { useEffect, useState } from 'react';

// Брендовый лоадер — «сплит-флэп» табло: ряд плиток-кубиков по очереди
// переворачивается и открывает буквы слова («ЗАГРУЗКА» / «LOADING»), затем так же
// по очереди закрывается — и цикл повторяется. Сколько букв открыто сейчас, держит
// `shown`; саму механику переворота делает CSS-transition по data-on у плитки.
export function Loader({ label }: { label?: string }) {
  // Слово берём из локализованной подписи: убираем многоточие, в верхний регистр.
  const word = (label ?? 'Loading').replace(/[.…\s]+$/u, '').toUpperCase();
  const letters = [...word];
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const n = letters.length;
    if (n === 0) return;
    let count = 0;
    let opening = true; // фаза: открываем буквы или закрываем
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      let delay = 170; // шаг между буквами
      if (opening) {
        count += 1;
        if (count >= n) {
          opening = false;
          delay = 750; // пауза с открытым словом
        }
      } else {
        count -= 1;
        if (count <= 0) {
          opening = true;
          delay = 450; // пауза перед новым кругом
        }
      }
      setShown(count);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 170);
    return () => clearTimeout(timer);
    // letters пересоздаётся каждый рендер, поэтому завязываемся на стабильное word.
  }, [word]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      className="flex min-h-[50vh] flex-col items-center justify-center gap-5"
    >
      <div className="loader-board" aria-hidden="true">
        {letters.map((ch, i) =>
          ch === ' ' ? (
            <span key={i} className="loader-gap" />
          ) : (
            <span key={i} className="loader-tile" data-on={i < shown}>
              <span className="loader-tile-face loader-tile-front" />
              <span className="loader-tile-face loader-tile-back">{ch}</span>
            </span>
          ),
        )}
      </div>
      {/* Мигающий курсор — живой признак работы даже на паузе с открытым словом. */}
      <span className="pixel-blink font-display text-2xl leading-none text-twitch-light">_</span>
    </div>
  );
}
