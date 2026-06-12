export type MediaKind = 'image' | 'video' | 'audio';

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
  /** Отсутствует, если стример выключил показ имени отправителя. */
  senderName?: string;
}

/** События сервер → оверлей. */
export interface ServerToOverlayEvents {
  'media:play': (payload: MediaPlayPayload) => void;
  'media:skip': (submissionId: string) => void;
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
  /** Максимальная длительность показа, мс. Более длинные видео/аудио обрезаются. */
  maxDurationMs: number;
  maxFileSizeBytes: number;
  /** Громкость в оверлее, 0–100. */
  volume: number;
  /** «Стоп-кран»: false — приём отправок приостановлен. */
  accepting: boolean;
  showSenderName: boolean;
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

export interface PublicChannelInfo {
  login: string;
  displayName: string;
  /** false — стример приостановил приём отправок. */
  accepting: boolean;
}

export interface ApiError {
  error: string;
}
