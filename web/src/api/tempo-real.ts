import { assinarSessao, renovar, tokenAtual } from './sessao';
import type { MensagemDoServidor } from './tipos';

/**
 * `reconectou`: a conexão caiu e voltou. Eventos podem ter se perdido no meio, então quem
 * mostra dados que mudam busca de novo.
 */
export type EventoDoTempoReal = MensagemDoServidor | { tipo: 'reconectou' };
export type Ouvinte = (evento: EventoDoTempoReal) => void;

const ESPERA_MINIMA_MS = 1000;
const ESPERA_MAXIMA_MS = 30_000;

/**
 * Uma conexão só por aba com /tempo-real. Abre quando alguém assina um negócio ou há sessão;
 * se cair, volta sozinha (espera crescente, com sorteio para as abas não voltarem juntas),
 * refaz as assinaturas e entra de novo com o token do momento.
 */
export class TempoReal {
  private ws: WebSocket | null = null;
  private tentativas = 0;
  private relogio: ReturnType<typeof setTimeout> | undefined;
  private jaAbriu = false;
  private tokenEnviado: string | null = null;
  /** Quantas telas assinam cada negócio (assinar duas vezes, desassinar uma: continua) */
  private readonly assinaturas = new Map<string, number>();
  private readonly ouvintes = new Set<Ouvinte>();
  private readonly pararDeOuvirSessao: () => void;

  constructor(
    private readonly endereco: () => string = enderecoPadrao,
    private readonly criar: (url: string) => WebSocket = (url) =>
      new WebSocket(url),
  ) {
    this.pararDeOuvirSessao = assinarSessao(() => this.sessaoMudou());
  }

  ouvir(ouvinte: Ouvinte): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  assinar(negocio: string): () => void {
    const antes = this.assinaturas.get(negocio) ?? 0;
    this.assinaturas.set(negocio, antes + 1);
    if (antes === 0) this.mandar({ tipo: 'assinar', negocio });
    this.garantirConexao();
    return () => {
      const agora = (this.assinaturas.get(negocio) ?? 1) - 1;
      if (agora > 0) {
        this.assinaturas.set(negocio, agora);
        return;
      }
      this.assinaturas.delete(negocio);
      this.mandar({ tipo: 'desassinar', negocio });
    };
  }

  /** Só para os testes */
  encerrar(): void {
    this.pararDeOuvirSessao();
    clearTimeout(this.relogio);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private sessaoMudou(): void {
    if (tokenAtual()) this.garantirConexao();
    this.sincronizarToken();
  }

  private garantirConexao(): void {
    if (this.ws || this.relogio) return;
    const ws = this.criar(this.endereco());
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.tentativas = 0;
      this.tokenEnviado = null;
      this.sincronizarToken();
      for (const negocio of this.assinaturas.keys()) {
        this.mandar({ tipo: 'assinar', negocio });
      }
      if (this.jaAbriu) this.emitir({ tipo: 'reconectou' });
      this.jaAbriu = true;
    });
    ws.addEventListener('message', (evento: MessageEvent<string>) => {
      let mensagem: MensagemDoServidor;
      try {
        mensagem = JSON.parse(evento.data) as MensagemDoServidor;
      } catch {
        return;
      }
      // O token desta conexão venceu: renovar troca o token e a sessão manda entrar de novo
      if (mensagem.tipo === 'sessaoVencida') {
        this.tokenEnviado = null;
        void renovar();
      }
      this.emitir(mensagem);
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.tokenEnviado = null;
      if (!this.precisaDeConexao()) return;
      const teto = Math.min(
        ESPERA_MAXIMA_MS,
        ESPERA_MINIMA_MS * 2 ** this.tentativas++,
      );
      this.relogio = setTimeout(
        () => {
          this.relogio = undefined;
          this.garantirConexao();
        },
        teto / 2 + Math.random() * (teto / 2),
      );
    });
  }

  private precisaDeConexao(): boolean {
    return this.assinaturas.size > 0 || tokenAtual() !== null;
  }

  private sincronizarToken(): void {
    const token = tokenAtual();
    if (token === this.tokenEnviado) return;
    if (token) {
      if (this.mandar({ tipo: 'entrar', token })) this.tokenEnviado = token;
    } else if (this.mandar({ tipo: 'sair' })) {
      this.tokenEnviado = null;
    }
  }

  private mandar(mensagem: object): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(mensagem));
    return true;
  }

  private emitir(evento: EventoDoTempoReal): void {
    for (const ouvinte of this.ouvintes) ouvinte(evento);
  }
}

function enderecoPadrao(): string {
  const esquema = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${esquema}://${location.host}/tempo-real`;
}

let unica: TempoReal | null = null;

/** A conexão da aba (criada no primeiro uso) */
export function tempoReal(): TempoReal {
  unica ??= new TempoReal();
  return unica;
}

/** Só para os testes: troca a conexão da aba (ex.: por uma com WebSocket falso) */
export function trocarTempoRealParaTeste(nova: TempoReal | null): void {
  unica?.encerrar();
  unica = nova;
}
