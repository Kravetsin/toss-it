import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index';
import { appMeta } from '../db/schema';
import { registerAdminRoutes } from './admin';
import { registerAuthRoutes } from './auth';
import { registerChannelRoutes } from './channels';
import { registerDashboardRoutes } from './dashboard';
import { registerMediaRoutes, type MediaRoutesDeps } from './media';
import { registerPromoRoutes } from './promo';

export function registerRoutes(app: FastifyInstance, deps: MediaRoutesDeps): void {
  /** Лёгкий пинг для аптайм-мониторинга (не трогает БД). */
  app.get('/api/ping', async () => ({ ok: true }));

  app.get('/api/health', async () => {
    const row = await db.select().from(appMeta).where(eq(appMeta.key, 'health_checks')).get();
    const count = row ? Number(row.value) + 1 : 1;
    await db
      .insert(appMeta)
      .values({ key: 'health_checks', value: String(count) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: String(count) } });
    return { ok: true, healthChecks: count, time: new Date().toISOString() };
  });

  registerAuthRoutes(app);
  registerChannelRoutes(app);
  registerMediaRoutes(app, deps);
  registerDashboardRoutes(app, { playback: deps.playback, io: deps.io });
  registerPromoRoutes(app);
  registerAdminRoutes(app);
}
