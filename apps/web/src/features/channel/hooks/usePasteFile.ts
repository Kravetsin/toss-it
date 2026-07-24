import { useEffect } from 'react';
import { ACCEPT } from '../components/FileDropzone';

const ACCEPTED_TYPES = ACCEPT.split(',');

function isAccepted(type: string): boolean {
  return ACCEPTED_TYPES.some((a) => (a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : a === type));
}

/**
 * Ctrl/Cmd+V anywhere on the page drops a clipboard image/video/audio into the compose form.
 * Window-level so the viewer never has to focus a field first. Only intercepts when the clipboard
 * actually carries a file — a plain text paste falls through to the caption textarea untouched.
 */
export function usePasteFile(onPick: (file: File) => void) {
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file && isAccepted(file.type)) {
          e.preventDefault();
          onPick(file);
          return;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPick]);
}
