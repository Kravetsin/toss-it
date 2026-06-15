export type MediaKind = 'image' | 'video' | 'audio' | 'text';

/** Максимальная длина текста сообщения/подписи (валидируется и на клиенте, и на сервере). */
export const TEXT_MAX_LEN = 280;

/** Один из 9 якорей-пресетов для позиционирования медиа в оверлее (в порядке сетки 3×3). */
export type OverlayPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** Порядок как в UI-сетке (слева направо, сверху вниз). */
export const OVERLAY_POSITIONS: OverlayPosition[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

/**
 * Маппинг якоря во flexbox-выравнивание (justify-content / align-items).
 * Единый источник правды для оверлея и для превью в дашборде — чтобы они совпадали.
 */
export function positionToFlex(pos: OverlayPosition): { justify: string; align: string } {
  const justify = pos.includes('left') ? 'flex-start' : pos.includes('right') ? 'flex-end' : 'center';
  const align = pos.includes('top') ? 'flex-start' : pos.includes('bottom') ? 'flex-end' : 'center';
  return { justify, align };
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'played' | 'expired';

export interface MediaPlayPayload {
  submissionId: string;
  /** Относительный путь на сервере, например /api/media/<id>. Оверлей сам подставляет origin. */
  url: string;
  kind: MediaKind;
  /** Жёсткий лимит показа: оверлей снимает медиа с экрана по этому таймеру. */
  durationMs: number;
  /** Громкость воспроизведения, 0–100 (настройка канала). */
  volume: number;
  /** Проиграть короткий звук при появлении медиа (настройка канала). */
  sound: boolean;
  /** Зачитать имя отправителя голосом (TTS, настройка канала). */
  tts: boolean;
  /** Отсутствует, если стример выключил показ имени отправителя. */
  senderName?: string;
  /** Текст: подпись к файлу или тело текста-онли (kind='text'). */
  text?: string;
  /** Зачитать текст сообщения голосом (TTS, настройка канала). */
  ttsText: boolean;
  /** Якорь-позиция медиа в кадре (настройка канала). */
  position: OverlayPosition;
  /** Максимальный размер медиа в % вьюпорта (настройка канала). */
  size: number;
  /** Отступ от края кадра в % вьюпорта — для прижатых к краю позиций. */
  margin: number;
}

/** Статус отправки для живого индикатора у зрителя ('playing' — транзиентный, не в БД). */
export type LiveStatus = SubmissionStatus | 'playing';

export interface SubmissionStatusEvent {
  submissionId: string;
  status: LiveStatus;
}

/** События сервер → оверлей. */
export interface ServerToOverlayEvents {
  'media:play': (payload: MediaPlayPayload) => void;
  'media:skip': (submissionId: string) => void;
}

/** События сервер → страница зрителя (живой статус его отправки). */
export interface ServerToViewerEvents {
  'submission:status': (event: SubmissionStatusEvent) => void;
}

/** События оверлей → сервер. */
export interface OverlayToServerEvents {
  'playback:done': (submissionId: string) => void;
}

/** Краткая карточка отправки для очереди модерации. */
export interface SubmissionSummary {
  id: string;
  senderUserId: string | null;
  senderName: string | null;
  kind: MediaKind;
  mime: string;
  /** Текст: подпись к файлу или тело текста-онли. */
  text: string | null;
  durationMs: number;
  /** epoch ms */
  createdAt: number;
  /** Превью: тот же /api/media/<id>. */
  url: string;
}

/** События сервер → дашборд стримера. */
export interface ServerToDashboardEvents {
  'moderation:new': (submission: SubmissionSummary) => void;
  /** Отправка ушла из pending (одобрена/отклонена) — убрать из списка. */
  'moderation:resolved': (submissionId: string) => void;
  /** На оверлее начался показ — панель «сейчас играет». */
  'playback:started': (submission: SubmissionSummary) => void;
  'playback:ended': (submissionId: string) => void;
}

/** Настройки канала (правит стример в дашборде). */
export interface ChannelSettings {
  /** Лимит длительности для видео и картинок, мс. Более длинные видео обрезаются. */
  maxDurationMs: number;
  /** Отдельный лимит для аудио (музыка длиннее мемов), мс. */
  maxAudioDurationMs: number;
  maxFileSizeBytes: number;
  /** Громкость в оверлее, 0–100. */
  volume: number;
  /** «Стоп-кран»: false — приём отправок приостановлен. */
  accepting: boolean;
  showSenderName: boolean;
  /** Короткий звук при появлении медиа в оверлее. */
  soundAlert: boolean;
  /** Зачитывать имя отправителя голосом (TTS). */
  ttsName: boolean;
  /** Зачитывать текст сообщения голосом (TTS). */
  ttsMessage: boolean;
  /** Якорь-позиция медиа в кадре оверлея (общая для картинок/видео; музыка наследует, если musicSeparate=false). */
  overlayPosition: OverlayPosition;
  /** Максимальный размер медиа, % вьюпорта (10–100). */
  overlaySize: number;
  /** Отступ от края кадра, % вьюпорта (0–25) — для прижатых к краю позиций. */
  overlayMargin: number;
  /** true — у музыкального плеера своя раскладка (поля music*), иначе наследует overlay*. */
  musicSeparate: boolean;
  /** Якорь-позиция музыкального плеера (если musicSeparate). */
  musicPosition: OverlayPosition;
  /** Размер музыкального плеера, % вьюпорта (если musicSeparate). */
  musicSize: number;
  /** Отступ музыкального плеера от края, % вьюпорта (если musicSeparate). */
  musicMargin: number;
}

export interface HistoryEntry extends SubmissionSummary {
  status: SubmissionStatus;
}

export interface ListedUser {
  userId: string;
  login: string;
  displayName: string;
  /** epoch ms */
  addedAt: number;
}

export interface UploadResponse {
  id: string;
  status: SubmissionStatus;
  durationMs: number;
  /** Позиция в очереди показа (1 = следующий). */
  queuePosition: number;
}

export interface SessionUser {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  /** Первопроходец — погасил промокод founder. Даёт бейдж и грандфэзеринг. */
  isFounder: boolean;
  /** Входит в ADMIN_USER_IDS — может выпускать промокоды. */
  isAdmin: boolean;
}

/** Собственный канал залогиненного стримера (overlayToken — секрет, наружу не светить). */
export interface ChannelSelf {
  id: string;
  overlayToken: string;
}

export interface MeResponse {
  user: SessionUser | null;
  channel: ChannelSelf | null;
}

/** Канал, к которому у пользователя есть доступ в дашборде: свой или где он модератор. */
export interface AccessibleChannel {
  channelId: string;
  /** Логин владельца канала (для публичных ссылок и заголовка). */
  login: string;
  displayName: string;
  role: 'owner' | 'moderator';
}

/** Инфо об инвайте модератора для страницы принятия. */
export interface ModInviteInfo {
  channelLogin: string;
  channelDisplayName: string;
}

export interface PublicChannelInfo {
  login: string;
  displayName: string;
  avatarUrl: string | null;
  /** false — стример приостановил приём отправок. */
  accepting: boolean;
  /** Лимиты канала — показываем зрителю до отправки, а не ошибкой после. */
  maxDurationMs: number;
  maxAudioDurationMs: number;
  maxFileSizeBytes: number;
  /** Владелец канала — первопроходец: показываем бейдж в шапке. */
  isFounder: boolean;
}

/** Результат гашения промокода. */
export interface PromoRedeemResult {
  ok: true;
  /** Тип погашенного гранта ('founder' и т.д.) — фронт показывает сообщение по типу. */
  grant: string;
}

/** Промокод в списке админки. */
export interface AdminPromoCode {
  code: string;
  grant: string;
  note: string | null;
  createdAt: number;
  /** Логин погасившего, либо null — код ещё не использован. */
  redeemedByLogin: string | null;
  redeemedAt: number | null;
}

/** Один отправитель в таблице лидеров канала. */
export interface LeaderboardEntry {
  userId: string;
  login: string;
  displayName: string;
  /** Сколько медиа этого зрителя реально проигралось на стриме. */
  count: number;
}

/** Кросс-канальная репутация пользователя — агрегаты по всем каналам сразу. */
export interface ReputationStats {
  /** Сколько отправок зрителя реально показано на стримах (status='played'). */
  accepted: number;
  /** Сколько отправок отклонено модерацией. */
  rejected: number;
  /** На скольких каналах зритель в белом списке. */
  whitelistedChannels: number;
  /** На скольких каналах зритель забанен. */
  bannedChannels: number;
}

export interface ApiError {
  error: string;
  /** Машиночитаемый код для особой обработки на клиенте (напр. 'cooldown'). */
  code?: string;
  /** Для code='cooldown': через сколько секунд можно повторить. */
  retryAfterSec?: number;
}
