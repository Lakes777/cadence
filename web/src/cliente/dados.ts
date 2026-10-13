import { useCallback, useEffect, useRef, useState } from 'react';
import type { Disponibilidade, HorarioLivre } from '../api/tipos';
import { hojeNoFuso, somarDias } from '../comum/formatos';

/** Até quantos dias à frente a agenda abre (JANELA_DIAS da API) */
export const JANELA_DIAS = 60;

/** Horário que existiria sem as reservas e que ninguém pode mais atender (sem dizer quem) */
export type HorarioOcupado = Disponibilidade['ocupados'][number];

/** GET /negocios/:slug/disponibilidade, com os ocupados (fase 8) */
export type DisponibilidadeDoDia = Disponibilidade;

export type ItemDaGrade =
  | { tipo: 'livre'; hora: string; inicio: string; horario: HorarioLivre }
  | { tipo: 'ocupado'; hora: string; inicio: string };

/** Livres e ocupados juntos, na ordem do dia */
export function montarGrade(disp: DisponibilidadeDoDia): ItemDaGrade[] {
  const itens: ItemDaGrade[] = [
    ...disp.horarios.map((h) => ({
      tipo: 'livre' as const,
      hora: h.hora,
      inicio: h.inicio,
      horario: h,
    })),
    ...disp.ocupados.map((h) => ({
      tipo: 'ocupado' as const,
      hora: h.hora,
      inicio: h.inicio,
    })),
  ];
  return itens.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}

/** Os dias que a agenda oferece, de hoje (no fuso do negócio) até o último da janela */
export function diasDaAgenda(fuso: string, agora = new Date()): string[] {
  const hoje = hojeNoFuso(fuso, agora);
  return Array.from({ length: JANELA_DIAS + 1 }, (_, i) => somarDias(hoje, i));
}

export interface Carga<T> {
  dados: T | undefined;
  erro: unknown;
  carregando: boolean;
  /** Busca de novo sem apagar o que está na tela */
  recarregar: () => void;
  /** Troca os dados na tela (ex.: um evento do tempo real) */
  mudar: (f: (atual: T) => T) => void;
}

/**
 * Busca enquanto `chave` não muda (null = não buscar). Só mostra o que pertence à chave atual;
 * uma busca nova cancela a anterior. `aoChegar` recebe o novo e o que estava na tela.
 */
export function useCarga<T>(
  chave: string | null,
  buscar: (sinal: AbortSignal) => Promise<T>,
  aoChegar?: (novo: T, anterior: T | undefined) => void,
): Carga<T> {
  const [estado, setEstado] = useState<{
    chave: string | null;
    dados?: T;
    erro?: unknown;
    carregando: boolean;
  }>({ chave: null, carregando: false });
  const [versao, setVersao] = useState(0);
  const funcoes = useRef({ buscar, aoChegar });
  const atual = useRef(estado);
  useEffect(() => {
    funcoes.current = { buscar, aoChegar };
    atual.current = estado;
  });

  useEffect(() => {
    if (chave === null) return;
    const controle = new AbortController();
    setEstado((e) =>
      e.chave === chave
        ? { ...e, carregando: true }
        : { chave, carregando: true },
    );
    funcoes.current.buscar(controle.signal).then(
      (dados) => {
        if (controle.signal.aborted) return;
        const anterior =
          atual.current.chave === chave ? atual.current.dados : undefined;
        funcoes.current.aoChegar?.(dados, anterior);
        setEstado({ chave, dados, carregando: false });
      },
      (erro: unknown) => {
        if (controle.signal.aborted) return;
        setEstado((e) => ({
          chave,
          dados: e.chave === chave ? e.dados : undefined,
          erro,
          carregando: false,
        }));
      },
    );
    return () => controle.abort();
  }, [chave, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const mudar = useCallback(
    (f: (atual: T) => T) =>
      setEstado((e) =>
        e.dados === undefined ? e : { ...e, dados: f(e.dados) },
      ),
    [],
  );

  const daChave = estado.chave === chave;
  return {
    dados: daChave ? estado.dados : undefined,
    erro: daChave ? estado.erro : undefined,
    carregando: chave !== null && (!daChave || estado.carregando),
    recarregar,
    mudar,
  };
}
