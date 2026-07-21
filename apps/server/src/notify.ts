import { config } from './config';

/**
 * Fire-and-forget Telegram message to the admin chat. No-op when unconfigured,
 * and never throws — a notification must not affect the request that triggered it.
 * Plain text (no parse_mode) so user-controlled names can't inject markup.
 */
export function notifyTelegram(text: string): void {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) return;
  void fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

export function notifyNewUser(
  user: { login: string; displayName: string },
  provider: string,
): void {
  notifyTelegram(`🆕 Новый пользователь: ${user.displayName} (@${user.login}) — через ${provider}`);
}
