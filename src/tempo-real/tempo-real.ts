import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Express } from 'express';
import proxyaddr from 'proxy-addr';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { CONFIG, type Config } from '../config/config.js';
import { LimitePorJanela } from './limite-por-janela.js';
import {
  diasAfetados,
  lerMensagem,
  type MensagemDoCliente,
  type MensagemDoServidor,
} from './mensagens.js';

/** O caminho do WebSocket (ex.: wss://cadence.exemplo.com/tempo-real) */
export const CAMINHO = '/tempo-real';
/** Uma mensagem do navegador é pequena (o token é a maior); acima disso, a conexão cai */
export const TAMANHO_MAXIMO_DA_MENSAGEM = 4096;
/** Quantos negócios uma conexão acompanha ao mesmo tempo (uma tela olha um ou dois) */
export const MAXIMO_DE_ASSINATURAS = 10;
/** Mensagens que o navegador pode mandar por janela; passou disso, a conexão cai */
export const MENSAGENS_POR_JANELA = 30;
export const JANELA_DAS_MENSAGENS_MS = 10_000;
/** A janela de CONEXOES_POR_MINUTO */
export const JANELA_DAS_CONEXOES_MS = 60_000;
/** De quanto em quanto tempo um ping confere que o outro lado ainda está lá */
export const INTERVALO_DO_PING_MS = 30_000;
/** Ao desligar, quanto esperar o navegador responder ao fechamento antes de derrubar */
export const ESPERA_AO_DESLIGAR_MS = 1000;
/** Navegador que não lê o que chega (aba congelada, rede ruim) não pode encher a memória */
const LIMITE_DO_BUFFER = 1024 * 1024;

interface Conexao {
  socket: WebSocket;
  ip: string;
  usuarioId?: string;
  vencimento?: NodeJS.Timeout;
  assinaturas: Set<string>;
  /** Sobe a cada entrar/sair: um entrar que termina de conferir o token depois de um sair não vale */
  tentativa: number;
  respondeu: boolean;
  janela: { inicio: number; mensagens: number };
}

interface ConteudoDoToken {
  sub: string;
  exp: number;
}

/**
 * WebSocket em /tempo-real (fase 7). Qualquer um assina um negócio e fica sabendo quando os
 * horários de um dia mudam (para buscar de novo, sem a tela ficar perguntando a cada segundo);
 * quem manda `entrar` com o token de acesso recebe também os próprios avisos e reservas.
 *
 * Tudo vive na memória deste processo: com mais de uma instância da API, cada evento teria
 * de passar por um canal comum (ex.: o pub/sub do Redis que a fila já usa).
 */
