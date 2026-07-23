import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LEVEL_GLOW_FROM, levelThreshold, levelTier, MAX_LEVEL, toRoman } from '@tmw/shared';
import { logout } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { useShop } from '@/providers/ShopProvider';
import { useApiAction } from '@/hooks/useApiAction';
import { registerStardustWallet } from '@/lib/stardustFx';
import { nickProps } from '@/lib/nick';
import { Avatar, Tooltip } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';
import { DustMark } from '@/components/DustMark';
import { NewDotGroup } from '@/components/NewDot';
import { CardEffect } from '@/components/CardEffect';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';

function Row({
  icon,
  label,
  to,
  onClick,
  danger = false,
  trailing,
}: {
  icon: IconName;
  label: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  const cls = `flex items-center gap-2.5 px-2.5 py-2 text-sm text-muted outline-none transition-colors duration-[var(--dur-fast)] ${
    danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-surface-2 hover:text-text'
  }`;
  const inner = (
    <>
      <Icon name={icon} size={16} className="shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
      {trailing}
    </>
  );
  return to ? (
    <Link to={to} onClick={onClick} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${cls} w-full cursor-pointer text-left`}>
      {inner}
    </button>
  );
}

/**
 * Viewer-page account control (top-right): the FULL cosmetic card is always visible — the same
 * look the streamer sees in chat (level rail + numeral, badge, nick color/effect, card particles)
 * plus avatar, login platform and stardust — so a viewer never has to click to see their card.
 * Clicking opens the actions menu (shop, dashboard, logout). Also the stardust fly target.
 */
export function ProfileMenu({
  viewerLevel = 0,
  viewerXp = 0,
}: {
  viewerLevel?: number;
  viewerXp?: number;
}) {
  const { me, refresh } = useMe();
  const { t } = useI18n();
  const { openShop } = useShop();
  const act = useApiAction();
  const navigate = useNavigate();
  const user = me?.user;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (!user) return;
    registerStardustWallet({
      rect: () => btnRef.current?.getBoundingClientRect() ?? null,
      bump: () => {
        setPop(true);
        window.setTimeout(() => setPop(false), 400);
      },
    });
    return () => registerStardustWallet(null);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (btnRef.current?.contains(tgt) || popRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const onLogout = () =>
    void act(logout, {
      after: async () => {
        await refresh();
        navigate('/');
      },
    });

  const nick = nickProps({
    color: user.equipped?.nickColor,
    color2: user.equipped?.nickColor2,
    flow: user.equipped?.nickFlow,
    effect: user.equipped?.nickEffect,
  });
  const tier = viewerLevel ? levelTier(viewerLevel) : null;
  const levelGlow = !!tier && viewerLevel >= LEVEL_GLOW_FROM;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('nav.profile')}
        aria-expanded={open}
        className={`relative flex items-center gap-2.5 overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-2 py-1 pl-2.5 pr-3 text-left outline-none transition-[border-color,transform] duration-200 hover:border-accent focus-visible:[box-shadow:var(--shadow-focus)] ${pop ? 'scale-105' : ''}`}
      >
        <CardEffect effect={user.equipped?.cardEffect} compact />
        {tier && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 z-[1] w-[3px] ${tier.iris ? 'lvl-iris' : ''}`}
            style={{
              background: tier.color,
              boxShadow: levelGlow ? `0 0 7px ${tier.color}` : undefined,
            }}
          />
        )}
        <Avatar url={user.avatarUrl} name={user.displayName} size={30} />
        <span className="relative flex min-w-0 items-center gap-1.5">
          {tier && (
            // Hover the rank to see XP progress — a goal for the mostly-invisible per-channel climb.
            // focusable={false}: the whole card is already a <button>, so the tooltip must not add a
            // second focus target inside it (invalid nested interactive).
            <Tooltip
              focusable={false}
              content={
                viewerLevel >= MAX_LEVEL
                  ? t('level.xpMax', { xp: viewerXp })
                  : t('level.xpNext', {
                      lvl: viewerLevel + 1,
                      current: viewerXp,
                      next: levelThreshold(viewerLevel + 1),
                    })
              }
            >
              <span
                className={`shrink-0 text-xs font-bold ${tier.iris ? 'lvl-iris' : ''}`}
                style={{
                  color: tier.color,
                  textShadow: levelGlow ? `0 0 6px ${tier.color}` : undefined,
                }}
              >
                {toRoman(viewerLevel)}
              </span>
            </Tooltip>
          )}
          <UserBadges isFounder={user.isFounder} variant="icons" />
          <span
            className={`truncate text-sm font-semibold text-text ${nick.className}`}
            style={nick.style}
          >
            {user.displayName}
          </span>
          <PlatformIcon userId={user.id} size={13} />
        </span>
        <span className="relative ml-1 flex shrink-0 items-center gap-1 label-mono text-accent">
          <DustMark size={14} />
          <span className="tabular-nums">{user.stardust}</span>
        </span>
      </button>
      {/* Outside the button, not in it: the card clips its own overflow for the particle layer, so a
          corner mark placed inside would be cut off. The shop is one click deeper, in the menu. */}
      <NewDotGroup corner />

      {open && (
        <div
          ref={popRef}
          role="menu"
          className="glass glass-strong absolute right-0 z-50 mt-2 w-56 border border-glass-border p-1 shadow-3"
        >
          <Row
            icon="sparkles"
            label={t('wallet.shopLabel')}
            trailing={<NewDotGroup />}
            onClick={() => {
              setOpen(false);
              openShop();
            }}
          />
          {me.channel && (
            <Row
              to="/dashboard"
              icon="shield"
              label={t('nav.dashboard')}
              onClick={() => setOpen(false)}
            />
          )}
          {me.channel && (
            <Row
              to="/dashboard/settings"
              icon="settings"
              label={t('nav.settings')}
              onClick={() => setOpen(false)}
            />
          )}
          <Row to="/promo" icon="gift" label={t('promo.haveCode')} onClick={() => setOpen(false)} />
          <Row onClick={onLogout} icon="log-out" label={t('home.logout')} danger />
        </div>
      )}
    </div>
  );
}
