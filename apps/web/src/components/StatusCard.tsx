import type { ReactNode } from 'react';
import { Card } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';

/** Центрированная карточка-статус: крупная иконка + произвольное содержимое. */
export function StatusCard({
  icon,
  iconSize = 44,
  tone = 'brand',
  gap = 4,
  children,
}: {
  icon: IconName;
  iconSize?: number;
  tone?: 'brand' | 'warn';
  gap?: 3 | 4;
  children: ReactNode;
}) {
  const color = tone === 'warn' ? 'text-warn' : 'text-twitch-light';
  const gapCls = gap === 3 ? 'gap-3' : 'gap-4';
  return (
    <Card className={`flex flex-col items-center ${gapCls} py-10 text-center`}>
      <Icon name={icon} size={iconSize} className={color} />
      {children}
    </Card>
  );
}
