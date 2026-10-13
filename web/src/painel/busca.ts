import { useCallback, useEffect, useRef, useState } from 'react';
import { ErroDaApi, mensagemDe } from '../api/cliente';

export interface Busca<T> {
  dados: T | undefined;
  erro: string | null;
  /** true durante qualquer busca (a primeira ou uma atualização) */
  carregando: boolean;
  /** Busca de novo mantendo os dados na tela até a resposta chegar (não pisca) */
  recarregar: () => void;
  /** Troca os dados na tela sem buscar (ex.: depois de um PATCH que já devolveu o novo) */
  definir: (mudar: (atual: T | undefined) => T | undefined) => void;
}

/**
 * Busca `buscar()` sempre que `chave` muda (o período, o negócio...). Mudar a chave limpa a
 * tela, porque os dados velhos seriam de outra coisa; `recarregar()` mantém o que já está.
 * A resposta de uma busca que ficou para trás é descartada.
 */
export function useBusca<T>(
  buscar: (sinal: AbortSignal) => Promise<T>,
  chave: string,
): Busca<T> {
  const [dados, setDados] = useState<{ chave: string; valor: T } | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const atual = useRef(buscar);
  useEffect(() => {
    atual.current = buscar;
  });

  useEffect(() => {
    const controle = new AbortController();
    setCarregando(true);
    setErro(null);
    atual.current(controle.signal).then(
      (valor) => {
        if (controle.signal.aborted) return;
        setDados({ chave, valor });
        setCarregando(false);
      },
      (e: unknown) => {
        if (controle.signal.aborted) return;
        setErro(mensagemDe(e));
        setCarregando(false);
      },
    );
    return () => controle.abort();
  }, [chave, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const definir = useCallback(
    (mudar: (atual: T | undefined) => T | undefined) =>
      setDados((antes) => {
        const valor = mudar(antes?.chave === chave ? antes.valor : undefined);
        return valor === undefined ? undefined : { chave, valor };
      }),
    [chave],
  );

  return {
    dados: dados?.chave === chave ? dados.valor : undefined,
    erro,
    carregando,
    recarregar,
    definir,
  };
}

/** Um envio (POST, PATCH...) com o estado de "enviando" e a mensagem de erro */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<unknown>(null);

  const enviar = useCallback(
    async <T>(fazer: () => Promise<T>): Promise<T | undefined> => {
      setEnviando(true);
      setErro(null);
      try {
        return await fazer();
      } catch (e) {
        setErro(e);
        return undefined;
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviando, erro, enviar, limparErro: () => setErro(null) };
}

/**
 * A mensagem para o topo do formulário: o que não cabe embaixo de nenhum campo da tela.
 * `tratados` são status que a tela já mostra num campo (ex.: 409 de endereço repetido).
 */
export function mensagemGeral(
  erro: unknown,
  campos: readonly string[],
  tratados: readonly number[] = [],
): string | null {
  if (!erro) return null;
  if (erro instanceof ErroDaApi) {
    if (tratados.includes(erro.status)) return null;
    if (erro.erros.length) {
      const outros = erro.erros.filter((e) => !campos.includes(e.campo));
      return outros.length ? outros.map((e) => e.mensagem).join(' ') : null;
    }
  }
  return mensagemDe(erro);
}
