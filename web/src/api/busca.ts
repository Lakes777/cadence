import { useCallback, useEffect, useRef, useState } from 'react';
import { mensagemDe } from './cliente';

export interface Busca<T> {
  dados: T | undefined;
  /** O erro da última busca (ErroDaApi, em geral), ou undefined */
  erro: unknown;
  /** O erro pronto para mostrar, ou null */
  mensagem: string | null;
  /** true durante qualquer busca (a primeira ou uma atualização) */
  carregando: boolean;
  /** Busca de novo mantendo os dados na tela até a resposta chegar (não pisca) */
  recarregar: () => void;
  /** Troca os dados na tela sem buscar (um PATCH que já devolveu o novo, um evento ao vivo) */
  mudar: (f: (atual: T) => T) => void;
}

/**
 * Busca sempre que `chave` muda (null = não buscar). Mudar a chave limpa a tela, porque os
 * dados velhos seriam de outra coisa; `recarregar()` mantém o que já está. A resposta de uma
 * busca que ficou para trás é descartada.
 *
 * `aoChegar` recebe o que chegou e o que estava na tela (da mesma chave), antes de a tela
 * mudar: é ali que se descobre o que é novo (ex.: a reserva que chegou ao vivo), no mesmo
 * quadro em que a lista nova aparece.
 */
export function useBusca<T>(
  chave: string | null,
  buscar: (sinal: AbortSignal) => Promise<T>,
  aoChegar?: (novo: T, anterior: T | undefined) => void,
): Busca<T> {
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
        ? { ...e, erro: undefined, carregando: true }
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
  const erro = daChave ? estado.erro : undefined;
  return {
    dados: daChave ? estado.dados : undefined,
    erro,
    mensagem: erro === undefined ? null : mensagemDe(erro),
    carregando: chave !== null && (!daChave || estado.carregando),
    recarregar,
    mudar,
  };
}
