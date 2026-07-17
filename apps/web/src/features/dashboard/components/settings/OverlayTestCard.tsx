import { useState } from 'react';
import { sendTestPost } from '@/lib/api';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Button, Card, Select } from '@/ui';
import { Icon } from '@/ui/icons';
import { buildTestPayload, TEST_POST_KINDS, type TestPostKind } from '../../lib/testContent';

const KIND_LABEL: Record<TestPostKind, string> = {
  text: 'dash.testKindText',
  image: 'dash.testKindImage',
  video: 'dash.testKindVideo',
  audio: 'dash.testKindAudio',
  youtube: 'dash.testKindYoutube',
  gif: 'dash.testKindGif',
};

/**
 * Fires a prepared post at the real overlay: same upload path as a viewer send, so the channel's
 * own settings, TTS and queue apply. Lives on the overlay tab because it exists to be used while
 * the sliders below it are being tuned.
 */
export function OverlayTestCard({ login }: { login: string }) {
  const { t } = useI18n();
  const act = useApiAction();
  const [kind, setKind] = useState<TestPostKind>('text');
  const [busy, setBusy] = useState(false);

  const send = () =>
    void (async () => {
      setBusy(true);
      try {
        await act(async () => sendTestPost(login, await buildTestPayload(kind)), {
          success: t('toast.testSent'),
        });
      } finally {
        setBusy(false);
      }
    })();

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 label-mono text-text">
          <Icon name="send" size={16} className="text-accent" />
          {t('dash.overlayTest')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('dash.overlayTestNote')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="min-w-[12rem] flex-1"
          label={t('dash.overlayTestKind')}
          value={kind}
          onChange={(v) => setKind(v as TestPostKind)}
          options={TEST_POST_KINDS.map((k) => ({ value: k, label: t(KIND_LABEL[k]) }))}
        />
        <Button variant="primary" disabled={busy} onClick={send}>
          <Icon name="send" size={16} />
          {t('dash.overlayTestSend')}
        </Button>
      </div>
    </Card>
  );
}
