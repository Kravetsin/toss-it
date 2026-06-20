export function Avatar({
  url,
  name,
  size = 48,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const frame = 'rounded-full border border-border shadow-1';
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className={frame} />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={`flex items-center justify-center bg-accent-soft font-semibold text-accent ${frame}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
