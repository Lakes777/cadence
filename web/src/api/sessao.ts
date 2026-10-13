import type { Sessao, Usuario } from './tipos';

/**
 * A sessão desta aba. O token de acesso fica só na memória (nunca no localStorage, onde um
 * script injetado o leria); quem mantém a pessoa logada entre recargas é o cookie httpOnly de
 * renovação, que só a rota /auth recebe.
 *
 * Renovar gasta o token de renovação e o servidor entrega o próximo: se duas abas renovassem
 * ao mesmo tempo, uma delas poderia ficar com o token já gasto e a sessão cairia. Por isso a
 * renovação passa por uma trava do navegador (navigator.locks), compartilhada entre as abas:
 * uma de cada vez, sempre com o cookie mais novo.
 */

export interface EstadoDaSessao {
  usuario: Usuario | null;
  /** true até a primeira tentativa de recuperar a sessão pelo cookie terminar */
  carregando: boolean;
}

/** Renova este tanto antes de o token vencer */
const FOLGA_DA_RENOVACAO_S = 60;
/** Renovação que falhou por rede, 5xx ou 429: tenta de novo depois disto */
const NOVA_TENTATIVA_MS = 30_000;
const TRAVA = 'cadence-renovacao';

let token: string | null = null;
let estado: EstadoDaSessao = { usuario: null, carregando: true };
let relogio: ReturnType<typeof setTimeout> | undefined;
let emAndamento: Promise<boolean> | null = null;
const ouvintes = new Set<() => void>();

/** Avisa as outras abas de entrar e sair (o cookie é o mesmo para todas) */
const canal =
  typeof BroadcastChannel === 'undefined'
    ? null
    : new BroadcastChannel('cadence-sessao');
canal?.addEventListener('message', (evento: MessageEvent<string>) => {
  if (evento.data === 'saiu') limpar();
  // Outra aba entrou: esta pega o próprio token pelo cookie que acabou de chegar
  if (evento.data === 'entrou') void renovar();
});

export function tokenAtual(): string | null {
  return token;
}

export function estadoDaSessao(): EstadoDaSessao {
  return estado;
}

/** Para o useSyncExternalStore (ver useSessao) */
export function assinarSessao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function mudar(novo: EstadoDaSessao): void {
  estado = novo;
  for (const ouvinte of ouvintes) ouvinte();
}

/** Guarda a sessão que veio de entrar, cadastrar, visitante ou renovar */
export function aplicar(sessao: Sessao, avisarAbas = false): void {
  token = sessao.tokenDeAcesso;
  clearTimeout(relogio);
  const espera = Math.max(5, sessao.expiraEm - FOLGA_DA_RENOVACAO_S) * 1000;
  relogio = setTimeout(() => void renovar(), espera);
  mudar({ usuario: sessao.usuario, carregando: false });
  if (avisarAbas) canal?.postMessage('entrou');
}

function limpar(): void {
  token = null;
  clearTimeout(relogio);
  mudar({ usuario: null, carregando: false });
}

function comTrava<T>(fazer: () => Promise<T>): Promise<T> {
  // Navegador sem a API (raro): sem fila entre abas, só dentro desta
  if (typeof navigator === 'undefined' || !navigator.locks) return fazer();
  return navigator.locks.request(TRAVA, fazer);
}

/**
 * Pede um token novo pelo cookie. Pedidos ao mesmo tempo nesta aba esperam o mesmo; entre
 * abas, a trava faz uma esperar a outra. Devolve false se não há (mais) sessão.
 */
export function renovar(): Promise<boolean> {
  emAndamento ??= comTrava(async () => {
    try {
      const resposta = await fetch('/auth/renovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (resposta.status === 401 || resposta.status === 403) {
        // Cookie vencido, revogado ou ausente: a sessão acabou de verdade
        limpar();
        return false;
      }
      if (!resposta.ok) throw new Error(`renovar: ${resposta.status}`);
      aplicar((await resposta.json()) as Sessao);
      return true;
    } catch {
      // Sem rede, 5xx (a API reiniciando no deploy) ou 429: o cookie ainda vale, então a
      // sessão continua e a renovação tenta de novo daqui a pouco
      if (estado.carregando) mudar({ ...estado, carregando: false });
      if (token) {
        clearTimeout(relogio);
        relogio = setTimeout(() => void renovar(), NOVA_TENTATIVA_MS);
      }
      return false;
    }
  }).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

/** Na abertura da página: recupera a sessão pelo cookie, se houver */
export function iniciarSessao(): Promise<boolean> {
  return renovar();
}

export async function sair(): Promise<void> {
  try {
    await fetch('/auth/sair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } finally {
    limpar();
    canal?.postMessage('saiu');
  }
}

/** Só para os testes: volta ao estado de uma aba recém-aberta */
export function reiniciarSessaoParaTeste(): void {
  token = null;
  clearTimeout(relogio);
  emAndamento = null;
  estado = { usuario: null, carregando: true };
  ouvintes.clear();
}
