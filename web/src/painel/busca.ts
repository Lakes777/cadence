import { useCallback, useState } from 'react';
import { ErroDaApi, mensagemDe } from '../api/cliente';

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
