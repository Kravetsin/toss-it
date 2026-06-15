import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { MeResponse, ModInviteInfo } from '@tmw/shared';
import { acceptModInvite, getMe, getModInvite } from '../api';
import { Icon } from '../icons';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { Button, Card, Loader } from '../ui';

/** Страница принятия инвайта в модераторы: /mod-invite/:token */
export function ModInvitePage() {
  const { t } = useI18n();
  const toast = useToast();
  const { token = '' } = useParams();
  const [info, setInfo] = useState<ModInviteInfo | null | 'loading' | 'invalid'>('loading');
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    void getModInvite(token)
      .then(setInfo)
      .catch(() => setInfo('invalid'));
    void getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, [token]);

  const returnTo = `/mod-invite/${encodeURIComponent(token)}`;

  async function accept() {
    setAccepting(true);
    try {
      const { channelId } = await acceptModInvite(token);
      try {
        localStorage.setItem('tmw_dash_channel', channelId);
      } catch {
        /* приватный режим */
      }
      window.location.href = '/dashboard';
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
      setAccepting(false);
    }
  }

  if (info === 'loading' || me === 'loading') {
    return (
      <Shell>
        <Loader label={t('common.loading')} />
      </Shell>
    );
  }

  if (info === 'invalid' || !info) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Icon name="square-alert" size={40} className="text-warn" />
          <p className="text-muted">{t('mod.inviteInvalid')}</p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <Icon name="shield" size={44} className="text-twitch-light" />
        <p className="text-lg">{t('mod.inviteTitle', { channel: info.channelDisplayName })}</p>
        {me?.user ? (
          <Button variant="primary" disabled={accepting} onClick={() => void accept()}>
            <Icon name="check" size={16} />
            {t('mod.inviteAccept')}
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted">{t('mod.inviteLogin')}</p>
            <a href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
              <Button variant="primary">{t('common.loginTwitch')}</Button>
            </a>
            <a href={`/api/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`}>
              <Button>{t('common.loginGoogle')}</Button>
            </a>
          </div>
        )}
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-xl px-4 py-10">{children}</main>;
}
