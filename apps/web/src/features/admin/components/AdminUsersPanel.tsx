import { useCallback, useEffect, useState } from 'react';
import type { AdminUserCosmetic, AdminUserRow, AdminUsersSort } from '@tmw/shared';
import { ADMIN_USERS_PAGE_SIZE, cosmeticModule } from '@tmw/shared';
import { listAdminUsers, listUserCosmetics, setUserStardust } from '@/lib/api';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Badge, Card, Input, Tooltip } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { DustMark } from '@/components/DustMark';

/** Icon + number with an explanatory tooltip (native title is too discoverable-hostile). */
function StatChip({
  icon,
  value,
  hint,
  tone = 'text-muted',
}: {
  icon: IconName;
  value: number;
  hint: string;
  tone?: string;
}) {
  return (
    <Tooltip content={hint}>
      <span className={`flex items-center gap-0.5 ${tone}`}>
        <Icon name={icon} size={12} />
        {value}
      </span>
    </Tooltip>
  );
}

/** One user: collapsed shows the essentials; click to reveal the support details. */
function UserRow({
  u,
  lang,
  onSaved,
}: {
  u: AdminUserRow;
  lang: string;
  onSaved: (v: number) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  /** null = not fetched yet; loaded lazily so opening a card is the only thing that costs a query. */
  const [cosmetics, setCosmetics] = useState<AdminUserCosmetic[] | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && cosmetics == null && u.ownedCosmetics > 0) {
      void listUserCosmetics(u.id)
        .then(setCosmetics)
        .catch(() => {});
    }
  };

  return (
    <li className="flex flex-col gap-1.5 border-b border-border pb-2 last:border-0 last:pb-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
        className="flex cursor-pointer items-center gap-2"
      >
        <Icon
          name="chevron-down"
          size={14}
          className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        {u.avatarUrl ? (
          <img src={u.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full" />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs">
            {u.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <b className="truncate">{u.displayName}</b>
        <span className="truncate text-muted">@{u.login}</span>
        {u.isLive && (
          <Tooltip content={t('live.badge')}>
            <span className="flex shrink-0 items-center gap-1 text-xs text-ok">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
              LIVE
            </span>
          </Tooltip>
        )}
        <span className="ml-auto shrink-0 text-xs text-faint">
          {new Date(u.createdAt).toLocaleDateString(lang)}
        </span>
        {/* Stop propagation so editing the balance doesn't toggle the row. */}
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <DustCell user={u} onSaved={onSaved} />
        </span>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-8 text-xs">
          {u.identities.map((p) => (
            <PlatformIcon key={p} userId={`${p}:x`} size={13} />
          ))}
          <UserBadges isFounder={u.isFounder} variant="icons" />
          {u.hasChannel && (
            <Tooltip content={t('admin.hasChannel')}>
              <span className="flex items-center">
                <Icon name="monitor" size={13} className="text-muted" />
              </span>
            </Tooltip>
          )}
          <span className="flex items-center gap-2 tabular-nums">
            <StatChip icon="check" value={u.accepted} hint={t('admin.accepted')} tone="text-ok" />
            <StatChip
              icon="close"
              value={u.rejected}
              hint={t('admin.rejected')}
              tone="text-danger"
            />
            <StatChip icon="shield" value={u.whitelistedIn} hint={t('admin.whitelistedIn')} />
            <StatChip icon="user-x" value={u.bannedIn} hint={t('admin.bannedIn')} />
          </span>
          {u.pendingDust > 0 && <Badge>{t('admin.pendingDust', { n: u.pendingDust })}</Badge>}
          {/* Names, not a count: finding one user's purchases by opening every cosmetic in turn is
              what this replaces. Plain text — refunds still live in the cosmetics panel. */}
          {u.ownedCosmetics > 0 && (
            <span className="w-full text-muted">
              {t('admin.cosmeticsCount', { n: u.ownedCosmetics })}:{' '}
              {cosmetics == null ? (
                t('common.loading')
              ) : (
                <span className="text-text">
                  {cosmetics
                    .map((c) => {
                      const mod = cosmeticModule(c.itemId);
                      const name = mod ? t(mod.labels.name) : c.itemId;
                      return c.paidDust > 0 ? `${name} (${c.paidDust})` : name;
                    })
                    .join(', ')}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/** Inline stardust editor: click the value, Enter/blur saves, Escape cancels. */
function DustCell({ user, onSaved }: { user: AdminUserRow; onSaved: (v: number) => void }) {
  const { t } = useI18n();
  const act = useApiAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(user.stardust));

  const save = () => {
    setEditing(false);
    const next = Math.round(Number(value));
    if (!Number.isFinite(next) || next < 0 || next === user.stardust) return;
    void act(
      async () => {
        const res = await setUserStardust(user.id, next);
        onSaved(res.stardust);
      },
      { success: t('admin.dustSaved') },
    );
  };

  if (!editing) {
    return (
      <Tooltip content={t('admin.dustEditHint')} align="end" focusable={false}>
        <button
          type="button"
          onClick={() => {
            setValue(String(user.stardust));
            setEditing(true);
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent px-1.5 py-0.5 tabular-nums text-text transition-colors hover:border-border hover:text-accent"
        >
          <DustMark size={13} className="text-accent" />
          {user.stardust}
        </button>
      </Tooltip>
    );
  }
  return (
    <Input
      autoFocus
      type="number"
      min={0}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-24 py-0.5 text-sm"
    />
  );
}

/** Page numbers to render: the ends, plus a window around the current page. null = a gap. */
function pageWindow(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const wanted = [1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages);
  const list = [...new Set(wanted)].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

const PAGE_BTN =
  'rounded-none px-2.5 py-1 label-mono transition-colors duration-200 ease-out disabled:opacity-40';

/** Support table: users by page, balances editable inline. */
export function AdminUsersPanel() {
  const { t, lang } = useI18n();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<AdminUsersSort>('created');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);

  // A new query or order re-numbers the whole list; staying on page 7 of the old one means nothing.
  useEffect(() => setPage(1), [debounced, sort]);

  const refresh = useCallback(() => {
    void listAdminUsers(debounced, sort, page)
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
        setLoaded(true);
      })
      .catch(() => {});
  }, [debounced, sort, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pages = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));

  const patchRow = (id: string, stardust: number) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, stardust } : r)));

  return (
    <div className="mt-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display">{t('admin.usersTitle')}</h2>
        <span className="label-mono text-muted tabular-nums">{total}</span>
        <div className="ml-auto flex gap-1 border border-border bg-surface-2 p-1">
          {(['created', 'stardust'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={`rounded-none px-2.5 py-1 label-mono transition-colors duration-200 ease-out ${
                sort === s ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
              }`}
            >
              {t(s === 'created' ? 'admin.sortCreated' : 'admin.sortStardust')}
            </button>
          ))}
        </div>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('admin.usersSearch')}
          className="w-56 text-sm"
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{loaded ? t('admin.usersEmpty') : t('common.loading')}</p>
      ) : (
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            {rows.map((u) => (
              <UserRow key={u.id} u={u} lang={lang} onSaved={(v) => patchRow(u.id, v)} />
            ))}
          </ul>
        </Card>
      )}
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1 self-center">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label={t('admin.pagePrev')}
            className={`${PAGE_BTN} text-muted hover:text-text`}
          >
            <Icon name="chevron-left" size={14} />
          </button>
          {pageWindow(page, pages).map((p, i) =>
            p == null ? (
              <span key={`gap-${i}`} className="px-1 text-faint">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => setPage(p)}
                className={`${PAGE_BTN} tabular-nums ${
                  p === page ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={page === pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            aria-label={t('admin.pageNext')}
            className={`${PAGE_BTN} text-muted hover:text-text`}
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
