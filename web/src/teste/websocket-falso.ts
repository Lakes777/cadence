import type { MensagemDoServidor } from '../api/tipos';
import { TempoReal, trocarTempoRealParaTeste } from '../api/tempo-real';

/** Um WebSocket de mentira: o teste abre, fecha e entrega mensagens quando quiser */
export class WebSocketFalso extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = WebSocketFalso.CONNECTING;
  readonly enviadas: unknown[] = [];

  constructor(readonly url: string) {
    super();
  }

  send(texto: string): void {
    this.enviadas.push(JSON.parse(texto));
  }

  close(): void {
    if (this.readyState === WebSocketFalso.CLOSED) return;
    this.readyState = WebSocketFalso.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  // Do lado do "servidor":
  abrir(): void {
    this.readyState = WebSocketFalso.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  entregar(mensagem: MensagemDoServidor): void {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(mensagem) }),
    );
  }

  cair(): void {
    this.close();
  }
}

/**
 * Põe uma conexão de tempo real com WebSockets falsos no lugar da da aba. `conexoes` guarda
 * cada um que foi aberto (o último é o atual).
 *
 *   const tr = tempoRealFalso();
 *   render(<Reservar />);
 *   tr.atual().abrir();
 *   tr.atual().entregar({ tipo: 'horarios', negocio: 'x', de: '2026-10-19', ate: '2026-10-19' });
 */
export function tempoRealFalso() {
  const conexoes: WebSocketFalso[] = [];
  // O código confere `readyState === WebSocket.OPEN`
  globalThis.WebSocket ??= WebSocketFalso as unknown as typeof WebSocket;
  const tr = new TempoReal(
    () => 'ws://localhost/tempo-real',
    (url) => {
      const ws = new WebSocketFalso(url);
      conexoes.push(ws);
      return ws as unknown as WebSocket;
    },
  );
  trocarTempoRealParaTeste(tr);
  return {
    tempoReal: tr,
    conexoes,
    atual(): WebSocketFalso {
      const ws = conexoes.at(-1);
      if (!ws) throw new Error('Nenhuma conexão de tempo real foi aberta');
      return ws;
    },
  };
}
