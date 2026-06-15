import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ListedUser, MeResponse } from '@tmw/shared';
import {
  OVERLAY_BASE_URL,
  createChannel,
  createModInvite,
  getMe,
  getModerators,
  logout,
  removeModerator,
  rotateOverlayToken,
} from '../api';
import { useConfirm } from '../confirm';
import { Icon } from '../icons';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { Avatar, Button, Card, Loader } from '../ui';

export function HomePage() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copy(key: string, value: string) {
    void navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  }

  const refresh = () =>
    getMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
  }, []);

  async function act(fn: () => Promise<unknown>, success?: string) {
    try {
      await fn();
      await refresh();
      if (success) toast(success);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
    }
  }

  if (loading)
    return (
      <Shell>
        <Loader label={t('common.loading')} />
      </Shell>
    );

  if (!me?.user) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-6 py-16 text-center">
          <img
            src="/favicon.svg"
            alt="Tossit"
            width={72}
            height={72}
            className="[image-rendering:pixelated]"
          />
          <h1 className="text-4xl font-extrabold">
            Toss<span className="text-twitch-light">it</span>
          </h1>
          <p className="max-w-md text-muted">{t('home.tagline')}</p>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <a href="/api/auth/login?returnTo=/">
                <Button variant="primary" className="px-8 py-3 text-base">
                  <Icon name="twitch" size={18} />
                  {t('common.loginTwitch')}
                </Button>
              </a>
              <a
                href="/api/auth/login?returnTo=/&switch=1"
                title={t('home.loginOther')}
                aria-label={t('home.loginOther')}
              >
                <Button variant="secondary" className="px-3 py-3 text-base">
                  <Icon name="swap" size={18} />
                </Button>
              </a>
            </div>
            <a href="/api/auth/google/login?returnTo=/">
              <Button variant="primary" className="px-8 py-3 text-base">
                <Icon name="google" size={18} />
                {t('common.loginGoogle')}
              </Button>
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  const overlayUrl = me.channel ? `${OVERLAY_BASE_URL}/?token=${me.channel.overlayToken}` : null;
  const viewerUrl = `${window.location.origin}/c/${me.user.login}`;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar url={me.user.avatarUrl} name={me.user.displayName} size={44} />
          <div>
            <p className="font-semibold">{me.user.displayName}</p>
            <p className="text-xs text-muted">{me.user.login}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/promo" className="text-sm text-muted hover:text-text">
            {t('promo.haveCode')}
          </Link>
          {me.user.isAdmin && (
            <Link to="/admin" className="text-sm text-muted hover:text-text">
              {t('admin.title')}
            </Link>
          )}
          <Button variant="ghost" onClick={() => void act(logout)}>
            {t('home.logout')}
          </Button>
        </div>
      </div>

      {!me.channel ? (
        <Card className="mt-6 flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-muted">{t('home.noChannel')}</p>
          <Button variant="primary" onClick={() => void act(createChannel, t('toast.channelCreated'))}>
            <Icon name="sparkles" size={16} />
            {t('home.createChannel')}
          </Button>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 text-lg font-bold">{t('home.manage')}</h2>
            <div className="flex flex-wrap gap-2">
              <Link to="/dashboard">
                <Button variant="primary">
                  <Icon name="shield" size={16} />
                  {t('home.dashboardBtn')}
                </Button>
              </Link>
              <Link to={`/c/${me.user.login}`}>
                <Button>
                  <Icon name="eye" size={16} />
                  {t('home.viewerPageBtn')}
                </Button>
              </Link>
            </div>
            <p className="mb-2 mt-4 text-sm text-muted">{t('home.viewerLinkLabel')}</p>
            <div className="flex items-center gap-2">
              <a
                href={viewerUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 break-all rounded-none border-2 border-line bg-surface-2 px-3 py-2 text-sm text-twitch-light hover:underline"
              >
                {viewerUrl}
              </a>
              <Button className="shrink-0" onClick={() => copy('viewer', viewerUrl)}>
                <Icon name={copiedKey === 'viewer' ? 'check' : 'copy'} size={16} />
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-lg font-bold">{t('home.overlayTitle')}</h2>
            <p className="mb-3 flex items-start gap-2 text-sm text-muted">
              <Icon name="square-alert" size={16} className="mt-0.5 shrink-0 text-warn" />
              <span>{t('home.overlayDesc')}</span>
            </p>
            <code className="block break-all rounded-none border-2 border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {overlayUrl}
            </code>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => copy('overlay', overlayUrl!)}>
                <Icon name={copiedKey === 'overlay' ? 'check' : 'copy'} size={16} />
                {copiedKey === 'overlay' ? t('home.copied') : t('home.copy')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void (async () => {
                    if (
                      await confirm({
                        message: t('home.rotateConfirm'),
                        confirmLabel: t('home.rotate'),
                        danger: true,
                      })
                    ) {
                      void act(rotateOverlayToken, t('toast.tokenReissued'));
                    }
                  })();
                }}
              >
                <Icon name="reload" size={16} />
                {t('home.rotate')}
              </Button>
            </div>
          </Card>

          <TeamCard channelId={me.channel.id} />
        </div>
      )}
    </Shell>
  );
}

/** Блок «Команда» (owner-only): сгенерировать инвайт-ссылку и управлять модераторами. */
function TeamCard({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [mods, setMods] = useState<ListedUser[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    void getModerators(channelId).then(setMods).catch(() => {});
  }, [channelId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const invite = () =>
    void (async () => {
      try {
        const { token } = await createModInvite(channelId);
        setInviteUrl(`${window.location.origin}/mod-invite/${token}`);
        setCopied(false);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'danger');
      }
    })();

  const copy = () => {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <h2 className="font-bold">{t('dash.team')}</h2>
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
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all border-2 border-line bg-surface-2 px-3 py-2 text-xs text-twitch-light">
              {inviteUrl}
            </code>
            <Button className="shrink-0" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </Button>
          </div>
        </div>
      )}
      <div className="mt-4">
        {mods.length === 0 ? (
          <p className="text-sm text-muted">{t('dash.noModerators')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {mods.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-muted">
                <Icon name="shield" size={15} className="text-twitch-light" />
                <b className="text-text">{m.displayName}</b>
                <span className="text-xs">{m.login}</span>
                <button
                  onClick={() => remove(m.userId)}
                  className="ml-auto cursor-pointer hover:text-danger"
                  title={t('dash.removeUser')}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">{children}</main>;
}
