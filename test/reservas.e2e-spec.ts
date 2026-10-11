import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/banco/prisma.service.js';
import { RELOGIO } from '../src/comum/relogio.js';
import { novaConta, type Conta } from './ajudantes.js';
import { criarApp } from './app.js';

/** Segunda-feira, 12/10/2026, 08:00 em São Paulo */
const SEGUNDA_8H = new Date('2026-10-12T08:00:00-03:00');
let agora = SEGUNDA_8H;
const as = (hora: string, data = '2026-10-12') => `${data}T${hora}:00-03:00`;

describe('reservas', () => {
  let app: INestApplication<App>;
  let dono: Conta;
  let cliente: Conta;

  const http = () => request(app.getHttpServer());
  const autenticado = (conta: Conta) => ({
    get: (url: string) =>
      http().get(url).set('Authorization', `Bearer ${conta.token}`),
    post: (url: string) =>
      http().post(url).set('Authorization', `Bearer ${conta.token}`),
    put: (url: string) =>
      http().put(url).set('Authorization', `Bearer ${conta.token}`),
    patch: (url: string) =>
      http().patch(url).set('Authorization', `Bearer ${conta.token}`),
  });

  /** Ana (seg 09-12) e Bia (seg 10-12); Corte (30 min) só a Ana faz, Barba (60 min) as duas */
  async function montar() {
    const d = autenticado(dono);
    const negocio = (
      await d
        .post('/negocios')
        .send({ nome: 'Barbearia', slug: `res-${randomUUID()}` })
        .expect(201)
    ).body as { id: string; slug: string };
    const base = `/negocios/${negocio.id}`;
    const criar = async (url: string, corpo: object) =>
      (await d.post(url).send(corpo).expect(201)).body as { id: string };
    const corte = await criar(`${base}/servicos`, {
      nome: 'Corte',
      duracaoMin: 30,
      precoCentavos: 3500,
    });
    const barba = await criar(`${base}/servicos`, {
      nome: 'Barba',
      duracaoMin: 60,
      precoCentavos: 2500,
    });
    const ana = await criar(`${base}/profissionais`, { nome: 'Ana' });
    const bia = await criar(`${base}/profissionais`, { nome: 'Bia' });
    for (const [prof, servicos, inicio] of [
      [ana, [corte.id, barba.id], '09:00'],
      [bia, [barba.id], '10:00'],
    ] as const) {
      await d
        .put(`${base}/profissionais/${prof.id}/servicos`)
        .send({ servicoIds: servicos })
        .expect(200);
      await d
        .put(`${base}/profissionais/${prof.id}/horarios`)
        .send({ horarios: [{ diaDaSemana: 1, inicio, fim: '12:00' }] })
        .expect(200);
    }
    return { ...negocio, base, corte, barba, ana, bia };
  }

  type Montado = Awaited<ReturnType<typeof montar>>;

  function reservar(
    conta: Conta,
    n: Montado,
    corpo: Record<string, string>,
    chave: string | null = randomUUID(),
  ) {
    const pedido = autenticado(conta).post(`/negocios/${n.slug}/reservas`);
    if (chave) pedido.set('Idempotency-Key', chave);
    return pedido.send(corpo);
  }

  async function livres(n: Montado, servicoId: string, data = '2026-10-12') {
    const { body } = await http()
      .get(`/negocios/${n.slug}/disponibilidade`)
      .query({ servicoId, data })
      .expect(200);
    return body.horarios as { hora: string; profissionalIds: string[] }[];
  }

  beforeAll(async () => {
    app = await criarApp({}, (m) =>
      m.overrideProvider(RELOGIO).useValue({ agora: () => agora }),
    );
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

  describe('criar', () => {
    it('reserva o horário, guarda o preço do momento e tira o horário da disponibilidade', async () => {
      const n = await montar();
      const { body } = await reservar(cliente, n, {
        servicoId: n.corte.id,
        profissionalId: n.ana.id,
        inicio: as('09:00'),
      }).expect(201);
      expect(body).toEqual({
        id: expect.any(String),
        negocio: { nome: 'Barbearia', slug: n.slug, fuso: 'America/Sao_Paulo' },
        servico: { id: n.corte.id, nome: 'Corte' },
        profissional: { id: n.ana.id, nome: 'Ana' },
        inicio: '2026-10-12T12:00:00.000Z',
        fim: '2026-10-12T12:30:00.000Z',
        precoCentavos: 3500,
        status: 'confirmada',
      });
      // 09:00 e 09:15 (que encostaria na reserva) somem; 09:30 continua
      const horas = (await livres(n, n.corte.id)).map((h) => h.hora);
      expect(horas.slice(0, 2)).toEqual(['09:30', '09:45']);
    });

    it('sem profissional escolhido, fica com quem estiver livre', async () => {
      const n = await montar();
      const { body } = await reservar(cliente, n, {
        servicoId: n.barba.id,
        inicio: as('10:00'),
      }).expect(201);
      expect([n.ana.id, n.bia.id]).toContain(body.profissional.id);
      const dez = (await livres(n, n.barba.id)).find((h) => h.hora === '10:00');
      expect(dez?.profissionalIds).toHaveLength(1);
    });

    it('exige login e o cabeçalho Idempotency-Key', async () => {
      const n = await montar();
      const corpo = { servicoId: n.corte.id, inicio: as('09:00') };
      await http()
        .post(`/negocios/${n.slug}/reservas`)
        .set('Idempotency-Key', randomUUID())
        .send(corpo)
        .expect(401);
      const sem = await reservar(cliente, n, corpo, null).expect(400);
      expect(sem.body.message).toMatch(/Idempotency-Key/);
      await reservar(cliente, n, corpo, 'curta').expect(400);
    });

    it.each([
      ['fora do passo de 15 min', '09:05', '2026-10-12'],
      ['antes do expediente', '08:30', '2026-10-12'],
      ['em dia sem expediente', '09:00', '2026-10-13'],
      ['que já passou', '09:00', '2026-10-05'],
    ])('recusa horário %s (409)', async (_caso, hora, data) => {
      const n = await montar();
      await reservar(cliente, n, {
        servicoId: n.corte.id,
        inicio: as(hora, data),
      }).expect(409);
    });

    it('recusa horário bloqueado e profissional que não faz o serviço', async () => {
      const n = await montar();
      await autenticado(dono)
        .post(`${n.base}/bloqueios`)
        .send({
          profissionalId: n.ana.id,
          inicio: as('09:00'),
          fim: as('10:00'),
        })
        .expect(201);
      await reservar(cliente, n, {
        servicoId: n.corte.id,
        inicio: as('09:30'),
      }).expect(409);
      await reservar(cliente, n, {
        servicoId: n.corte.id,
        profissionalId: n.bia.id,
        inicio: as('10:30'),
      }).expect(409);
    });

    it('serviço de outro negócio é 404; mais de 60 dias à frente é 400', async () => {
      const a = await montar();
      const b = await montar();
      await reservar(cliente, a, {
        servicoId: b.corte.id,
        inicio: as('09:00'),
      }).expect(404);
      await reservar(cliente, a, {
        servicoId: a.corte.id,
        inicio: as('09:00', '2026-12-14'),
      }).expect(400);
    });
  });

  describe('idempotência', () => {
    it('o mesmo pedido com a mesma chave devolve a mesma reserva (200), sem criar outra', async () => {
      const n = await montar();
      const chave = randomUUID();
      const corpo = { servicoId: n.corte.id, inicio: as('09:00') };
      const primeira = await reservar(cliente, n, corpo, chave).expect(201);
      const segunda = await reservar(cliente, n, corpo, chave).expect(200);
      expect(segunda.body).toEqual(primeira.body);
    });

    it('a mesma chave com outro pedido é 422', async () => {
      const n = await montar();
      const chave = randomUUID();
      await reservar(
        cliente,
        n,
        { servicoId: n.corte.id, inicio: as('09:00') },
        chave,
      ).expect(201);
      const outro = await reservar(
        cliente,
        n,
        { servicoId: n.corte.id, inicio: as('10:00') },
        chave,
      ).expect(422);
      expect(outro.body.message).toMatch(/outro pedido/);
    });

    it('a mesma chave de outro cliente não interfere', async () => {
      const n = await montar();
      const outro = await novaConta(app, 'cliente');
      const chave = randomUUID();
      await reservar(
        cliente,
        n,
        { servicoId: n.corte.id, inicio: as('09:00') },
        chave,
      ).expect(201);
      await reservar(
        outro,
        n,
        { servicoId: n.corte.id, inicio: as('10:00') },
        chave,
      ).expect(201);
    });

    it('clique duplo: 10 envios simultâneos do mesmo pedido criam uma reserva só', async () => {
      const n = await montar();
      const chave = randomUUID();
      const corpo = { servicoId: n.corte.id, inicio: as('11:00') };
      const respostas = await Promise.all(
        Array.from({ length: 10 }, () => reservar(cliente, n, corpo, chave)),
      );
      expect(respostas.every((r) => r.status === 200 || r.status === 201)).toBe(
        true,
      );
      expect(respostas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(new Set(respostas.map((r) => r.body.id)).size).toBe(1);
    });
  });

  it('clique duplo sem profissional escolhido (duas livres): ainda uma reserva só', async () => {
    // A cópia atrasada pode ir para a outra profissional e esbarrar na chave única (23505)
    const n = await montar();
    const eu = await novaConta(app, 'cliente');
    const chave = randomUUID();
    const corpo = { servicoId: n.barba.id, inicio: as('10:00') };
    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => reservar(eu, n, corpo, chave)),
    );
    expect(respostas.every((r) => r.status === 200 || r.status === 201)).toBe(
      true,
    );
    expect(new Set(respostas.map((r) => r.body.id)).size).toBe(1);
    const noBanco = await app.get(PrismaService).reserva.count({
      where: { clienteId: eu.id, status: 'confirmada' },
    });
    expect(noBanco).toBe(1);
  });

  describe('sem reserva dupla', () => {
    it('50 clientes disputando o mesmo horário: exatamente um consegue', async () => {
      const n = await montar();
      const clientes = await Promise.all(
        Array.from({ length: 50 }, () => novaConta(app, 'cliente')),
      );
      const respostas = await Promise.all(
        clientes.map((c) =>
          reservar(c, n, {
            servicoId: n.corte.id,
            profissionalId: n.ana.id,
            inicio: as('09:00'),
          }),
        ),
      );
      const status = respostas.map((r) => r.status);
      expect(status.filter((s) => s === 201)).toHaveLength(1);
      expect(status.filter((s) => s === 409)).toHaveLength(49);
      const noBanco = await app.get(PrismaService).reserva.count({
        where: { profissionalId: n.ana.id, status: 'confirmada' },
      });
      expect(noBanco).toBe(1);
    });

    it('com duas profissionais livres, dois de vários clientes conseguem, um com cada', async () => {
      const n = await montar();
      const clientes = await Promise.all(
        Array.from({ length: 6 }, () => novaConta(app, 'cliente')),
      );
      const respostas = await Promise.all(
        clientes.map((c) =>
          reservar(c, n, { servicoId: n.barba.id, inicio: as('10:00') }),
        ),
      );
      const ganhadores = respostas.filter((r) => r.status === 201);
      expect(ganhadores).toHaveLength(2);
      expect(
        ganhadores
          .map((r) => r.body.profissional.id as string)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual([n.ana.id, n.bia.id].sort((a, b) => a.localeCompare(b)));
      expect(respostas.filter((r) => r.status === 409)).toHaveLength(4);
    });

    it('serviços diferentes que se sobrepõem no mesmo profissional também colidem', async () => {
      const n = await montar();
      // Barba 10:00-11:00 com a Ana; Corte 10:30 com a Ana fica de fora
      await reservar(cliente, n, {
        servicoId: n.barba.id,
        profissionalId: n.ana.id,
        inicio: as('10:00'),
      }).expect(201);
      await reservar(cliente, n, {
        servicoId: n.corte.id,
        profissionalId: n.ana.id,
        inicio: as('10:30'),
      }).expect(409);
    });

    it('o banco recusa a sobreposição mesmo sem passar pela API', async () => {
      const n = await montar();
      const { body } = await reservar(cliente, n, {
        servicoId: n.corte.id,
        profissionalId: n.ana.id,
        inicio: as('09:00'),
      }).expect(201);
      const prisma = app.get(PrismaService);
      const original = await prisma.reserva.findUniqueOrThrow({
        where: { id: body.id },
      });
      const { id: _id, criadoEm: _c, ...copia } = original;
      await expect(
        prisma.reserva.create({
          data: {
            ...copia,
            inicio: new Date('2026-10-12T12:15:00Z'),
            fim: new Date('2026-10-12T12:45:00Z'),
            chaveIdempotencia: randomUUID(),
          },
        }),
      ).rejects.toMatchObject({
        meta: { driverAdapterError: { cause: { originalCode: '23P01' } } },
      });
      // Cancelada não ocupa: a mesma cópia passa depois de cancelar a original
      await prisma.reserva.update({
        where: { id: body.id },
        data: { status: 'cancelada', canceladaEm: new Date() },
      });
      await prisma.reserva.create({
        data: { ...copia, chaveIdempotencia: randomUUID() },
      });
    });
  });

  describe('cancelar', () => {
    async function reservaDas(n: Montado, hora = '11:00') {
      const { body } = await reservar(cliente, n, {
        servicoId: n.corte.id,
        profissionalId: n.ana.id,
        inicio: as(hora),
      }).expect(201);
      return body.id as string;
    }

    it('o cliente cancela até 2 h antes e o horário volta a ficar livre', async () => {
      const n = await montar();
      const id = await reservaDas(n);
      const { body } = await autenticado(cliente)
        .post(`/reservas/${id}/cancelar`)
        .expect(200);
      expect(body.status).toBe('cancelada');
      expect((await livres(n, n.corte.id)).map((h) => h.hora)).toContain(
        '11:00',
      );
      // Cancelar de novo não é erro
      await autenticado(cliente).post(`/reservas/${id}/cancelar`).expect(200);
    });

    it('com menos de 2 h, só o dono cancela', async () => {
      const n = await montar();
      const id = await reservaDas(n);
      agora = new Date(as('09:30'));
      const recusa = await autenticado(cliente)
        .post(`/reservas/${id}/cancelar`)
        .expect(422);
      expect(recusa.body.message).toMatch(/2 h antes/);
      await autenticado(dono).post(`/reservas/${id}/cancelar`).expect(200);
    });

    it('depois que começou, ninguém cancela', async () => {
      const n = await montar();
      const id = await reservaDas(n);
      agora = new Date(as('11:00'));
      await autenticado(dono).post(`/reservas/${id}/cancelar`).expect(422);
    });

    it('quem não é o cliente nem o dono recebe 404', async () => {
      const n = await montar();
      const id = await reservaDas(n);
      const [estranho, outroDono] = await Promise.all([
        novaConta(app, 'cliente'),
        novaConta(app, 'dono'),
      ]);
      await autenticado(estranho).post(`/reservas/${id}/cancelar`).expect(404);
      await autenticado(outroDono).post(`/reservas/${id}/cancelar`).expect(404);
      await autenticado(cliente)
        .post(`/reservas/${randomUUID()}/cancelar`)
        .expect(404);
    });
  });

  describe('listas', () => {
    it('o cliente vê só as próprias, separadas em próximas e anteriores', async () => {
      const n = await montar();
      const eu = await novaConta(app, 'cliente');
      const outro = await novaConta(app, 'cliente');
      await reservar(eu, n, {
        servicoId: n.corte.id,
        inicio: as('09:00'),
      }).expect(201);
      await reservar(outro, n, {
        servicoId: n.corte.id,
        inicio: as('10:00'),
      }).expect(201);
      const proximas = await autenticado(eu).get('/reservas').expect(200);
      expect(proximas.body.map((r: { inicio: string }) => r.inicio)).toEqual([
        '2026-10-12T12:00:00.000Z',
      ]);
      agora = new Date(as('15:00'));
      expect((await autenticado(eu).get('/reservas').expect(200)).body).toEqual(
        [],
      );
      const anteriores = await autenticado(eu)
        .get('/reservas')
        .query({ periodo: 'anteriores' })
        .expect(200);
      expect(anteriores.body).toHaveLength(1);
    });

    it('o dono vê a agenda com quem reservou; outro dono não, cliente não', async () => {
      const n = await montar();
      await reservar(cliente, n, {
        servicoId: n.corte.id,
        inicio: as('09:00'),
      }).expect(201);
      const { body } = await autenticado(dono)
        .get(`${n.base}/agenda`)
        .expect(200);
      expect(body).toEqual([
        expect.objectContaining({
          servico: { id: n.corte.id, nome: 'Corte' },
          cliente: {
            nome: 'Cliente',
            email: expect.stringMatching(/@exemplo\.com$/),
          },
          status: 'confirmada',
        }),
      ]);
      const outroDono = await novaConta(app, 'dono');
      await autenticado(outroDono).get(`${n.base}/agenda`).expect(404);
      await autenticado(cliente).get(`${n.base}/agenda`).expect(403);
    });

    it('a disponibilidade pública não diz quem reservou', async () => {
      const n = await montar();
      const { body } = await reservar(cliente, n, {
        servicoId: n.corte.id,
        inicio: as('09:00'),
      }).expect(201);
      const resposta = await http()
        .get(`/negocios/${n.slug}/disponibilidade`)
        .query({ servicoId: n.corte.id, data: '2026-10-12' })
        .expect(200);
      expect(JSON.stringify(resposta.body)).not.toContain(cliente.id);
      expect(JSON.stringify(resposta.body)).not.toContain(body.id);
    });
  });
});

describe('limites de pedidos: público e de conta são separados', () => {
  const ip = (pedido: request.Test, endereco: string) =>
    pedido.set('X-Forwarded-For', endereco);

  it('limite público baixo: a vitrine dá 429, o login não', async () => {
    const app = await criarApp({ PEDIDOS_PUBLICOS_POR_MINUTO: '3' });
    try {
      const http = () => request(app.getHttpServer());
      for (let i = 0; i < 3; i++)
        await ip(http().get('/negocios/nao-existe'), '203.0.113.9').expect(404);
      await ip(http().get('/negocios/nao-existe'), '203.0.113.9').expect(429);
      await ip(http().get('/negocios/nao-existe'), '203.0.113.10').expect(404);
      for (let i = 0; i < 5; i++) {
        await ip(http().post('/auth/entrar'), '203.0.113.9')
          .send({ email: 'ninguem@exemplo.com', senha: 'qualquer' })
          .expect(401);
      }
    } finally {
      await app.close();
    }
  });

  it('limite de conta baixo: o login dá 429, a vitrine e a disponibilidade não', async () => {
    const app = await criarApp({ PEDIDOS_DE_CONTA_POR_MINUTO: '1' });
    try {
      const http = () => request(app.getHttpServer());
      const entrar = () =>
        ip(http().post('/auth/entrar'), '203.0.113.20').send({
          email: 'ninguem@exemplo.com',
          senha: 'qualquer',
        });
      await entrar().expect(401);
      await entrar().expect(429);
      for (let i = 0; i < 3; i++) {
        await ip(http().get('/negocios/nao-existe'), '203.0.113.20').expect(
          404,
        );
        await ip(
          http()
            .get('/negocios/nao-existe/disponibilidade')
            .query({ servicoId: randomUUID(), data: '2026-10-12' }),
          '203.0.113.20',
        ).expect(404);
      }
    } finally {
      await app.close();
    }
  });
});
