import { useCallback, useEffect, useState } from 'react';
import type { ListedUser } from '@tmw/shared';
import { createModInvite, getModerators, removeModerator } from '@/lib/api';
import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Icon } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';
import { ModeratorList } from './ModeratorList';

/** Блок «Команда» (owner-only): сгенерировать инвайт-ссылку и управлять модераторами. */
export function TeamCard({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { copiedKey, copy } = useClipboard();
  const [mods, setMods] = useState<ListedUser[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getModerators(channelId)
      .then(setMods)
      .catch(() => {});
  }, [channelId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const invite = () =>
    void (async () => {
      try {
        const { token } = await createModInvite(channelId);
        setInviteUrl(`${window.location.origin}/mod-invite/${token}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'danger');
      }
    })();

  const remove = (userId: string) =>
    void (async () => {
      try {
        await removeModerator(channelId, userId);
        refresh();
        toast(t('toast.removed'));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'danger');
      }
    })();

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2>{t('dash.team')}</h2>
          <p className="text-sm text-muted">{t('dash.teamHint')}</p>
        </div>
        <Button variant="primary" className="shrink-0" onClick={invite}>
          <Icon name="send" size={16} />
          {t('dash.invite')}
        </Button>
      </div>
      {inviteUrl && (
        <div className="mt-3">
          <p className="mb-1 text-sm text-muted">{t('dash.inviteHint')}</p>
          <CopyableLinkBox
            value={inviteUrl}
            size="sm"
            copied={copiedKey === 'invite'}
            onCopy={() => copy(inviteUrl, 'invite')}
          />
        </div>
      )}
      <div className="mt-4">
        <ModeratorList mods={mods} onRemove={remove} />
      </div>
    </Card>
  );
}
