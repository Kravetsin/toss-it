import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { makeChannel, makeSubmission, youtubePatch } from '../test/fakes';
import { sweep } from './cleanup';
import { config } from './config';
import { db } from './db/index';
import { submissions } from './db/schema';
import type { Payouts } from './media/payout';
import type { Storage } from './storage';

/**
 * What a viewer wrote is as ephemeral as what they uploaded: the dashboard no longer shows it back,
 * so the sweep must not leave message bodies sitting in the database forever.
 */
describe('cleanup sweep', () => {
  const storage: Storage = { putFile: async () => {}, delete: async () => {}, root: '' };
  const payouts: Payouts = { settle: async () => {} };
  const log = { info() {}, warn() {}, error() {} } as unknown as FastifyBaseLogger;
  const run = () => sweep(storage, log, [], payouts);

  const past = new Date(Date.now() - config.cleanup.terminalRetentionMs - 60_000);
  const textOf = async (id: string) =>
    (
      await db
        .select({ text: submissions.text })
        .from(submissions)
        .where(eq(submissions.id, id))
        .get()
    )?.text;

  it('clears the message body of a shown submission past retention', async () => {
    const channelId = await makeChannel();
    const sub = await makeSubmission(channelId, {
      status: 'played',
      text: 'привет стриму',
      createdAt: past,
      updatedAt: past,
    });

    await run();

    expect(await textOf(sub.id)).toBeNull();
  });

  // The old sweep only ever touched rows with a file, so these two kept their text forever.
  it('clears bodies of file-less submissions too', async () => {
    const channelId = await makeChannel();
    const textPost = await makeSubmission(channelId, {
      kind: 'text',
      mime: 'text/plain',
      filePath: null,
      status: 'played',
      text: 'текстовая отправка',
      createdAt: past,
      updatedAt: past,
    });
    const song = await makeSubmission(channelId, {
      ...youtubePatch(),
      status: 'rejected',
      text: 'название трека',
      createdAt: past,
      updatedAt: past,
    });

    await run();

    expect(await textOf(textPost.id)).toBeNull();
    expect(await textOf(song.id)).toBeNull();
  });

  it('keeps the body while the submission can still play or replay', async () => {
    const channelId = await makeChannel();
    const queued = await makeSubmission(channelId, { text: 'ещё в очереди' });
    const justPlayed = await makeSubmission(channelId, { status: 'played', text: 'только что' });

    await run();

    expect(await textOf(queued.id)).toBe('ещё в очереди');
    expect(await textOf(justPlayed.id)).toBe('только что');
  });
});
