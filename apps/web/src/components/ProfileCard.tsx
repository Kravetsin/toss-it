import type { SessionUser } from '@tmw/shared';
import { Avatar } from '@/ui';
import { CardEffect } from '@/components/CardEffect';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { nickProps } from '@/lib/nick';

/**
 * The user's identity shown AS their cosmetic card: equipped nick color/effect on the name plus
 * the card-effect particle swarm behind it. This is the one place a viewer can see their own card
 * without hunting through the leaderboard.
 */
export function ProfileCard({ user }: { user: SessionUser }) {
  const nick = nickProps({
    color: user.equipped?.nickColor,
    color2: user.equipped?.nickColor2,
    flow: user.equipped?.nickFlow,
    effect: user.equipped?.nickEffect,
  });
  return (
    <div className="relative overflow-hidden border border-border bg-surface-2 p-3 shadow-1">
      <CardEffect effect={user.equipped?.cardEffect} compact />
      <div className="relative flex items-center gap-3">
        <Avatar url={user.avatarUrl} name={user.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <span className={`truncate ${nick.className}`} style={nick.style}>
              {user.displayName}
            </span>
            <PlatformIcon userId={user.id} size={14} />
          </p>
          <p className="truncate text-xs text-muted">@{user.login}</p>
        </div>
      </div>
      <UserBadges isFounder={user.isFounder} variant="chips" className="relative mt-2" />
    </div>
  );
}
