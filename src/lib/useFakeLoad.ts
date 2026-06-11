import { useEffect, useState } from 'react';

/* Skeleton de primera carga (~550-650ms) en el primer mount de cada vista */
export function useFakeLoad(ms = 650): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}
