import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Redis } from 'ioredis';
import { inject } from 'vitest';
import { PrismaService } from '../src/banco/prisma.service.js';
import { RELOGIO } from '../src/comum/relogio.js';
import { FilaDeLembretes } from '../src/lembretes/fila.js';
import {
  FOLGA_DA_CONFERENCIA_MS,
  LembretesService,
} from '../src/lembretes/lembretes.service.js';
import { TrabalhadorDeLembretes } from '../src/lembretes/trabalhador.js';
import { novaConta, type Conta } from './ajudantes.js';
import { criarApp } from './app.js';

/** Segunda-feira, 12/10/2026, 08:00 em São Paulo */
const SEGUNDA_8H = new Date('2026-10-12T08:00:00-03:00');
/** A reserva padrão: segunda seguinte, 19/10, 09:00 (lembrete no domingo 18/10, 09:00) */
const INICIO = '2026-10-19T09:00:00-03:00';
const LEMBRETE = new Date('2026-10-18T09:00:00-03:00');
let agora = SEGUNDA_8H;
const relogio = { agora: () => agora };

/** Repete `conferir` até dar certo ou acabar o tempo (o trabalhador roda por conta própria) */
async function esperar<T>(
  conferir: () => Promise<T | undefined>,
  limiteMs = 10_000,
): Promise<T> {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const resultado = await conferir();
    if (resultado !== undefined) return resultado;
    if (Date.now() > fim) throw new Error('o tempo acabou');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('lembretes', () => {
  let app: INestApplication<App>;
  let dono: Conta;
  let cliente: Conta;
  let prisma: PrismaService;
  let fila: FilaDeLembretes;
  let lembretes: LembretesService;

  const http = () => request(app.getHttpServer());
  const como = (conta: Conta) => ({
    get: (url: string) =>
      http().get(url).set('Authorization', `Bearer ${conta.token}`),
    post: (url: string) =>
      http().post(url).set('Authorization', `Bearer ${conta.token}`),
    put: (url: string) =>
      http().put(url).set('Authorization', `Bearer ${conta.token}`),
  });

  /** Barbearia com a Ana (segunda, 09-12) fazendo Corte (30 min) */
  async function montar(a: INestApplication<App> = app, d: Conta = dono) {
    const comoDono = (url: string) =>
      request(a.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${d.token}`);
    const negocio = (
      await comoDono('/negocios')
        .send({ nome: 'Barbearia', slug: `lem-${randomUUID()}` })
        .expect(201)
    ).body as { id: string; slug: string };
    const base = `/negocios/${negocio.id}`;
    const corte = (
      await comoDono(`${base}/servicos`)
        .send({ nome: 'Corte', duracaoMin: 30, precoCentavos: 3500 })
        .expect(201)
    ).body as { id: string };
    const ana = (
      await comoDono(`${base}/profissionais`).send({ nome: 'Ana' }).expect(201)
    ).body as { id: string };
    const put = (url: string) =>
      request(a.getHttpServer())
        .put(url)
        .set('Authorization', `Bearer ${d.token}`);
    await put(`${base}/profissionais/${ana.id}/servicos`)
      .send({ servicoIds: [corte.id] })
      .expect(200);
    await put(`${base}/profissionais/${ana.id}/horarios`)
      .send({ horarios: [{ diaDaSemana: 1, inicio: '09:00', fim: '12:00' }] })
      .expect(200);
    return { ...negocio, corte };
  }

  type Montado = Awaited<ReturnType<typeof montar>>;

  async function reservar(
    n: Montado,
    inicio = INICIO,
    conta = cliente,
    a = app,
  ): Promise<string> {
    const { body } = await request(a.getHttpServer())
      .post(`/negocios/${n.slug}/reservas`)
      .set('Authorization', `Bearer ${conta.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ servicoId: n.corte.id, inicio })
      .expect(201);
    return (body as { id: string }).id;
  }

  const lembreteEm = async (reservaId: string) =>
    (await prisma.reserva.findUniqueOrThrow({ where: { id: reservaId } }))
      .lembreteEm;

  const avisosDa = (reservaId: string) =>
    prisma.aviso.findMany({ where: { reservaId } });

  beforeAll(async () => {
    app = await criarApp({}, (m) =>
      m.overrideProvider(RELOGIO).useValue(relogio),
    );
    prisma = app.get(PrismaService);
    fila = app.get(FilaDeLembretes);
    lembretes = app.get(LembretesService);
    [dono, cliente] = await Promise.all([
      novaConta(app, 'dono'),
      novaConta(app, 'cliente'),
    ]);
  });

  afterEach(() => {
    agora = SEGUNDA_8H;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('agendar', () => {
    it('agenda o lembrete para 24 h antes, com o id da reserva', async () => {
      const id = await reservar(await montar());
      expect(await lembreteEm(id)).toEqual(LEMBRETE);
      const tarefa = await fila.tarefa(id);
      expect(tarefa?.data).toEqual({ reservaId: id });
      expect(await tarefa?.isDelayed()).toBe(true);
      // A espera é contada a partir do relógio da aplicação: 6 dias e 1 hora
      expect(tarefa?.delay).toBe(LEMBRETE.getTime() - SEGUNDA_8H.getTime());
    });

    it('não agenda nada para quem reserva com menos de 24 h', async () => {
      const id = await reservar(await montar(), '2026-10-12T10:00:00-03:00');
      expect(await lembreteEm(id)).toBeNull();
      expect(await fila.tarefa(id)).toBeUndefined();
    });

    it('cancelar tira o lembrete da fila', async () => {
      const id = await reservar(await montar());
      expect(await fila.tarefa(id)).toBeDefined();
      await como(cliente).post(`/reservas/${id}/cancelar`).expect(200);
      expect(await fila.tarefa(id)).toBeUndefined();
    });
  });

  describe('enviar', () => {
    it('na hora marcada, o trabalhador grava o aviso para o cliente', async () => {
      const n = await montar();
      // O lembrete vence 1,5 s depois de reservar (no relógio de verdade)
      agora = new Date(LEMBRETE.getTime() - 1_500);
      const id = await reservar(n);
      const [aviso] = await esperar(async () => {
        const avisos = await avisosDa(id);
        return avisos.length ? avisos : undefined;
      });
      expect(aviso).toMatchObject({
        usuarioId: cliente.id,
        tipo: 'lembrete',
        texto: 'Lembrete: Corte com Ana em Barbearia, 19/10 às 09:00',
        lidoEm: null,
      });
      // Feito, sai do Redis (o registro que vale é o do banco)
      await esperar(async () => ((await fila.tarefa(id)) ? undefined : true));
    });

    it('repetir o envio (a fila entrega pelo menos uma vez) não duplica o aviso', async () => {
      const id = await reservar(await montar());
      agora = LEMBRETE;
      const envios = await Promise.all(
        Array.from({ length: 10 }, () => lembretes.enviar(id)),
      );
      expect(envios.filter((e) => e === 'enviado')).toHaveLength(1);
      expect(envios.filter((e) => e === 'repetido')).toHaveLength(9);
      expect(await avisosDa(id)).toHaveLength(1);
    });

    it('não lembra reserva cancelada, nem a que já começou', async () => {
      const n = await montar();
      const cancelada = await reservar(n);
      await como(cliente).post(`/reservas/${cancelada}/cancelar`).expect(200);
      const passada = await reservar(n, '2026-10-19T10:00:00-03:00');
      agora = new Date('2026-10-19T10:00:00-03:00');
      expect(await lembretes.enviar(cancelada)).toBe('dispensado');
      expect(await lembretes.enviar(passada)).toBe('dispensado');
      expect(await lembretes.enviar(randomUUID())).toBe('dispensado');
      expect(await avisosDa(cancelada)).toHaveLength(0);
      expect(await avisosDa(passada)).toHaveLength(0);
    });

    it('um cancelamento em andamento faz o envio esperar e desistir (sem lembrete de reserva cancelada)', async () => {
      const id = await reservar(await montar());
      agora = LEMBRETE;
      let envio: Promise<string> | undefined;
      let terminou = false;
      await prisma.$transaction(async (tx) => {
        // O cancelamento mudou o status mas ainda não confirmou a transação
        await tx.reserva.update({
          where: { id },
          data: { status: 'cancelada', canceladaEm: agora },
        });
        envio = lembretes.enviar(id).finally(() => (terminou = true));
        await new Promise((r) => setTimeout(r, 300));
        // Sem a trava, o envio leria o status antigo ("confirmada") e gravaria o aviso
        expect(terminou).toBe(false);
      });
      expect(await envio).toBe('dispensado');
      expect(await avisosDa(id)).toHaveLength(0);
    });
  });

  describe('conferência', () => {
    it('envia o lembrete que a fila perdeu, depois da folga', async () => {
      const id = await reservar(await montar());
      // Simula o Redis perdendo a tarefa
      await fila.desagendar(id);
      const trabalhador = app.get(TrabalhadorDeLembretes);

      // Ainda dentro da folga: a fila pode estar entregando, a conferência não se mete
      agora = new Date(LEMBRETE.getTime() + FOLGA_DA_CONFERENCIA_MS - 1);
      await trabalhador.conferir();
      expect(await avisosDa(id)).toHaveLength(0);

      agora = new Date(LEMBRETE.getTime() + FOLGA_DA_CONFERENCIA_MS);
      await trabalhador.conferir();
      expect(await avisosDa(id)).toHaveLength(1);
    });

    it('não envia depois que o atendimento começou', async () => {
      const id = await reservar(await montar());
      await fila.desagendar(id);
      agora = new Date(INICIO);
      await app.get(TrabalhadorDeLembretes).conferir();
      expect(await avisosDa(id)).toHaveLength(0);
    });
  });

  it('com o Redis congelado (conexão aberta, sem resposta), a reserva desiste dele e sai', async () => {
    const n = await montar();
    const outra = new Redis(inject('urlDoRedis'));
    try {
      // Segura todos os comandos de todos os clientes por 4 s; a conexão continua "ready"
      await outra.call('CLIENT', 'PAUSE', '4000', 'ALL');
      const antes = Date.now();
      const id = await reservar(n);
      expect(Date.now() - antes).toBeLessThan(3_500);
      expect(await lembreteEm(id)).toEqual(LEMBRETE);
    } finally {
      await outra.call('CLIENT', 'UNPAUSE');
      outra.disconnect();
    }
  });

  describe('com o Redis fora do ar', () => {
    let semRedis: INestApplication<App>;

    beforeAll(async () => {
      // Porta onde nada escuta: o Redis "caiu"
      semRedis = await criarApp({ REDIS_URL: 'redis://127.0.0.1:1' }, (m) =>
        m.overrideProvider(RELOGIO).useValue(relogio),
      );
    });

    afterAll(async () => {
      await semRedis.close();
    });

    it('a reserva sai na hora, e o lembrete sai pela conferência', async () => {
      const d = await novaConta(semRedis, 'dono');
      const c = await novaConta(semRedis, 'cliente');
      const n = await montar(semRedis, d);
      const antes = Date.now();
      const id = await reservar(n, INICIO, c, semRedis);
      // Não espera o Redis voltar: falha rápido e segue
      expect(Date.now() - antes).toBeLessThan(1_500);
      expect(await lembreteEm(id)).toEqual(LEMBRETE);

      agora = new Date(LEMBRETE.getTime() + FOLGA_DA_CONFERENCIA_MS);
      await semRedis.get(TrabalhadorDeLembretes).conferir();
      expect(await avisosDa(id)).toHaveLength(1);
    });

    it('o /saude continua 200 e mostra a fila fora do ar', async () => {
      const { body } = await request(semRedis.getHttpServer())
        .get('/saude')
        .expect(200);
      expect(body).toEqual({ status: 'ok', banco: 'ok', fila: 'fora do ar' });
    });
  });

  describe('GET /avisos', () => {
    it('mostra só os avisos de quem está logado e marca como lido', async () => {
      const id = await reservar(await montar());
      agora = LEMBRETE;
      await lembretes.enviar(id);
      const outro = await novaConta(app, 'cliente');

      const { body } = await como(cliente).get('/avisos').expect(200);
      const aviso = (body as { reservaId: string; id: string }[]).find(
        (a) => a.reservaId === id,
      );
      expect(aviso).toEqual({
        id: expect.any(String),
        tipo: 'lembrete',
        texto: 'Lembrete: Corte com Ana em Barbearia, 19/10 às 09:00',
        reservaId: id,
        reservaCancelada: false,
        criadoEm: expect.any(String),
        lidoEm: null,
      });
      expect((await como(outro).get('/avisos').expect(200)).body).toEqual([]);

      // De outra pessoa: 404, como se não existisse
      await como(outro).post(`/avisos/${aviso!.id}/lido`).expect(404);
      const lido = await como(cliente)
        .post(`/avisos/${aviso!.id}/lido`)
        .expect(200);
      expect(lido.body.lidoEm).toBe(LEMBRETE.toISOString());
      // Repetir não muda a data
      agora = new Date(LEMBRETE.getTime() + 60_000);
      const deNovo = await como(cliente)
        .post(`/avisos/${aviso!.id}/lido`)
        .expect(200);
      expect(deNovo.body.lidoEm).toBe(LEMBRETE.toISOString());
    });

    it('avisa quando a reserva foi cancelada depois do lembrete', async () => {
      const id = await reservar(await montar());
      agora = LEMBRETE;
      expect(await lembretes.enviar(id)).toBe('enviado');
      await como(cliente).post(`/reservas/${id}/cancelar`).expect(200);
      const { body } = await como(cliente).get('/avisos').expect(200);
      const aviso = (body as { reservaId: string }[]).find(
        (a) => a.reservaId === id,
      );
      expect(aviso).toMatchObject({ reservaCancelada: true });
    });

    it('pede login', async () => {
      await http().get('/avisos').expect(401);
    });
  });
});
