import { useState } from 'react';
import {
  CHANNEL_DESCRIPTION_MAX_LEN,
  CHANNEL_LINKS_MAX,
  SOCIAL_PLATFORMS,
  type ChannelLink,
  type ChannelSettings,
  type SocialPlatform,
} from '@tmw/shared';
import { useI18n } from '@/i18n';
import { PLATFORM_LABEL } from '@/lib/social';
import { Icon } from '@/ui/icons';
import { Button, Card, Input, Select, Textarea } from '@/ui';

/** Настройки публичной страницы канала (что видит зритель на /c/:login): описание + соц-ссылки. */
export function ChannelPageSettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const [description, setDescription] = useState(settings.description ?? '');
  const [links, setLinks] = useState<ChannelLink[]>(settings.links);
  const updateLink = (i: number, patch: Partial<ChannelLink>) =>
    setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLink = (i: number) => setLinks((ls) => ls.filter((_, j) => j !== i));
  const addLink = () => setLinks((ls) => [...ls, { platform: 'link', url: '' }]);

  return (
    <Card>
      <label className="text-sm text-muted">
        <span>{t('dash.description')}</span>
        <Textarea
          className="mt-1"
          value={description}
          rows={2}
          maxLength={CHANNEL_DESCRIPTION_MAX_LEN}
          placeholder={t('dash.descriptionPlaceholder')}
          onChange={(e) => setDescription(e.target.value)}
        />
        <span className="mt-1 block text-right text-xs text-muted">
          {description.length}/{CHANNEL_DESCRIPTION_MAX_LEN}
        </span>
      </label>

      <div className="mt-3">
        <span className="text-sm text-muted">{t('dash.links')}</span>
        <div className="mt-1 flex flex-col gap-2">
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Select
                className="w-36 shrink-0"
                label={t('dash.linkPlatform')}
                value={link.platform}
                onChange={(p) => updateLink(i, { platform: p as SocialPlatform })}
                options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))}
              />
              <Input
                className="flex-1"
                type="url"
                inputMode="url"
                placeholder={t('dash.linkUrlPlaceholder')}
                value={link.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
              />
              <button
                type="button"
                aria-label={t('dash.removeLink')}
                onClick={() => removeLink(i)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-muted transition-colors hover:border-danger hover:text-danger"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
        {links.length < CHANNEL_LINKS_MAX && (
          <Button className="mt-2" onClick={addLink}>
            <Icon name="folder-plus" size={16} />
            {t('dash.addLink')}
          </Button>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          onClick={() =>
            onSave({
              description: description.trim() || null,
              links: links.filter((l) => l.url.trim()),
            })
          }
        >
          {t('dash.save')}
        </Button>
      </div>
    </Card>
  );
}
