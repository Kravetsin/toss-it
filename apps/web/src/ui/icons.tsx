/**
 * Иконки на основе lucide-react. Обёртка сохраняет прежний API
 * `<Icon name="..." size className />`, поэтому места вызова не меняются.
 * Бренд-глифы (twitch/google) в Lucide отсутствуют — рисуем инлайн-SVG.
 */
import {
  ArrowLeftRight,
  Bell,
  BellOff,
  Check,
  Clock,
  Copy,
  Eye,
  FolderPlus,
  Gift,
  History,
  Home,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  type LucideIcon,
  Maximize,
  Menu,
  Minimize,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Save,
  Send,
  Settings,
  Shield,
  SkipForward,
  Sparkles,
  Star,
  TriangleAlert,
  Trophy,
  Upload,
  UserX,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

/** Карта наших имён → компоненты Lucide. */
const LUCIDE = {
  'folder-plus': FolderPlus,
  send: Send,
  upload: Upload,
  clock: Clock,
  check: Check,
  close: X,
  monitor: Monitor,
  trophy: Trophy,
  'volume-1': Volume1,
  'volume-2': Volume2,
  'volume-3': Volume2,
  'volume-x': VolumeX,
  gift: Gift,
  sparkles: Sparkles,
  star: Star,
  image: ImageIcon,
  loader: LoaderCircle,
  reload: RotateCcw,
  copy: Copy,
  'user-x': UserX,
  forward: SkipForward,
  bell: Bell,
  'bell-off': BellOff,
  shield: Shield,
  eye: Eye,
  home: Home,
  settings: Settings,
  history: History,
  'log-out': LogOut,
  menu: Menu,
  save: Save,
  play: Play,
  pause: Pause,
  'square-alert': TriangleAlert,
  fullscreen: Maximize,
  'fullscreen-exit': Minimize,
  swap: ArrowLeftRight,
} satisfies Record<string, LucideIcon>;

/** Брендовые глифы (монохром, тонируются currentColor) — пути из simple-icons (CC0). */
const BRAND = {
  twitch:
    'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  google:
    'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
} as const;

export type IconName = keyof typeof LUCIDE | keyof typeof BRAND;

/** Толщина штриха Lucide под тонкий стиль (заморожено в Фазе 0). */
const STROKE = 1.75;

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  if (name in BRAND) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`}
      >
        <path d={BRAND[name as keyof typeof BRAND]} />
      </svg>
    );
  }
  const C = LUCIDE[name as keyof typeof LUCIDE];
  return (
    <C
      size={size}
      strokeWidth={STROKE}
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
    />
  );
}
