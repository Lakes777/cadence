import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { WebSocket } from 'ws';
import { RELOGIO } from '../src/comum/relogio.js';
import { LembretesService } from '../src/lembretes/lembretes.service.js';
import type { MensagemDoServidor } from '../src/tempo-real/mensagens.js';
import {
  ESPERA_AO_DESLIGAR_MS,
  MAXIMO_DE_ASSINATURAS,
  MENSAGENS_POR_JANELA,
  TAMANHO_MAXIMO_DA_MENSAGEM,
  TempoReal,
} from '../src/tempo-real/tempo-real.js';
import { novaConta, type Conta } from './ajudantes.js';
import { criarApp } from './app.js';

/** Segunda-feira, 12/10/2026, 08:00 em São Paulo */
const SEGUNDA_8H = new Date('2026-10-12T08:00:00-03:00');
/** Segunda seguinte, 19/10, 09:00 (lembrete no domingo, 18/10, 09:00) */
const INICIO = '2026-10-19T09:00:00-03:00';
let agora = SEGUNDA_8H;
const relogio = { agora: () => agora };

/** Tempo para concluir que uma mensagem não vai chegar */
const SILENCIO_MS = 300;

/** Um navegador conectado: guarda o que chega e espera pela mensagem que interessa */
class Navegador {
  readonly recebidas: MensagemDoServidor[] = [];
  private esperando: (() => void)[] = [];
  readonly fechou: Promise<{ codigo: number; motivo: string }>;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (dados) => {
      this.recebidas.push(
        JSON.parse((dados as Buffer).toString()) as MensagemDoServidor,
      );
      for (const acordar of this.esperando) acordar();
    });
    this.fechou = new Promise((resolver) =>
      ws.on('close', (codigo, motivo) =>
        resolver({ codigo, motivo: motivo.toString() }),
      ),
    );
  }

  static abrir(
    url: string,
    headers?: Record<string, string>,
  ): Promise<Navegador> {
    const ws = new WebSocket(url, { headers });
    const navegador = new Navegador(ws);
    return new Promise((resolver, rejeitar) => {
      ws.once('open', () => resolver(navegador));
      ws.once('unexpected-response', (_req, res) =>
        rejeitar(new Error(`HTTP ${res.statusCode}`)),
      );
      ws.once('error', rejeitar);
    });
  }

  mandar(mensagem: unknown): void {
    this.ws.send(
      typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem),
    );
  }

  /** Tira da fila a primeira mensagem deste tipo (espera até 5 s por ela) */
  async proxima<T extends MensagemDoServidor['tipo']>(
    tipo: T,
  ): Promise<Extract<MensagemDoServidor, { tipo: T }>> {
    const fim = Date.now() + 5000;
    for (;;) {
      const i = this.recebidas.findIndex((m) => m.tipo === tipo);
      if (i >= 0) {
        return this.recebidas.splice(i, 1)[0] as Extract<
          MensagemDoServidor,
          { tipo: T }
        >;
      }
      const falta = fim - Date.now();
      if (falta <= 0) {
        throw new Error(
          `"${tipo}" não chegou; chegaram: ${JSON.stringify(this.recebidas)}`,
        );
      }
      await new Promise<void>((acordar) => {
        const t = setTimeout(acordar, falta);
        this.esperando.push(() => {
          clearTimeout(t);
          acordar();
        });
      });
      this.esperando = [];
    }
  }

  /** Confere que nenhuma mensagem deste tipo chega dentro de um tempo curto */
  async nenhuma(tipo: MensagemDoServidor['tipo']): Promise<void> {
    await new Promise((r) => setTimeout(r, SILENCIO_MS));
    expect(this.recebidas.filter((m) => m.tipo === tipo)).toEqual([]);
  }

  async assinar(negocio: string): Promise<void> {
    this.mandar({ tipo: 'assinar', negocio });
    expect(await this.proxima('assinado')).toEqual({
      tipo: 'assinado',
      negocio,
    });
  }

  async entrar(token: string): Promise<void> {
    this.mandar({ tipo: 'entrar', token });
    await this.proxima('entrou');
  }

  fechar(): void {
    this.ws.close();
  }
}

