import type { INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { inject } from 'vitest';
import { gerarHashDeSenha } from '../src/auth/senha.js';
import { PrismaService } from '../src/banco/prisma.service.js';
import { DOMINIO_DA_DEMO, SLUG_DA_DEMO } from '../src/demo/demo.js';
import { CADASTRO_FECHADO_NA_DEMO } from '../src/demo/guards.js';
import { executar, semearDemo } from '../src/demo/semeadura.js';
import { dataLocal, textoDaData } from '../src/disponibilidade/fuso.js';
import { criarApp } from './app.js';

/**
 * A semeadura recusa um banco com contas de verdade, e os outros arquivos enchem o banco
 * comum de contas: a demonstração ganha um banco só dela, no mesmo Postgres. O relógio aqui é
 * o de verdade, como na semeadura em produção.
 */
async function bancoNovo(): Promise<string> {
  const url = new URL(inject('urlDoBanco'));
  const nome = `demo_${randomBytes(4).toString('hex')}`;
  const cliente = new pg.Client({ connectionString: url.toString() });
  await cliente.connect();
  await cliente.query(`CREATE DATABASE ${nome}`);
  await cliente.end();
  url.pathname = `/${nome}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
  return url.toString();
}

interface Sessao {
  id: string;
  email: string;
  token: string;
  cookie: string;
}

describe('demonstração', () => {
  let urlDaDemo: string;
  let demo: INestApplication<App>;
  let fora: INestApplication<App>;
  let prisma: PrismaService;

  const http = (app = demo) => request(app.getHttpServer());

  async function visitante(papel: 'cliente' | 'dono'): Promise<Sessao> {
    const resposta = await http()
      .post('/auth/visitante')
      .send({ papel })
      .expect(200);
    const cookie = ([] as string[])
      .concat(resposta.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('cadence_renovacao='));
    expect(cookie).toBeDefined();
    expect(resposta.body.usuario.papel).toBe(papel);
    return {
      id: resposta.body.usuario.id,
      email: resposta.body.usuario.email,
      token: resposta.body.tokenDeAcesso,
      cookie: cookie!.split(';')[0],
    };
  }

  const como = (s: Sessao) => ({
    get: (url: string) =>
      http().get(url).set('Authorization', `Bearer ${s.token}`),
    post: (url: string) =>
      http().post(url).set('Authorization', `Bearer ${s.token}`),
    patch: (url: string) =>
      http().patch(url).set('Authorization', `Bearer ${s.token}`),
  });

  /** O primeiro horário livre de Corte nos próximos dias (a semeadura deixa a grade parcial) */
  async function horarioLivre() {
    const vitrine = (await http().get(`/negocios/${SLUG_DA_DEMO}`).expect(200))
      .body as { servicos: { id: string; nome: string }[] };
    const corte = vitrine.servicos.find((s) => s.nome === 'Corte')!;
    for (let d = 1; d <= 7; d++) {
      const data = textoDaData(
        dataLocal(new Date(Date.now() + d * 86_400_000), 'America/Sao_Paulo'),
      );
      const { body } = await http()
        .get(`/negocios/${SLUG_DA_DEMO}/disponibilidade`)
        .query({ servicoId: corte.id, data })
        .expect(200);
      if (body.horarios.length > 0) {
        return { servicoId: corte.id, inicio: body.horarios[0].inicio };
      }
    }
    throw new Error('nenhum horário livre na semana da demonstração');
  }

  /**
   * Reserva o primeiro horário livre. O horário vem antes de montar o pedido: o supertest abre
   * o servidor ao criar o pedido, e os pedidos da busca o fechariam no meio.
   */
  async function reservar(s: Sessao, status: number) {
    const corpo = await horarioLivre();
    return como(s)
      .post(`/negocios/${SLUG_DA_DEMO}/reservas`)
      .set('Idempotency-Key', randomUUID())
      .send(corpo)
      .expect(status);
  }

  /** O estado da demonstração sem ids nem datas de criação (para comparar duas semeaduras) */
  async function retrato() {
    const negocio = await prisma.negocio.findUniqueOrThrow({
      where: { slug: SLUG_DA_DEMO },
      include: {
        dono: { select: { email: true } },
        servicos: { orderBy: { nome: 'asc' } },
        profissionais: {
          orderBy: { nome: 'asc' },
          include: {
            horarios: {
              orderBy: [{ diaDaSemana: 'asc' }, { inicioMin: 'asc' }],
            },
            servicos: { include: { servico: { select: { nome: true } } } },
          },
        },
        bloqueios: { include: { profissional: { select: { nome: true } } } },
        reservas: {
          orderBy: [{ inicio: 'asc' }, { profissionalId: 'asc' }],
          include: {
            cliente: { select: { email: true } },
            profissional: { select: { nome: true } },
            servico: { select: { nome: true } },
          },
        },
      },
    });
    return {
      negocio: [negocio.nome, negocio.slug, negocio.fuso, negocio.dono.email],
      servicos: negocio.servicos.map((s) => [
        s.nome,
        s.duracaoMin,
        s.precoCentavos,
      ]),
      profissionais: negocio.profissionais.map((p) => ({
        nome: p.nome,
        servicos: p.servicos.map((x) => x.servico.nome).sort(),
        horarios: p.horarios.map((h) => [h.diaDaSemana, h.inicioMin, h.fimMin]),
      })),
      bloqueios: negocio.bloqueios.map((b) => [
        b.profissional?.nome,
        b.inicio.toISOString(),
        b.fim.toISOString(),
      ]),
      reservas: negocio.reservas.map((r) => [
        r.profissional.nome,
        r.servico.nome,
        r.cliente.email,
        r.inicio.toISOString(),
        r.status,
      ]),
      usuarios: (await prisma.usuario.findMany({ select: { email: true } }))
        .map((u) => u.email)
        .sort(),
      negocios: await prisma.negocio.count(),
    };
  }

  beforeAll(async () => {
    urlDaDemo = await bancoNovo();
    fora = await criarApp();
    demo = await criarApp({ DATABASE_URL: urlDaDemo, CADENCE_DEMO: 'true' });
    prisma = demo.get(PrismaService);
  });

  afterAll(async () => {
    await demo?.close();
    await fora?.close();
  });

  describe('fora da demonstração', () => {
    it('GET /demo diz que está desligada', async () => {
      await http(fora).get('/demo').expect(200, { demo: false, negocio: null });
    });

    it('POST /auth/visitante não existe (404), seja qual for o corpo', async () => {
      await http(fora)
        .post('/auth/visitante')
        .send({ papel: 'cliente' })
        .expect(404);
      await http(fora)
        .post('/auth/visitante')
        .send({ papel: 'admin' })
        .expect(404);
    });
  });

  describe('semeadura', () => {
    const rodar = async (env: Record<string, string | undefined>) => {
      const linhas: string[] = [];
      const codigo = await executar(
        { ...process.env, DATABASE_URL: urlDaDemo, ...env },
        (linha) => linhas.push(linha),
      );
      return { codigo, saida: linhas.join('\n') };
    };

    it('recusa sem CADENCE_DEMO=true', async () => {
      for (const valor of [undefined, 'false']) {
        const { codigo, saida } = await rodar({ CADENCE_DEMO: valor });
        expect(codigo).toBe(1);
        expect(saida).toMatch(/Recusado: CADENCE_DEMO não está ligada/);
      }
      expect(await prisma.negocio.count()).toBe(0);
    });

    it('recusa um banco com qualquer conta de verdade, sem apagar nada', async () => {
      const real = await prisma.usuario.create({
        data: {
          nome: 'Chris',
          email: `chris-${randomUUID()}@exemplo.com`,
          senhaHash: 'x',
          papel: 'dono',
        },
      });
      const dele = await prisma.negocio.create({
        data: {
          donoId: real.id,
          nome: 'De verdade',
          slug: `real-${randomUUID()}`,
        },
      });
      try {
        const { codigo, saida } = await rodar({ CADENCE_DEMO: 'true' });
        expect(codigo).toBe(1);
        expect(saida).toMatch(/1 conta\(s\) que não são da demonstração/);
        expect(
          await prisma.negocio.findUnique({ where: { id: dele.id } }),
        ).not.toBeNull();
        expect(
          await prisma.negocio.findUnique({ where: { slug: SLUG_DA_DEMO } }),
        ).toBeNull();
      } finally {
        await prisma.usuario.delete({ where: { id: real.id } });
      }
    });

    it('antes da primeira semeadura, o visitante dono recebe 503', async () => {
      await http().post('/auth/visitante').send({ papel: 'dono' }).expect(503);
    });

    it('cria a Barbearia Exemplo com reservas nos próximos dias', async () => {
      const { codigo, saida } = await rodar({ CADENCE_DEMO: 'true' });
      expect(saida).toMatch(/Demonstração reposta: \d+ reservas/);
      expect(codigo).toBe(0);
      const r = await retrato();
      expect(r.negocio).toEqual([
        'Barbearia Exemplo',
        SLUG_DA_DEMO,
        'America/Sao_Paulo',
        `dono@${DOMINIO_DA_DEMO}`,
      ]);
      expect(r.profissionais).toHaveLength(3);
      expect(r.servicos).toHaveLength(4);
      expect(r.bloqueios).toHaveLength(1);
      expect(r.reservas.length).toBeGreaterThan(20);
      expect(r.usuarios.every((e) => e.endsWith(`@${DOMINIO_DA_DEMO}`))).toBe(
        true,
      );
    });

    it('é idempotente: duas seguidas dão o mesmo estado', async () => {
      const agora = new Date();
      await semearDemo(prisma, agora);
      const primeira = await retrato();
      await semearDemo(prisma, agora);
      expect(await retrato()).toEqual(primeira);
    });
  });

  describe('com a demonstração ligada', () => {
    beforeAll(async () => {
      await semearDemo(prisma, new Date());
    });

    it('GET /demo diz qual é o negócio', async () => {
      await http()
        .get('/demo')
        .expect(200, { demo: true, negocio: SLUG_DA_DEMO });
    });

    it('cadastro fecha (403), mesmo com o corpo inválido', async () => {
      const resposta = await http()
        .post('/auth/cadastro')
        .send({
          nome: 'Chris',
          email: 'chris@exemplo.com',
          senha: 'like-a-stone',
        })
        .expect(403);
      expect(resposta.body.message).toBe(CADASTRO_FECHADO_NA_DEMO);
      await http().post('/auth/cadastro').send({}).expect(403);
    });

    it('entrar com senha continua funcionando', async () => {
      const email = `convidado@${DOMINIO_DA_DEMO}`;
      await prisma.usuario.create({
        data: {
          nome: 'Convidado',
          email,
          senhaHash: await gerarHashDeSenha('cochise-1234'),
          papel: 'cliente',
        },
      });
      await http()
        .post('/auth/entrar')
        .send({ email, senha: 'cochise-1234' })
        .expect(200);
      await http()
        .post('/auth/entrar')
        .send({ email, senha: 'errada-1234' })
        .expect(401);
    });

    it('a conta de visitante não entra com senha', async () => {
      const v = await visitante('cliente');
      await http()
        .post('/auth/entrar')
        .send({ email: v.email, senha: 'demo$sem-senha' })
        .expect(401);
    });

    it('recusa papel desconhecido (400)', async () => {
      await http().post('/auth/visitante').send({ papel: 'admin' }).expect(400);
      await http().post('/auth/visitante').send({}).expect(400);
    });

    it('visitante cliente: conta nova a cada vez, e reserva na Barbearia Exemplo', async () => {
      const a = await visitante('cliente');
      const b = await visitante('cliente');
      expect(a.id).not.toBe(b.id);
      expect(a.email).toMatch(new RegExp(`^visitante-.+@${DOMINIO_DA_DEMO}$`));
      await como(a).get('/auth/eu').expect(200);

      const reserva = await reservar(a, 201);
      const deA = (await como(a).get('/reservas').expect(200)).body;
      expect(deA.map((r: { id: string }) => r.id)).toEqual([reserva.body.id]);
      // Cada visitante vê só as próprias
      expect((await como(b).get('/reservas').expect(200)).body).toEqual([]);

      // O cookie renova como o de /auth/entrar
      await http()
        .post('/auth/renovar')
        .set('Content-Type', 'application/json')
        .set('Cookie', a.cookie)
        .expect(200);
    });

    it('visitante dono: conta compartilhada, vê a agenda e não troca endereço nem fuso', async () => {
      const cliente = await visitante('cliente');
      const reserva = (await reservar(cliente, 201)).body as {
        id: string;
      };

      const dono = await visitante('dono');
      expect((await visitante('dono')).id).toBe(dono.id);
      const negocios = (await como(dono).get('/negocios').expect(200)).body;
      expect(negocios).toHaveLength(1);
      const { id } = negocios[0] as { id: string; slug: string };
      expect(negocios[0].slug).toBe(SLUG_DA_DEMO);

      const agenda = (
        await como(dono).get(`/negocios/${id}/agenda`).expect(200)
      ).body as { id: string; cliente: { nome: string } }[];
      expect(agenda.some((r) => r.id === reserva.id)).toBe(true);
      // As reservas de exemplo aparecem com os clientes fictícios
      expect(agenda.some((r) => r.cliente.nome !== 'Visitante')).toBe(true);

      for (const mudanca of [
        { slug: 'outro-endereco' },
        { fuso: 'Europe/Lisbon' },
      ]) {
        const resposta = await como(dono)
          .patch(`/negocios/${id}`)
          .send(mudanca)
          .expect(403);
        expect(resposta.body.message).toMatch(/não mudam/);
      }
      // O mesmo endereço e o mesmo fuso (formulário que manda tudo) passam; o nome muda
      await como(dono)
        .patch(`/negocios/${id}`)
        .send({
          nome: 'Barbearia do Visitante',
          slug: SLUG_DA_DEMO,
          fuso: 'America/Sao_Paulo',
        })
        .expect(200);
      // O resto do catálogo, sim
      await como(dono)
        .post(`/negocios/${id}/profissionais`)
        .send({ nome: 'Novo Barbeiro' })
        .expect(201);
      await como(dono).post(`/reservas/${reserva.id}/cancelar`).expect(200);
    });

    it('a reposição apaga os visitantes e volta só o exemplo', async () => {
      const cliente = await visitante('cliente');
      await reservar(cliente, 201);
      const dono = await visitante('dono');
      const [{ id }] = (await como(dono).get('/negocios').expect(200)).body;
      await como(dono)
        .patch(`/negocios/${id}`)
        .send({ nome: 'Mudada' })
        .expect(200);
      await como(dono)
        .post('/negocios')
        .send({ nome: 'Outra do visitante' })
        .expect(201);

      const agora = new Date();
      await semearDemo(prisma, agora);
      const depois = await retrato();
      // Igual a uma semeadura num banco sem visitantes
      await semearDemo(prisma, agora);
      expect(await retrato()).toEqual(depois);

      expect(depois.negocio[0]).toBe('Barbearia Exemplo');
      expect(depois.negocios).toBe(1);
      expect(depois.profissionais.map((p) => p.nome)).not.toContain(
        'Novo Barbeiro',
      );
      expect(depois.usuarios.some((e) => e.startsWith('visitante-'))).toBe(
        false,
      );
      expect(
        depois.reservas.every((r) => !String(r[2]).startsWith('visitante-')),
      ).toBe(true);
      expect(depois.reservas.every((r) => r[4] === 'confirmada')).toBe(true);
      expect(await prisma.aviso.count()).toBe(0);

      // Todo mundo entra de novo: o cookie do visitante e o do dono não renovam mais
      for (const s of [cliente, dono]) {
        await http()
          .post('/auth/renovar')
          .set('Content-Type', 'application/json')
          .set('Cookie', s.cookie)
          .expect(401);
      }
      // O dono é o mesmo (o token de acesso do painel segue valendo até vencer)...
      expect((await visitante('dono')).id).toBe(dono.id);
      expect((await como(dono).get('/negocios').expect(200)).body).toHaveLength(
        1,
      );
      // ...e o visitante apagado que tenta reservar com o token antigo é mandado entrar de novo
      await reservar(cliente, 401);
    });
  });
});
