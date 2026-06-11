import { useState } from 'react';
import { IconButton } from './Button';

export function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? 'copied ✓' : label}
    </IconButton>
  );
}
