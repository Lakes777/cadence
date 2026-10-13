import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './cliente';
import { assinarSessao, estadoDaSessao, type EstadoDaSessao } from './sessao';
import { tempoReal, type Ouvinte } from './tempo-real';

/** Quem está logado nesta aba (e se a sessão ainda está sendo recuperada) */
export function useSessao(): EstadoDaSessao {
  return useSyncExternalStore(assinarSessao, estadoDaSessao);
}

/** Recebe cada evento do tempo real enquanto a tela estiver aberta */
export function useTempoReal(ouvinte: Ouvinte): void {
  const atual = useRef(ouvinte);
  useEffect(() => {
    atual.current = ouvinte;
  });
  useEffect(() => tempoReal().ouvir((evento) => atual.current(evento)), []);
}

/** Acompanha um negócio (pelo slug) enquanto a tela estiver aberta */
export function useAssinatura(slug: string | undefined): void {
  useEffect(() => (slug ? tempoReal().assinar(slug) : undefined), [slug]);
}

export interface InfoDaDemo {
  demo: boolean;
  /** O slug do negócio de exemplo (só na demonstração) */
  negocio: string | null;
}

let demo: Promise<InfoDaDemo> | null = null;

/** GET /demo, uma vez por aba: se esta instância é a demonstração (botões de visitante, faixa) */
export function useDemo(): InfoDaDemo | null {
  const [info, setInfo] = useState<InfoDaDemo | null>(null);
  useEffect(() => {
    let vivo = true;
    demo ??= api<InfoDaDemo>('/demo').catch(() => ({
      demo: false,
      negocio: null,
    }));
    void demo.then((i) => vivo && setInfo(i));
    return () => {
      vivo = false;
    };
  }, []);
  return info;
}

/** Só para os testes */
export function esquecerDemoParaTeste(): void {
  demo = null;
}