@Injectable()
export class TempoReal
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(TempoReal.name);
  private readonly servidor = new WebSocketServer({
    noServer: true,
    maxPayload: TAMANHO_MAXIMO_DA_MENSAGEM,
  });
  private readonly conexoes = new Set<Conexao>();
  private readonly porNegocio = new Map<string, Set<Conexao>>();
  private readonly porUsuario = new Map<string, Set<Conexao>>();
  private readonly porIp = new Map<string, number>();
  private readonly novasPorIp: LimitePorJanela;
  private http?: Server;
  private ping?: NodeJS.Timeout;
  private readonly aoPedirUpgrade = (
    req: IncomingMessage,
    socket: Duplex,
    cabeca: Buffer,
  ) => this.upgrade(req, socket, cabeca);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly adaptador: HttpAdapterHost,
    private readonly jwt: JwtService,
  ) {
    this.novasPorIp = new LimitePorJanela(
      config.CONEXOES_POR_MINUTO,
      JANELA_DAS_CONEXOES_MS,
    );
  }

  onApplicationBootstrap(): void {
    this.http = this.adaptador.httpAdapter.getHttpServer() as Server;
    this.http.on('upgrade', this.aoPedirUpgrade);
    this.ping = setInterval(() => this.pingar(), INTERVALO_DO_PING_MS);
  }

  /**
   * Antes do servidor HTTP fechar: ele espera todas as conexões terminarem, inclusive as de
   * WebSocket, então elas precisam fechar primeiro (no Nest 12, onApplicationShutdown só roda
   * depois do servidor HTTP fechado, e os dois ficariam esperando um pelo outro).
   */
  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.ping);
    this.http?.off('upgrade', this.aoPedirUpgrade);
    const fechadas = [...this.conexoes].map(
      ({ socket }) =>
        new Promise<void>((resolver) => {
          socket.once('close', () => resolver());
          socket.close(1001, 'Servidor reiniciando');
        }),
    );
    let espera: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(fechadas),
      new Promise((resolver) => {
        espera = setTimeout(resolver, ESPERA_AO_DESLIGAR_MS);
      }),
    ]);
    clearTimeout(espera);
    // Quem não respondeu ao fechamento (rede caída) não segura o desligamento
    for (const { socket } of this.conexoes) socket.terminate();
    this.servidor.close();
  }

  /** Quantas conexões estão abertas agora (para os testes) */
  get abertas(): number {
    return this.conexoes.size;
  }

  /*
   * Os avisos abaixo são chamados depois que a operação já foi gravada: uma falha aqui fica no
   * log e nunca transforma uma reserva feita num erro 500.
   */

  /** Os horários livres de [inicio, fim) mudaram: avisa quem está olhando o negócio */
  horariosMudaram(
    negocio: { slug: string; fuso: string },
    inicio: Date,
    fim: Date,
  ): void {
    this.semFalhar(() => {
      const assinantes = this.porNegocio.get(negocio.slug);
      if (!assinantes) return;
      const mensagem: MensagemDoServidor = {
        tipo: 'horarios',
        negocio: negocio.slug,
        ...diasAfetados(inicio, fim, negocio.fuso),
      };
      for (const conexao of assinantes) this.enviar(conexao, mensagem);
    });
  }

  /**
   * O dono mudou o horário semanal, um profissional, um serviço ou o próprio negócio: qualquer
   * dia pode ter mudado, e quem está olhando busca de novo o que está na tela
   */
  catalogoMudou(slug: string, novoEndereco?: string): void {
    this.semFalhar(() => {
      const mensagem: MensagemDoServidor = {
        tipo: 'catalogo',
        negocio: slug,
        ...(novoEndereco && novoEndereco !== slug ? { novoEndereco } : {}),
      };
      for (const conexao of this.porNegocio.get(slug) ?? []) {
        this.enviar(conexao, mensagem);
      }
    });
  }

  /** Manda para todas as abas em que a pessoa entrou */
  paraUsuario(usuarioId: string, mensagem: MensagemDoServidor): void {
    this.semFalhar(() => {
      for (const conexao of this.porUsuario.get(usuarioId) ?? []) {
        this.enviar(conexao, mensagem);
      }
    });
  }

  private semFalhar(avisar: () => void): void {
    try {
      avisar();
    } catch (erro) {
      this.logger.error(
        `Aviso do tempo real não saiu: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  private upgrade(req: IncomingMessage, socket: Duplex, cabeca: Buffer): void {
    // O socket chega do Node sem quem trate erro: um RST do outro lado antes de o ws assumir
    // (ou durante a recusa) viraria uma exceção sem tratamento e derrubaria o processo
    const aoFalhar = (): void => void socket.destroy();
    socket.on('error', aoFalhar);
    const caminho = new URL(req.url ?? '/', 'http://x').pathname;
    if (caminho !== CAMINHO) {
      recusar(socket, 404, 'Not Found');
      return;
    }
    // O mesmo IP que o Express usaria (respeita CONFIANCA_NO_PROXY atrás do Caddy)
    const express = this.adaptador.httpAdapter.getInstance<Express>();
    const ip = proxyaddr(req, express.get('trust proxy fn'));
    if (
      (this.porIp.get(ip) ?? 0) >= this.config.CONEXOES_POR_IP ||
      !this.novasPorIp.cabe(ip)
    ) {
      recusar(socket, 429, 'Too Many Requests');
      return;
    }
    // Conta só as aceitas: a recusa custa pouco, e quem é recusado não prolonga a própria espera
    this.novasPorIp.registrar(ip);
    // Daqui em diante quem trata os erros do socket é o ws
    socket.off('error', aoFalhar);
    this.servidor.handleUpgrade(req, socket, cabeca, (ws) =>
      this.conectar(ws, ip),
    );
  }

  private conectar(socket: WebSocket, ip: string): void {
    const conexao: Conexao = {
      socket,
      ip,
      assinaturas: new Set(),
      tentativa: 0,
      respondeu: true,
      janela: { inicio: Date.now(), mensagens: 0 },
    };
    this.conexoes.add(conexao);
    this.porIp.set(ip, (this.porIp.get(ip) ?? 0) + 1);

    socket.on('pong', () => (conexao.respondeu = true));
    socket.on(
      'message',
      (dados, binario) =>
        void this.receber(conexao, dados, binario).catch((erro: unknown) => {
          // Um erro inesperado derruba só esta conexão, nunca o processo
          this.logger.error(
            `Mensagem de ${conexao.ip} quebrou: ${erro instanceof Error ? erro.message : String(erro)}`,
          );
          socket.terminate();
        }),
    );
    // Erro de protocolo (ex.: mensagem maior que o limite): o ws já fecha; só não pode estourar
    socket.on('error', () => socket.terminate());
    socket.on('close', () => this.desconectar(conexao));
  }

  private desconectar(conexao: Conexao): void {
    if (!this.conexoes.delete(conexao)) return;
    this.sair(conexao);
    for (const slug of conexao.assinaturas) {
      remover(this.porNegocio, slug, conexao);
    }
    const restantes = (this.porIp.get(conexao.ip) ?? 1) - 1;
    if (restantes > 0) this.porIp.set(conexao.ip, restantes);
    else this.porIp.delete(conexao.ip);
  }

  private async receber(
    conexao: Conexao,
    dados: RawData,
    binario: boolean,
  ): Promise<void> {
    const agora = Date.now();
    if (agora - conexao.janela.inicio >= JANELA_DAS_MENSAGENS_MS) {
      conexao.janela = { inicio: agora, mensagens: 0 };
    }
    if (++conexao.janela.mensagens > MENSAGENS_POR_JANELA) {
      // 1008 = violou a política
      conexao.socket.close(1008, 'Mensagens demais');
      return;
    }
    if (binario) {
      this.enviar(conexao, { tipo: 'erro', mensagem: 'Mande texto (JSON)' });
      return;
    }
    const lida = lerMensagem(
      // Com o binaryType padrão (nodebuffer), o texto chega como um Buffer só
      (dados as Buffer).toString('utf8'),
    );
    if (!lida.ok) {
      this.enviar(conexao, { tipo: 'erro', mensagem: lida.erro });
      return;
    }
    await this.tratar(conexao, lida.mensagem);
  }

  private async tratar(
    conexao: Conexao,
    mensagem: MensagemDoCliente,
  ): Promise<void> {
    switch (mensagem.tipo) {
      case 'entrar':
        return this.entrar(conexao, mensagem.token);
      case 'sair':
        conexao.tentativa++;
        this.sair(conexao);
        return this.enviar(conexao, { tipo: 'saiu' });
      case 'assinar': {
        const { negocio } = mensagem;
        if (
          !conexao.assinaturas.has(negocio) &&
          conexao.assinaturas.size >= MAXIMO_DE_ASSINATURAS
        ) {
          return this.enviar(conexao, {
            tipo: 'erro',
            mensagem: `No máximo ${MAXIMO_DE_ASSINATURAS} negócios por conexão; desassine algum antes`,
          });
        }
        conexao.assinaturas.add(negocio);
        adicionar(this.porNegocio, negocio, conexao);
        return this.enviar(conexao, { tipo: 'assinado', negocio });
      }
      case 'desassinar':
        conexao.assinaturas.delete(mensagem.negocio);
        remover(this.porNegocio, mensagem.negocio, conexao);
        return this.enviar(conexao, {
          tipo: 'desassinado',
          negocio: mensagem.negocio,
        });
    }
  }

  /**
   * Liga a conexão à pessoa do token até ele vencer (15 min). A interface manda `entrar` de
   * novo a cada renovação; quem não manda recebe `sessaoVencida` e para de receber avisos.
   */
  private async entrar(conexao: Conexao, token: string): Promise<void> {
    const tentativa = ++conexao.tentativa;
    let conteudo: ConteudoDoToken;
    try {
      conteudo = await this.jwt.verifyAsync<ConteudoDoToken>(token);
    } catch {
      // Um entrar ou sair mandado depois já decidiu
      if (tentativa !== conexao.tentativa) return;
      this.sair(conexao);
      return this.enviar(conexao, {
        tipo: 'erro',
        mensagem: 'Sessão expirada ou inválida; faça login de novo',
      });
    }
    // A conexão pode ter caído enquanto o token era conferido, ou a aba mandou sair (ou entrar
    // com outra conta) nesse meio tempo: vale a última mensagem, não a que terminou por último
    if (!this.conexoes.has(conexao) || tentativa !== conexao.tentativa) return;
    this.sair(conexao);
    conexao.usuarioId = conteudo.sub;
    adicionar(this.porUsuario, conteudo.sub, conexao);
    const restanteMs = conteudo.exp * 1000 - Date.now();
    conexao.vencimento = setTimeout(() => {
      this.sair(conexao);
      this.enviar(conexao, { tipo: 'sessaoVencida' });
    }, restanteMs);
    this.enviar(conexao, {
      tipo: 'entrou',
      expiraEm: Math.max(0, Math.floor(restanteMs / 1000)),
    });
  }

  private sair(conexao: Conexao): void {
    clearTimeout(conexao.vencimento);
    conexao.vencimento = undefined;
    if (!conexao.usuarioId) return;
    remover(this.porUsuario, conexao.usuarioId, conexao);
    conexao.usuarioId = undefined;
  }

  private enviar(conexao: Conexao, mensagem: MensagemDoServidor): void {
    const { socket } = conexao;
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > LIMITE_DO_BUFFER) {
      this.logger.warn(
        `Conexão de ${conexao.ip} não lê o que chega; derrubada`,
      );
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(mensagem));
  }

  /** Quem não respondeu ao ping anterior caiu sem avisar (Wi-Fi, celular dormindo) */
  private pingar(): void {
    // Aproveita a volta do ping para esquecer as janelas de conexão que já passaram
    this.novasPorIp.limpar();
    for (const conexao of this.conexoes) {
      if (!conexao.respondeu) {
        conexao.socket.terminate();
        continue;
      }
      conexao.respondeu = false;
      conexao.socket.ping();
    }
  }
}

function adicionar<T>(mapa: Map<string, Set<T>>, chave: string, item: T): void {
  let conjunto = mapa.get(chave);
  if (!conjunto) mapa.set(chave, (conjunto = new Set()));
  conjunto.add(item);
}

function remover<T>(mapa: Map<string, Set<T>>, chave: string, item: T): void {
  const conjunto = mapa.get(chave);
  if (!conjunto) return;
  conjunto.delete(item);
  if (conjunto.size === 0) mapa.delete(chave);
}

function recusar(socket: Duplex, status: number, texto: string): void {
  // Fecha de vez depois de a resposta sair (como o ws faz): end sozinho espera o outro lado
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${texto}\r\nConnection: close\r\n\r\n`);
}
