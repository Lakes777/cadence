import { renovar, tokenAtual } from './sessao';

/** Um erro da API pronto para mostrar: `mensagem` é legível e `erros` traz os campos */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly erros: { campo: string; mensagem: string }[] = [],
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }

  /** A mensagem do campo, se o servidor recusou aquele campo */
  doCampo(campo: string): string | undefined {
    return this.erros.find((e) => e.campo === campo)?.mensagem;
  }
}

export interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
  sinal?: AbortSignal;
}

/**
 * Chama a API (mesma origem). Manda o token de acesso; se ele venceu (401), renova uma vez e
 * repete o pedido. Resposta de erro vira ErroDaApi.
 */
export async function api<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const tinhaToken = tokenAtual() !== null;
  let resposta = await pedir(caminho, opcoes);
  if (
    resposta.status === 401 &&
    tinhaToken &&
    !caminho.startsWith('/auth/') &&
    (await renovar())
  ) {
    resposta = await pedir(caminho, opcoes);
  }
  if (!resposta.ok) throw await erroDe(resposta);
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

async function pedir(caminho: string, opcoes: Opcoes): Promise<Response> {
  const cabecalhos: Record<string, string> = { ...opcoes.cabecalhos };
  const token = tokenAtual();
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  // POST sem corpo também vai como JSON: as rotas de /auth exigem o cabeçalho (proteção de CSRF)
  const corpo =
    opcoes.corpo !== undefined || (opcoes.metodo && opcoes.metodo !== 'GET')
      ? JSON.stringify(opcoes.corpo ?? {})
      : undefined;
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  try {
    return await fetch(caminho, {
      method: opcoes.metodo ?? 'GET',
      headers: cabecalhos,
      body: corpo,
      signal: opcoes.sinal,
    });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro;
    throw new ErroDaApi(0, 'Sem conexão com o servidor. Tente de novo.');
  }
}

const PADRAO: Record<number, string> = {
  401: 'Sua sessão terminou. Entre de novo.',
  403: 'Você não tem permissão para isso.',
  404: 'Não encontrado.',
  429: 'Muitas tentativas. Espere um minuto e tente de novo.',
};

async function erroDe(resposta: Response): Promise<ErroDaApi> {
  let corpo: { message?: unknown; erros?: unknown } = {};
  try {
    corpo = (await resposta.json()) as typeof corpo;
  } catch {
    // corpo vazio ou não JSON: fica a mensagem padrão
  }
  const erros = Array.isArray(corpo.erros)
    ? (corpo.erros as { campo: string; mensagem: string }[])
    : [];
  const mensagem =
    resposta.status === 429
      ? PADRAO[429]
      : typeof corpo.message === 'string'
        ? corpo.message
        : (PADRAO[resposta.status] ?? 'Algo deu errado. Tente de novo.');
  return new ErroDaApi(resposta.status, mensagem, erros);
}

/** A mensagem para mostrar de qualquer erro pego num catch */
export function mensagemDe(erro: unknown): string {
  if (erro instanceof ErroDaApi) return erro.message;
  return 'Algo deu errado. Tente de novo.';
}
