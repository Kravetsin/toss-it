import { config } from '../../config';

const HELIX = 'https://api.twitch.tv/helix';
const REWARDS = `${HELIX}/channel_points/custom_rewards`;
const REDEMPTIONS = `${HELIX}/channel_points/custom_rewards/redemptions`;
const SUBS = `${HELIX}/eventsub/subscriptions`;

/** One authorized Helix request with the streamer's user token. Caller inspects `.status` for 401. */
function helix(method: string, url: string, token: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': config.twitch.clientId,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Create the app-owned reward. Returns the new reward id, or null with the response for the caller.
 *  Icon/image can't be set via the API (dashboard-only) — the streamer uploads one if they want. */
export function createReward(
  token: string,
  broadcasterId: string,
  title: string,
  cost: number,
  prompt: string,
): Promise<Response> {
  const url = new URL(REWARDS);
  url.searchParams.set('broadcaster_id', broadcasterId);
  // No caps by design. should_redemptions_skip_request_queue MUST stay false — we fulfill each
  // redemption ourselves after crediting dust (that's what makes it terminal/unrefundable).
  return helix('POST', url.toString(), token, {
    title,
    cost,
    prompt,
    is_enabled: true,
    should_redemptions_skip_request_queue: false,
    is_user_input_required: false,
    background_color: '#8DF0CC',
  });
}

/** List the rewards THIS app created on the channel (only_manageable_rewards). Used to recover our
 *  reward's id when create returns 400 (it already exists — e.g. a prior disconnect didn't delete). */
export function getManageableRewards(token: string, broadcasterId: string): Promise<Response> {
  const url = new URL(REWARDS);
  url.searchParams.set('broadcaster_id', broadcasterId);
  url.searchParams.set('only_manageable_rewards', 'true');
  return helix('GET', url.toString(), token);
}

export function deleteReward(
  token: string,
  broadcasterId: string,
  rewardId: string,
): Promise<Response> {
  const url = new URL(REWARDS);
  url.searchParams.set('broadcaster_id', broadcasterId);
  url.searchParams.set('id', rewardId);
  return helix('DELETE', url.toString(), token);
}

/**
 * Mark a redemption FULFILLED. FULFILLED is terminal (can't be refunded), so a successful call is
 * what makes the spent points irreversible — we credit dust only after this returns ok.
 */
export function fulfillRedemption(
  token: string,
  broadcasterId: string,
  rewardId: string,
  redemptionId: string,
): Promise<Response> {
  const url = new URL(REDEMPTIONS);
  url.searchParams.set('id', redemptionId);
  url.searchParams.set('broadcaster_id', broadcasterId);
  url.searchParams.set('reward_id', rewardId);
  return helix('PATCH', url.toString(), token, { status: 'FULFILLED' });
}

/**
 * List redemptions of our reward in a given status (paginated). Used to sweep the UNFULFILLED
 * backlog after a (re)subscribe — EventSub does not replay events missed during downtime, so
 * anything redeemed while we were offline would otherwise sit stuck in the queue forever.
 */
export function getRedemptions(
  token: string,
  broadcasterId: string,
  rewardId: string,
  status: string,
  after?: string,
): Promise<Response> {
  const url = new URL(REDEMPTIONS);
  url.searchParams.set('broadcaster_id', broadcasterId);
  url.searchParams.set('reward_id', rewardId);
  url.searchParams.set('status', status);
  url.searchParams.set('first', '50');
  if (after) url.searchParams.set('after', after);
  return helix('GET', url.toString(), token);
}

/** Subscribe to redemptions of our reward on this channel's own WebSocket session (each streamer's
 *  connection is separate — Twitch forbids multiple users' subs on one session). */
export function createRedemptionSub(
  token: string,
  broadcasterId: string,
  rewardId: string,
  sessionId: string,
): Promise<Response> {
  return helix('POST', SUBS, token, {
    type: 'channel.channel_points_custom_reward_redemption.add',
    version: '1',
    condition: { broadcaster_user_id: broadcasterId, reward_id: rewardId },
    transport: { method: 'websocket', session_id: sessionId },
  });
}
