export function Avatar({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  // Аватар — единственное исключение из «всё квадратное»: оставляем круг-«монету».
  const frame = 'rounded-full border-2 border-line shadow-pixel-sm [image-rendering:pixelated]';
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className={frame} />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={`flex items-center justify-center bg-twitch/30 font-body font-semibold text-twitch-light ${frame}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
