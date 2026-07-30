import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { appMeta } from '../db/schema';
import { registerAdminRoutes } from './admin';
import { registerAuthRoutes } from './auth';
import { registerChannelRoutes } from './channels';
import { registerCosmeticsRoutes } from './cosmetics';
import { registerDashboardRoutes } from './dashboard';
import { registerMediaRoutes, type MediaRoutesDeps } from './media';
import { registerPromoRoutes } from './promo';
import { registerDonationRoutes } from './donations';
import type { TwitchChatModule } from '../modules/twitch-chat/index';
import type { ChannelPointsModule } from '../modules/channel-points/index';
import type { Payouts } from '../media/payout';

export function registerRoutes(
  app: FastifyInstance,
  deps: MediaRoutesDeps & {
    twitchChat: TwitchChatModule;
    channelPoints: ChannelPointsModule;
    payouts: Payouts;
  },
): void {
  /**
   * Lightweight uptime-monitor ping; does not touch the DB. Open to any origin on purpose: a stuck
   * overlay probes it cross-origin (a mirror host, or the dev overlay on Vite's port) to decide
   * whether reloading would land anywhere, and a blocked probe reads as "server down".
   */
  app.get('/api/ping', async (_req, reply) => {
    reply.header('access-control-allow-origin', '*');
    return { ok: true };
  });

  app.get('/api/health', async () => {
    const row = await db.select().from(appMeta).where(eq(appMeta.key, 'health_checks')).get();
    const count = row ? Number(row.value) + 1 : 1;
    await db
      .insert(appMeta)
      .values({ key: 'health_checks', value: String(count) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: String(count) } });
    return { ok: true, healthChecks: count, time: new Date().toISOString() };
  });

  registerAuthRoutes(app, { twitchChat: deps.twitchChat, channelPoints: deps.channelPoints });
  registerChannelRoutes(app);
  registerCosmeticsRoutes(app);
  registerMediaRoutes(app, deps);
  registerDashboardRoutes(app, {
    playback: deps.playback,
    io: deps.io,
    twitchChat: deps.twitchChat,
    payouts: deps.payouts,
  });
  registerDonationRoutes(app, deps.io);
  registerPromoRoutes(app);
  registerAdminRoutes(app, { twitchChat: deps.twitchChat, playback: deps.playback });
}