describe('tempo real', () => {
  let app: INestApplication<App>;
  let url: string;
  let dono: Conta;
  let cliente: Conta;
  let outroCliente: Conta;
  const abertos: Navegador[] = [];

  const http = () => request(app.getHttpServer());
  const como = (conta: Conta) => ({
    post: (caminho: string) =>
      http().post(caminho).set('Authorization', `Bearer ${conta.token}`),
    put: (caminho: string) =>
      http().put(caminho).set('Authorization', `Bearer ${conta.token}`),
    patch: (caminho: string) =>
      http().patch(caminho).set('Authorization', `Bearer ${conta.token}`),
    delete: (caminho: string) =>
      http().delete(caminho).set('Authorization', `Bearer ${conta.token}`),
  });

  async function abrir(
    endereco = url,
    headers?: Record<string, string>,
  ): Promise<Navegador> {
    const navegador = await Navegador.abrir(endereco, headers);
    abertos.push(navegador);
    return navegador;
  }

  /** Barbearia com a Ana (segunda, 09-12) fazendo Corte (30 min) */
  async function montar() {
    const negocio = (
      await como(dono)
        .post('/negocios')
        .send({ nome: 'Barbearia', slug: `tr-${randomUUID()}` })
        .expect(201)
    ).body as { id: string; slug: string };
    const base = `/negocios/${negocio.id}`;
    const corte = (
      await como(dono)
        .post(`${base}/servicos`)
        .send({ nome: 'Corte', duracaoMin: 30, precoCentavos: 3500 })
        .expect(201)
    ).body as { id: string };
    const ana = (
      await como(dono)
        .post(`${base}/profissionais`)
        .send({ nome: 'Ana' })
        .expect(201)
    ).body as { id: string };
    await como(dono)
      .put(`${base}/profissionais/${ana.id}/servicos`)
      .send({ servicoIds: [corte.id] })
      .expect(200);
    await como(dono)
      .put(`${base}/profissionais/${ana.id}/horarios`)
      .send({ horarios: [{ diaDaSemana: 1, inicio: '09:00', fim: '12:00' }] })
      .expect(200);
    return { ...negocio, corte, ana };
  }

  type Montado = Awaited<ReturnType<typeof montar>>;

  async function reservar(
    n: Montado,
    conta = cliente,
    inicio = INICIO,
  ): Promise<string> {
    const { body } = await como(conta)
      .post(`/negocios/${n.slug}/reservas`)
      .set('Idempotency-Key', randomUUID())
      .send({ servicoId: n.corte.id, inicio })
      .expect(201);
    return (body as { id: string }).id;
  }

  beforeAll(async () => {
    app = await criarApp({}, (m) =>
      m.overrideProvider(RELOGIO).useValue(relogio),
    );
    // O WebSocket precisa de uma porta de verdade (o supertest não abre conexão longa)
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    url = `ws://127.0.0.1:${port}/tempo-real`;
    [dono, cliente, outroCliente] = await Promise.all([
      novaConta(app, 'dono'),
      novaConta(app, 'cliente'),
      novaConta(app, 'cliente'),
    ]);
  });

  afterEach(() => {
    agora = SEGUNDA_8H;
    for (const navegador of abertos.splice(0)) navegador.fechar();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('horários do dia', () => {
    it('quem olha o negócio fica sabendo na hora que o dia da reserva mudou', async () => {
      const n = await montar();
      const olhando = await abrir();
      await olhando.assinar(n.slug);
      await reservar(n);
      expect(await olhando.proxima('horarios')).toEqual({
        tipo: 'horarios',
        negocio: n.slug,
        de: '2026-10-19',
        ate: '2026-10-19',
      });
      // E o horário sumiu mesmo: buscar de novo já não oferece as 09:00
      const { body } = await http()
        .get(`/negocios/${n.slug}/disponibilidade`)
        .query({ servicoId: n.corte.id, data: '2026-10-19' })
        .expect(200);
      const inicios = (body as { horarios: { inicio: string }[] }).horarios.map(
        (h) => h.inicio,
      );
      expect(inicios).not.toContain(new Date(INICIO).toISOString());
    });

    it('não avisa quem olha outro negócio, nem quem desassinou', async () => {
      const [n, outro] = await Promise.all([montar(), montar()]);
      const deOutro = await abrir();
      await deOutro.assinar(outro.slug);
      const desistiu = await abrir();
      await desistiu.assinar(n.slug);
      desistiu.mandar({ tipo: 'desassinar', negocio: n.slug });
      await desistiu.proxima('desassinado');
      await reservar(n);
      await Promise.all([
        deOutro.nenhuma('horarios'),
        desistiu.nenhuma('horarios'),
      ]);
    });

    it('o horário volta quando a reserva é cancelada', async () => {
      const n = await montar();
      const id = await reservar(n);
      const olhando = await abrir();
      await olhando.assinar(n.slug);
      await como(cliente).post(`/reservas/${id}/cancelar`).expect(200);
      expect(await olhando.proxima('horarios')).toMatchObject({
        de: '2026-10-19',
        ate: '2026-10-19',
      });
      // Cancelar de novo não muda nada, então não avisa de novo
      await como(cliente).post(`/reservas/${id}/cancelar`).expect(200);
      await olhando.nenhuma('horarios');
    });

    it('reserva recusada (horário ocupado) não avisa ninguém', async () => {
      const n = await montar();
      await reservar(n);
      const olhando = await abrir();
      await olhando.assinar(n.slug);
      await como(outroCliente)
        .post(`/negocios/${n.slug}/reservas`)
        .set('Idempotency-Key', randomUUID())
        .send({ servicoId: n.corte.id, inicio: INICIO })
        .expect(409);
      await olhando.nenhuma('horarios');
    });

    it('bloqueio de vários dias avisa do primeiro ao último, ao criar e ao remover', async () => {
      const n = await montar();
      const olhando = await abrir();
      await olhando.assinar(n.slug);
      const { body } = await como(dono)
        .post(`/negocios/${n.id}/bloqueios`)
        .send({
          inicio: '2026-10-19T00:00:00-03:00',
          fim: '2026-10-22T00:00:00-03:00',
          motivo: 'Férias',
        })
        .expect(201);
      const faixa = { de: '2026-10-19', ate: '2026-10-21' };
      expect(await olhando.proxima('horarios')).toMatchObject(faixa);
      await como(dono)
        .delete(`/negocios/${n.id}/bloqueios/${(body as { id: string }).id}`)
        .expect(204);
      expect(await olhando.proxima('horarios')).toMatchObject(faixa);
    });

    it('mudanças do dono no catálogo avisam quem olha o negócio', async () => {
      const n = await montar();
      const base = `/negocios/${n.id}`;
      const aba = await abrir();
      await aba.assinar(n.slug);
      const esperado = { tipo: 'catalogo', negocio: n.slug };
      await como(dono)
        .put(`${base}/profissionais/${n.ana.id}/horarios`)
        .send({ horarios: [{ diaDaSemana: 1, inicio: '10:00', fim: '12:00' }] })
        .expect(200);
      expect(await aba.proxima('catalogo')).toEqual(esperado);
      await como(dono)
        .patch(`${base}/profissionais/${n.ana.id}`)
        .send({ ativo: false })
        .expect(200);
      expect(await aba.proxima('catalogo')).toEqual(esperado);
      await como(dono)
        .put(`${base}/profissionais/${n.ana.id}/servicos`)
        .send({ servicoIds: [n.corte.id] })
        .expect(200);
      expect(await aba.proxima('catalogo')).toEqual(esperado);
      await como(dono)
        .patch(`${base}/servicos/${n.corte.id}`)
        .send({ duracaoMin: 45 })
        .expect(200);
      expect(await aba.proxima('catalogo')).toEqual(esperado);
      // Trocar o endereço avisa quem olha pelo antigo
      await como(dono)
        .patch(base)
        .send({ slug: `${n.slug}-novo` })
        .expect(200);
      expect(await aba.proxima('catalogo')).toEqual({
        ...esperado,
        novoEndereco: `${n.slug}-novo`,
      });
      await aba.nenhuma('horarios');
    });

    it('assinar é aberto (sem login) e limitado por conexão', async () => {
      const navegador = await abrir();
      for (let i = 0; i < MAXIMO_DE_ASSINATURAS; i++) {
        await navegador.assinar(`negocio-${i}`);
      }
      // Repetir um que já assina não conta como novo
      await navegador.assinar('negocio-0');
      navegador.mandar({ tipo: 'assinar', negocio: 'mais-um' });
      expect((await navegador.proxima('erro')).mensagem).toMatch(
        /No máximo 10 negócios/,
      );
    });
  });

  describe('avisos de quem entrou', () => {
    it('o cliente recebe a própria reserva nas outras abas; os outros não', async () => {
      const n = await montar();
      const [minhaAba, alheia, semLogin] = await Promise.all([
        abrir(),
        abrir(),
        abrir(),
      ]);
      await minhaAba.entrar(cliente.token);
      await alheia.entrar(outroCliente.token);
      const id = await reservar(n);
      const { reserva } = await minhaAba.proxima('reserva');
      expect(reserva).toMatchObject({ id, status: 'confirmada' });
      await Promise.all([
        alheia.nenhuma('reserva'),
        semLogin.nenhuma('reserva'),
      ]);
    });

    it('o cliente fica sabendo quando o estabelecimento cancela', async () => {
      const n = await montar();
      const id = await reservar(n);
      const aba = await abrir();
      await aba.entrar(cliente.token);
      await como(dono).post(`/reservas/${id}/cancelar`).expect(200);
      expect((await aba.proxima('reserva')).reserva).toMatchObject({
        id,
        status: 'cancelada',
      });
    });

    it('o lembrete chega na hora em que é gravado', async () => {
      const n = await montar();
      const id = await reservar(n);
      const aba = await abrir();
      await aba.entrar(cliente.token);
      agora = new Date('2026-10-18T09:00:00-03:00');
      expect(await app.get(LembretesService).enviar(id)).toBe('enviado');
      const { aviso } = await aba.proxima('aviso');
      expect(aviso).toMatchObject({
        tipo: 'lembrete',
        reservaId: id,
        reservaCancelada: false,
        lidoEm: null,
      });
      // O mesmo aviso que GET /avisos mostra
      const { body } = await http()
        .get('/avisos')
        .set('Authorization', `Bearer ${cliente.token}`)
        .expect(200);
      expect(body).toContainEqual(aviso);
      // Repetir o envio (a fila entrega pelo menos uma vez) não manda de novo
      expect(await app.get(LembretesService).enviar(id)).toBe('repetido');
      await aba.nenhuma('aviso');
    });

    it('token inválido não entra; quem sai para de receber', async () => {
      const n = await montar();
      const aba = await abrir();
      aba.mandar({ tipo: 'entrar', token: 'nao-e-um-token' });
      expect((await aba.proxima('erro')).mensagem).toMatch(/Sessão expirada/);
      // Token de outro segredo (forjado) também não
      const forjado = new JwtService({ secret: 'x'.repeat(40) }).sign({
        sub: cliente.id,
        papel: 'cliente',
      });
      aba.mandar({ tipo: 'entrar', token: forjado });
      await aba.proxima('erro');
      await aba.entrar(cliente.token);
      aba.mandar({ tipo: 'sair' });
      await aba.proxima('saiu');
      await reservar(n);
      await aba.nenhuma('reserva');
    });

    it('sair logo depois de entrar vale, mesmo com o token ainda sendo conferido', async () => {
      const n = await montar();
      const aba = await abrir();
      aba.mandar({ tipo: 'entrar', token: cliente.token });
      aba.mandar({ tipo: 'sair' });
      await aba.proxima('saiu');
      await aba.nenhuma('entrou');
      await reservar(n);
      await aba.nenhuma('reserva');
    });

    it('entrar com duas contas seguidas fica com a última mandada', async () => {
      const n = await montar();
      const aba = await abrir();
      aba.mandar({ tipo: 'entrar', token: cliente.token });
      aba.mandar({ tipo: 'entrar', token: outroCliente.token });
      await aba.proxima('entrou');
      await aba.nenhuma('entrou');
      await reservar(n);
      await aba.nenhuma('reserva');
      await reservar(n, outroCliente, '2026-10-19T10:00:00-03:00');
      await aba.proxima('reserva');
    });

    it('a aba que fecha enquanto o token é conferido não fica ligada à conta', async () => {
      const n = await montar();
      const tempoReal = app.get(TempoReal);
      const antes = tempoReal.abertas;
      const aba = await abrir();
      aba.mandar({ tipo: 'entrar', token: cliente.token });
      aba.fechar();
      await aba.fechou;
      await new Promise((r) => setTimeout(r, 50));
      expect(tempoReal.abertas).toBe(antes);
      const porUsuario = (
        tempoReal as unknown as { porUsuario: Map<string, unknown> }
      ).porUsuario;
      expect(porUsuario.has(cliente.id)).toBe(false);
      // E avisar a conta depois disso não quebra nada
      await reservar(n);
    });

    it('avisa quando o token vence, e entrar de novo volta a receber', async () => {
      const n = await montar();
      const aba = await abrir();
      const curto = app
        .get(JwtService)
        .sign({ sub: cliente.id, papel: 'cliente' }, { expiresIn: 1 });
      aba.mandar({ tipo: 'entrar', token: curto });
      expect((await aba.proxima('entrou')).expiraEm).toBeLessThanOrEqual(1);
      await aba.proxima('sessaoVencida');
      await reservar(n);
      await aba.nenhuma('reserva');
      await aba.entrar(cliente.token);
      await reservar(n, cliente, '2026-10-19T10:00:00-03:00');
      await aba.proxima('reserva');
    });
  });

  describe('o que o navegador manda errado', () => {
    it('responde erro legível para JSON inválido, tipo desconhecido e binário', async () => {
      const aba = await abrir();
      aba.mandar('não é json');
      expect((await aba.proxima('erro')).mensagem).toBe('Mensagem não é JSON');
      aba.mandar({ tipo: 'apagar-tudo' });
      expect((await aba.proxima('erro')).mensagem).toMatch(/use tipo entrar/);
      aba.ws.send(Buffer.from([1, 2, 3]));
      expect((await aba.proxima('erro')).mensagem).toMatch(/texto/);
      // A conexão continua de pé
      await aba.assinar('ainda-aqui');
    });

    it('derruba quem manda mensagens demais', async () => {
      const aba = await abrir();
      for (let i = 0; i <= MENSAGENS_POR_JANELA; i++) {
        aba.mandar({ tipo: 'sair' });
      }
      expect(await aba.fechou).toEqual({
        codigo: 1008,
        motivo: 'Mensagens demais',
      });
    });

    it('derruba quem manda uma mensagem grande demais', async () => {
      const aba = await abrir();
      aba.mandar({
        tipo: 'entrar',
        token: 'x'.repeat(TAMANHO_MAXIMO_DA_MENSAGEM),
      });
      // 1009 = mensagem grande demais
      expect((await aba.fechou).codigo).toBe(1009);
    });

    it('outro caminho não abre WebSocket', async () => {
      await expect(abrir(url.replace('/tempo-real', '/outro'))).rejects.toThrow(
        'HTTP 404',
      );
    });

    it('fecha a conexão e libera tudo quando o navegador sai', async () => {
      const tempoReal = app.get(TempoReal);
      const antes = tempoReal.abertas;
      const aba = await abrir();
      await aba.entrar(cliente.token);
      await aba.assinar('qualquer');
      expect(tempoReal.abertas).toBe(antes + 1);
      aba.fechar();
      await aba.fechou;
      await new Promise((r) => setTimeout(r, 50));
      expect(tempoReal.abertas).toBe(antes);
    });
  });

  describe('limites da aplicação', () => {
    it('recusa com 429 a conexão além do limite por IP, e libera quando uma fecha', async () => {
      const limitado = await criarApp({ CONEXOES_POR_IP: '2' });
      try {
        await limitado.listen(0, '127.0.0.1');
        const { port } = (
          limitado.getHttpServer() as Server
        ).address() as AddressInfo;
        const endereco = `ws://127.0.0.1:${port}/tempo-real`;
        const primeira = await abrir(endereco);
        await abrir(endereco);
        await expect(abrir(endereco)).rejects.toThrow('HTTP 429');
        primeira.fechar();
        await primeira.fechou;
        await new Promise((r) => setTimeout(r, 50));
        await abrir(endereco);
      } finally {
        for (const navegador of abertos.splice(0)) navegador.fechar();
        await limitado.close();
      }
    });

    it('quem corta a conexão (RST) no meio da recusa não derruba a API', async () => {
      const limitado = await criarApp({ CONEXOES_POR_IP: '1' });
      try {
        await limitado.listen(0, '127.0.0.1');
        const { port } = (
          limitado.getHttpServer() as Server
        ).address() as AddressInfo;
        const cortar = async (caminho: string) => {
          const tcp = connect(port, '127.0.0.1');
          await new Promise((r) => tcp.once('connect', r));
          tcp.write(
            `GET ${caminho} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n` +
              'Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\n' +
              `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`,
          );
          tcp.resetAndDestroy();
        };
        const endereco = `ws://127.0.0.1:${port}/tempo-real`;
        await abrir(endereco); // ocupa o limite: os próximos caem no 429
        for (let i = 0; i < 20; i++) {
          await cortar('/outro');
          await cortar('/tempo-real');
        }
        await new Promise((r) => setTimeout(r, 200));
        await request(limitado.getHttpServer() as App)
          .get('/saude')
          .expect(200);
      } finally {
        for (const navegador of abertos.splice(0)) navegador.fechar();
        await limitado.close();
      }
    });

    it('conta o IP do X-Forwarded-For só quando vem do proxy confiável', async () => {
      const conferir = async (confianca: string, separados: boolean) => {
        const limitado = await criarApp({
          CONEXOES_POR_IP: '1',
          CONFIANCA_NO_PROXY: confianca,
        });
        try {
          await limitado.listen(0, '127.0.0.1');
          const { port } = (
            limitado.getHttpServer() as Server
          ).address() as AddressInfo;
          const endereco = `ws://127.0.0.1:${port}/tempo-real`;
          await abrir(endereco, { 'X-Forwarded-For': '203.0.113.1' });
          const segunda = abrir(endereco, { 'X-Forwarded-For': '203.0.113.2' });
          if (separados) await segunda;
          else await expect(segunda).rejects.toThrow('HTTP 429');
        } finally {
          for (const navegador of abertos.splice(0)) navegador.fechar();
          await limitado.close();
        }
      };
      // O teste conecta de 127.0.0.1: com loopback confiável, cada IP real tem o seu limite
      await conferir('loopback', true);
      // Sem confiar em quem conecta, o cabeçalho é ignorado (senão qualquer um forjaria o IP)
      await conferir('10.9.9.9', false);
    });

    it('avisa quem está conectado quando o servidor desliga (1001)', async () => {
      const outra = await criarApp();
      await outra.listen(0, '127.0.0.1');
      const { port } = (
        outra.getHttpServer() as Server
      ).address() as AddressInfo;
      const aba = await Navegador.abrir(`ws://127.0.0.1:${port}/tempo-real`);
      await outra.close();
      expect(await aba.fechou).toEqual({
        codigo: 1001,
        motivo: 'Servidor reiniciando',
      });
    });

    it('não espera para sempre o navegador que não responde ao fechamento', async () => {
      const outra = await criarApp();
      await outra.listen(0, '127.0.0.1');
      const { port } = (
        outra.getHttpServer() as Server
      ).address() as AddressInfo;
      const aba = await Navegador.abrir(`ws://127.0.0.1:${port}/tempo-real`);
      // Aba congelada: não lê mais nada, então nunca responde ao pedido de fechar
      const tcp = (aba.ws as unknown as { _socket: Socket })._socket;
      tcp.pause();
      const inicio = Date.now();
      await outra.close();
      expect(Date.now() - inicio).toBeLessThan(ESPERA_AO_DESLIGAR_MS + 2000);
      tcp.resume();
      await aba.fechou;
    });
  });
});
