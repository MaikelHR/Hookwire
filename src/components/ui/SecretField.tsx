import { useState } from 'react';
import { CopyButton } from './CopyButton';
import { IconButton } from './Button';

export function SecretField({ secret }: { secret: string }) {
  const [show, setShow] = useState(false);
  const masked = secret.slice(0, 6) + '••••••••••••••••••••' + secret.slice(-4);
  return (
    <div className="flex items-center gap-2 bg-inset border border-line rounded-ctl px-3 py-2 font-mono text-[11.5px] text-dim">
      <span className="flex-1 tracking-[0.08em] overflow-hidden text-ellipsis whitespace-nowrap">
        {show ? secret : masked}
      </span>
      <IconButton onClick={() => setShow(!show)}>{show ? 'hide' : 'show'}</IconButton>
      <CopyButton text={secret} />
    </div>
  );
}
