import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary';
  size?: 'default' | 'small';
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-ctl border font-mono font-medium disabled:opacity-50 disabled:cursor-default';

export function Button({ variant = 'default', size = 'default', className = '', ...rest }: ButtonProps) {
  const variantCls =
    variant === 'primary'
      ? 'bg-accent border-accent text-[#08120c] font-bold hover:brightness-[1.08]'
      : 'bg-card border-line-strong text-text hover:bg-hov';
  const sizeCls = size === 'small' ? 'px-2.5 py-[5px] text-[11px]' : 'px-3.5 py-2 text-xs';
  return <button className={`${BASE} ${variantCls} ${sizeCls} ${className}`} {...rest} />;
}

export function IconButton({ className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        'bg-transparent border border-line rounded-ctl text-dim font-mono text-[10.5px] px-2 py-1 hover:text-text hover:border-line-strong ' +
        className
      }
      {...rest}
    />
  );
}
