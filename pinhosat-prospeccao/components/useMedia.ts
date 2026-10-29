'use client';
import { useEffect, useState } from 'react';

/** true quando a largura da janela é menor que `px` (padrão: 768 = celular / tablet em pé). */
export function useCelular(px = 768): boolean {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px - 1}px)`);
    const atualizar = () => setCelular(mq.matches);
    atualizar();
    mq.addEventListener('change', atualizar);
    return () => mq.removeEventListener('change', atualizar);
  }, [px]);
  return celular;
}
