import { useRef, useState, type DragEvent } from 'react';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/*';

/** Зона выбора файла: клик открывает диалог, поддержка drag-and-drop. */
export function FileDropzone({ onPick }: { onPick: (file: File | null) => void }) {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    onPick(e.dataTransfer.files[0] ?? null);
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-none border border-dashed px-5 py-8 text-center transition-colors ${
        dragOver ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-accent/60'
      }`}
    >
      <Icon name="folder-plus" size={40} className="text-accent" />
      <p className="label-mono text-muted">{t('channel.dropzone')}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
