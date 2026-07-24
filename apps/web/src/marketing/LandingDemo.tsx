import { useState, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { ScrollFlow } from './ScrollFlow/ScrollFlow';
import { ProductDemo } from './ProductDemo';

/**
 * Landing "how it works": the compact abstract flow (ScrollFlow) shows by default; a tab flips to
 * the interactive, hands-on send demo for visitors who want to poke at the real form.
 */
export function LandingDemo() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'how' | 'try'>('how');
  return (
    <div className="mt-2">
      <div className="flex justify-center">
        <div className="inline-flex gap-1 border border-border p-1">
          <Tab active={tab === 'how'} icon="chart" onClick={() => setTab('how')}>
            {t('flow.title')}
          </Tab>
          <Tab active={tab === 'try'} icon="play" onClick={() => setTab('try')}>
            {t('demo.tabTry')}
          </Tab>
        </div>
      </div>
      {tab === 'how' ? <ScrollFlow /> : <ProductDemo />}
    </div>
  );
}

function Tab({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: IconName;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 label-mono text-xs transition-colors ${
        active ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
      }`}
    >
      <Icon name={icon} size={13} />
      {children}
    </button>
  );
}
