import type { HTMLAttributes, ReactNode, TdHTMLAttributes } from 'react';

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="bg-card border border-line rounded-card overflow-hidden">{children}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full border-collapse text-[12.5px]">{children}</table>;
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="text-left font-mono font-medium text-[10px] tracking-[0.09em] uppercase text-faint px-3.5 py-[9px] border-b border-line bg-panel whitespace-nowrap">
      {children}
    </th>
  );
}

/* Las filas deben llevar className="group …" para que la última pierda el borde */
export function Tr({ className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`group ${className}`} {...rest} />;
}

type TdVariant = 'default' | 'mono' | 'dim' | 'num';

const TD_VARIANT: Record<TdVariant, string> = {
  default: '',
  mono: 'font-mono text-[11.5px] text-dim',
  dim: 'text-faint font-mono text-[11px]',
  num: 'tabular-nums font-mono text-[11.5px]',
};

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  variant?: TdVariant;
}

export function Td({ variant = 'default', className = '', ...rest }: TdProps) {
  return (
    <td
      className={`px-3.5 py-3 border-b border-line group-last:border-b-0 align-middle whitespace-nowrap ${TD_VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}
