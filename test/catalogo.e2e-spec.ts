import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/banco/prisma.service.js';
import { novaConta, type Conta } from './ajudantes.js';
import { criarApp } from './app.js';

describe('catálogo', () => {
  let app: INestApplication<App>;
  let dono: Conta;
  let outroDono: Conta;
  let cliente: Conta;

  /** Pedido autenticado como `conta` */
  const como = (conta: Conta) => {
    const http = request(app.getHttpServer());
    const auth = `Bearer ${conta.token}`;
    return {
      get: (url: string) => http.get(url).set('Authorization', auth),
      post: (url: string) => http.post(url).set('Authorization', auth),
      patch: (url: string) => http.patch(url).set('Authorization', auth),
      put: (url: string) => http.put(url).set('Authorization', auth),
      delete: (url: string) => http.delete(url).set('Authorization', auth),
    };
  };

  async function novoNegocio(conta: Conta, nome = 'Barbearia Teste') {
    const { body } = await como(conta)
      .post('/negocios')
      .send({ nome, slug: `teste-${randomUUID()}` })
      .expect(201);
    return body as { id: string; slug: string };
  }

  async function novoProfissional(
    conta: Conta,
    negocioId: string,
    nome = 'Chris',
  ) {
    const { body } = await como(conta)
      .post(`/negocios/${negocioId}/profissionais`)
      .send({ nome })
      .expect(201);
    return body as { id: string };
  }

  async function novoServico(conta: Conta, negocioId: string, nome = 'Corte') {
    const { body } = await como(conta)
      .post(`/negocios/${negocioId}/servicos`)
      .send({ nome, duracaoMin: 30, precoCentavos: 3500 })
      .expect(201);
    return body as { id: string };
  }

  beforeAll(async () => {
    app = await criarApp();
    [dono, outroDono, cliente] = await Promise.all([
      novaConta(app, 'dono'),
      novaConta(app, 'dono'),
      novaConta(app, 'cliente'),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('negócios', () => {
    it('cria com o endereço tirado do nome quando não é informado', async () => {
      const nome = `Estúdio Ação ${randomUUID().slice(0, 8)}`;
      const { body } = await como(dono)
        .post('/negocios')
        .send({ nome })
        .expect(201);
      expect(body).toEqual({
        id: expect.any(String),
        nome,
        slug: expect.stringMatching(/^estudio-acao-[0-9a-f]{8}$/),
        fuso: 'America/Sao_Paulo',
      });
    });

    it('com nome repetido, o endereço automático ganha um sufixo', async () => {
      const nome = `Quadra ${randomUUID().slice(0, 8)}`;
      const a = await como(dono).post('/negocios').send({ nome }).expect(201);
      const b = await como(outroDono)
        .post('/negocios')
        .send({ nome })
        .expect(201);
      expect(b.body.slug).toMatch(new RegExp(`^${a.body.slug}-[0-9a-f]{4}$`));
    });

    it('nome longo repetido: o sufixo não deixa hífen duplo (antes dava 500)', async () => {
      const nome = `${randomUUID().replace(/-/g, '').slice(0, 20)}${'a'.repeat(34)} ${'b'.repeat(20)}`;
      const a = await como(dono).post('/negocios').send({ nome }).expect(201);
      const b = await como(outroDono)
        .post('/negocios')
        .send({ nome })
        .expect(201);
      expect(a.body.slug).toHaveLength(60);
      expect(b.body.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('grava o fuso com o nome canônico', async () => {
      const { id } = await novoNegocio(dono);
      const { body } = await como(dono)
        .patch(`/negocios/${id}`)
        .send({ fuso: 'europe/lisbon' })
        .expect(200);
      expect(body.fuso).toBe('Europe/Lisbon');
    });

    it('recusa endereço escolhido que já existe (409)', async () => {
      const { slug } = await novoNegocio(dono);
      const resposta = await como(outroDono)
        .post('/negocios')
        .send({ nome: 'Outro', slug })
        .expect(409);
      expect(resposta.body.message).toBe(
        'Este endereço já está em uso; escolha outro',
      );
      // A interface mostra o erro no campo do endereço
      expect(resposta.body.erros).toEqual([
        {
          campo: 'slug',
          mensagem: 'Este endereço já está em uso; escolha outro',
        },
      ]);
    });

    it('lista só os negócios de quem pediu', async () => {
      const meu = await novoNegocio(dono);
      const alheio = await novoNegocio(outroDono);
      const { body } = await como(dono).get('/negocios').expect(200);
      const ids = body.map((n: { id: string }) => n.id);
      expect(ids).toContain(meu.id);
      expect(ids).not.toContain(alheio.id);
    });

    it('cliente não cria negócio (403) e sem login é 401', async () => {
      await como(cliente).post('/negocios').send({ nome: 'X' }).expect(403);
      await request(app.getHttpServer())
        .post('/negocios')
        .send({ nome: 'X' })
        .expect(401);
    });

    it('muda o nome e o fuso do próprio negócio', async () => {
      const { id } = await novoNegocio(dono);
      const { body } = await como(dono)
        .patch(`/negocios/${id}`)
        .send({ nome: 'Novo nome', fuso: 'Europe/Lisbon' })
        .expect(200);
      expect(body).toMatchObject({ nome: 'Novo nome', fuso: 'Europe/Lisbon' });
    });

    it('negócio de outro dono responde como se não existisse (404)', async () => {
      const { id } = await novoNegocio(outroDono);
      await como(dono)
        .patch(`/negocios/${id}`)
        .send({ nome: 'Meu agora' })
        .expect(404);
      await como(dono).get(`/negocios/${id}/profissionais`).expect(404);
      await como(dono).get(`/negocios/${id}/servicos`).expect(404);
      await como(dono).get(`/negocios/${id}/bloqueios`).expect(404);
    });

    it('id que não é UUID dá 400 sem ir ao banco', async () => {
      const resposta = await como(dono)
        .patch('/negocios/123')
        .send({ nome: 'X' })
        .expect(400);
      expect(resposta.body.message).toBe('Id inválido');
    });
  });

  describe('profissionais e serviços', () => {
    it('cria, desativa e lista profissionais', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const { id } = await novoProfissional(dono, negocioId);
      await como(dono)
        .patch(`/negocios/${negocioId}/profissionais/${id}`)
        .send({ ativo: false })
        .expect(200);
      const { body } = await como(dono)
        .get(`/negocios/${negocioId}/profissionais`)
        .expect(200);
      expect(body).toEqual([
        { id, nome: 'Chris', ativo: false, servicoIds: [], horarios: [] },
      ]);
    });

    it('não deixa mexer no profissional de outro negócio pelo próprio negócio', async () => {
      const { id: meuNegocio } = await novoNegocio(dono);
      const { id: negocioAlheio } = await novoNegocio(outroDono);
      const alheio = await novoProfissional(outroDono, negocioAlheio);
      await como(dono)
        .patch(`/negocios/${meuNegocio}/profissionais/${alheio.id}`)
        .send({ nome: 'Roubado' })
        .expect(404);
      await como(dono)
        .put(`/negocios/${meuNegocio}/profissionais/${alheio.id}/horarios`)
        .send({ horarios: [] })
        .expect(404);
      await como(dono)
        .put(`/negocios/${meuNegocio}/profissionais/${alheio.id}/servicos`)
        .send({ servicoIds: [] })
        .expect(404);
    });

    it('cliente não entra nas rotas do dono, nem nas de dentro do negócio (403)', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      await como(cliente).get(`/negocios/${negocioId}/servicos`).expect(403);
      await como(cliente)
        .get(`/negocios/${negocioId}/profissionais`)
        .expect(403);
      await como(cliente).get(`/negocios/${negocioId}/bloqueios`).expect(403);
      await como(cliente).get('/negocios').expect(403);
    });

    it('cria e muda serviço; serviço de outro negócio é 404', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const servico = await novoServico(dono, negocioId);
      const { body } = await como(dono)
        .patch(`/negocios/${negocioId}/servicos/${servico.id}`)
        .send({ precoCentavos: 4000, duracaoMin: 45 })
        .expect(200);
      expect(body).toEqual({
        id: servico.id,
        nome: 'Corte',
        duracaoMin: 45,
        precoCentavos: 4000,
        ativo: true,
      });
      const { id: negocioAlheio } = await novoNegocio(outroDono);
      const alheio = await novoServico(outroDono, negocioAlheio);
      await como(dono)
        .patch(`/negocios/${negocioId}/servicos/${alheio.id}`)
        .send({ precoCentavos: 1 })
        .expect(404);
    });

    it('recusa serviço com duração quebrada (400)', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const { body } = await como(dono)
        .post(`/negocios/${negocioId}/servicos`)
        .send({ nome: 'Barba', duracaoMin: 32, precoCentavos: 2000 })
        .expect(400);
      expect(body.erros[0].campo).toBe('duracaoMin');
    });

    it('define os serviços do profissional, mas só os do próprio negócio', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const prof = await novoProfissional(dono, negocioId);
      const corte = await novoServico(dono, negocioId, 'Corte');
      const barba = await novoServico(dono, negocioId, 'Barba');
      const url = `/negocios/${negocioId}/profissionais/${prof.id}/servicos`;
      const { body } = await como(dono)
        .put(url)
        .send({ servicoIds: [corte.id, barba.id, corte.id] })
        .expect(200);
      expect(body.servicoIds).toEqual([corte.id, barba.id].sort());

      const { id: negocioAlheio } = await novoNegocio(outroDono);
      const alheio = await novoServico(outroDono, negocioAlheio);
      const recusa = await como(dono)
        .put(url)
        .send({ servicoIds: [corte.id, alheio.id] })
        .expect(400);
      expect(recusa.body.erros[0].campo).toBe('servicoIds');
      // A lista anterior continua
      const lista = await como(dono)
        .get(`/negocios/${negocioId}/profissionais`)
        .expect(200);
      expect(lista.body[0].servicoIds).toHaveLength(2);
    });
  });

  describe('horário semanal', () => {
    it('troca a semana inteira e devolve em ordem, em HH:MM', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const prof = await novoProfissional(dono, negocioId);
      const url = `/negocios/${negocioId}/profissionais/${prof.id}/horarios`;
      await como(dono)
        .put(url)
        .send({ horarios: [{ diaDaSemana: 0, inicio: '08:00', fim: '10:00' }] })
        .expect(200);
      const { body } = await como(dono)
        .put(url)
        .send({
          horarios: [
            { diaDaSemana: 2, inicio: '13:00', fim: '18:00' },
            { diaDaSemana: 2, inicio: '09:00', fim: '12:00' },
            { diaDaSemana: 1, inicio: '09:00', fim: '18:00' },
          ],
        })
        .expect(200);
      expect(body.horarios).toEqual([
        { diaDaSemana: 1, inicio: '09:00', fim: '18:00' },
        { diaDaSemana: 2, inicio: '09:00', fim: '12:00' },
        { diaDaSemana: 2, inicio: '13:00', fim: '18:00' },
      ]);
    });

    it('recusa intervalos sobrepostos (400) e mantém a semana anterior', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const prof = await novoProfissional(dono, negocioId);
      const url = `/negocios/${negocioId}/profissionais/${prof.id}/horarios`;
      await como(dono)
        .put(url)
        .send({ horarios: [{ diaDaSemana: 3, inicio: '09:00', fim: '12:00' }] })
        .expect(200);
      await como(dono)
        .put(url)
        .send({
          horarios: [
            { diaDaSemana: 1, inicio: '09:00', fim: '12:00' },
            { diaDaSemana: 1, inicio: '11:30', fim: '14:00' },
          ],
        })
        .expect(400);
      const { body } = await como(dono)
        .get(`/negocios/${negocioId}/profissionais`)
        .expect(200);
      expect(body[0].horarios).toEqual([
        { diaDaSemana: 3, inicio: '09:00', fim: '12:00' },
      ]);
    });

    it('duas trocas ao mesmo tempo entram em fila (sem erro 500 nem mistura)', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const prof = await novoProfissional(dono, negocioId);
      const url = `/negocios/${negocioId}/profissionais/${prof.id}/horarios`;
      const semanas = Array.from({ length: 6 }, (_, i) => ({
        horarios: [
          { diaDaSemana: 1, inicio: '09:00', fim: '12:00' },
          { diaDaSemana: 1, inicio: `1${i + 2}:00`, fim: '18:00' },
        ],
      }));
      const respostas = await Promise.all(
        semanas.map((s) => como(dono).put(url).send(s)),
      );
      expect(respostas.map((r) => r.status)).toEqual([
        200, 200, 200, 200, 200, 200,
      ]);
      const { body } = await como(dono)
        .get(`/negocios/${negocioId}/profissionais`)
        .expect(200);
      expect(body[0].horarios).toHaveLength(2);
    });
  });

  describe('bloqueios', () => {
    const natal = {
      inicio: '2026-12-25T00:00:00-03:00',
      fim: '2026-12-26T00:00:00-03:00',
      motivo: 'Natal',
    };

    it('cria para o negócio todo e para um profissional, lista e remove', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const prof = await novoProfissional(dono, negocioId);
      const url = `/negocios/${negocioId}/bloqueios`;
      const todos = await como(dono).post(url).send(natal).expect(201);
      expect(todos.body).toEqual({
        id: expect.any(String),
        profissionalId: null,
        inicio: '2026-12-25T03:00:00.000Z',
        fim: '2026-12-26T03:00:00.000Z',
        motivo: 'Natal',
      });
      await como(dono)
        .post(url)
        .send({
          profissionalId: prof.id,
          inicio: '2026-11-02T13:00:00-03:00',
          fim: '2026-11-02T15:00:00-03:00',
        })
        .expect(201);

      const novembro = await como(dono)
        .get(url)
        .query({
          de: '2026-11-01T00:00:00-03:00',
          ate: '2026-12-01T00:00:00-03:00',
        })
        .expect(200);
      expect(novembro.body).toHaveLength(1);
      expect(novembro.body[0]).toMatchObject({
        profissionalId: prof.id,
        motivo: null,
      });

      await como(dono).delete(`${url}/${todos.body.id}`).expect(204);
      await como(dono).delete(`${url}/${todos.body.id}`).expect(404);
    });

    it('só com "ate", lista o ano que termina nele; período de mais de um ano é 400', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const url = `/negocios/${negocioId}/bloqueios`;
      await como(dono)
        .post(url)
        .send({ inicio: '2020-01-01T00:00:00Z', fim: '2020-01-02T00:00:00Z' })
        .expect(201);
      const ate = await como(dono)
        .get(url)
        .query({ ate: '2021-01-01T00:00:00Z' })
        .expect(200);
      expect(ate.body).toHaveLength(1);
      // Mais de um ano antes do "ate" fica de fora
      const longe = await como(dono)
        .get(url)
        .query({ ate: '2021-01-03T00:00:00Z' })
        .expect(200);
      expect(longe.body).toHaveLength(0);
      // Sem nada: o próximo ano
      expect((await como(dono).get(url).expect(200)).body).toHaveLength(0);
      await como(dono)
        .get(url)
        .query({ de: '2020-01-01T00:00:00Z', ate: '2022-01-01T00:00:00Z' })
        .expect(400);
    });

    it('não aceita profissional de outro negócio nem datas sem fuso', async () => {
      const { id: negocioId } = await novoNegocio(dono);
      const { id: negocioAlheio } = await novoNegocio(outroDono);
      const alheio = await novoProfissional(outroDono, negocioAlheio);
      const url = `/negocios/${negocioId}/bloqueios`;
      await como(dono)
        .post(url)
        .send({ ...natal, profissionalId: alheio.id })
        .expect(404);
      await como(dono)
        .post(url)
        .send({ ...natal, inicio: '2026-12-25T00:00:00' })
        .expect(400);
    });

    it('não remove bloqueio de outro negócio', async () => {
      const { id: meuNegocio } = await novoNegocio(dono);
      const { id: negocioAlheio } = await novoNegocio(outroDono);
      const { body } = await como(outroDono)
        .post(`/negocios/${negocioAlheio}/bloqueios`)
        .send(natal)
        .expect(201);
      await como(dono)
        .delete(`/negocios/${meuNegocio}/bloqueios/${body.id}`)
        .expect(404);
      const lista = await como(outroDono)
        .get(`/negocios/${negocioAlheio}/bloqueios`)
        .query({ de: '2026-12-01T00:00:00Z' })
        .expect(200);
      expect(lista.body).toHaveLength(1);
    });
  });

  describe('o próprio banco não mistura negócios', () => {
    it('recusa ligar profissional de um negócio a serviço de outro, e bloqueio com profissional alheio', async () => {
      const prisma = app.get(PrismaService);
      const { id: meuNegocio } = await novoNegocio(dono);
      const { id: negocioAlheio } = await novoNegocio(outroDono);
      const meu = await novoProfissional(dono, meuNegocio);
      const alheio = await novoServico(outroDono, negocioAlheio);
      const profAlheio = await novoProfissional(outroDono, negocioAlheio);
      const natal = {
        inicio: new Date('2026-12-25T03:00:00Z'),
        fim: new Date('2026-12-26T03:00:00Z'),
      };
      // Direto no banco, como faria um bug que pulasse a conferência do código
      await expect(
        prisma.profissionalServico.create({
          data: {
            profissionalId: meu.id,
            servicoId: alheio.id,
            negocioId: meuNegocio,
          },
        }),
      ).rejects.toThrow(/Foreign key constraint/);
      await expect(
        prisma.bloqueio.create({
          data: {
            negocioId: meuNegocio,
            profissionalId: profAlheio.id,
            ...natal,
          },
        }),
      ).rejects.toThrow(/Foreign key constraint/);
      // O caso certo continua passando
      await prisma.bloqueio.create({
        data: { negocioId: meuNegocio, profissionalId: meu.id, ...natal },
      });
    });
  });

  describe('vitrine pública', () => {
    it('mostra só o que está ativo e pode ser reservado, sem login', async () => {
      const { id: negocioId, slug } = await novoNegocio(
        dono,
        'Barbearia Vitrine',
      );
      const ativo = await novoProfissional(dono, negocioId, 'Ana');
      const inativo = await novoProfissional(dono, negocioId, 'Bia');
      const corte = await novoServico(dono, negocioId, 'Corte');
      const barba = await novoServico(dono, negocioId, 'Barba');
      const pintura = await novoServico(dono, negocioId, 'Pintura');
      const base = `/negocios/${negocioId}/profissionais`;
      await como(dono)
        .put(`${base}/${inativo.id}/servicos`)
        .send({ servicoIds: [corte.id, barba.id] })
        .expect(200);
      await como(dono)
        .patch(`${base}/${inativo.id}`)
        .send({ ativo: false })
        .expect(200);
      await como(dono)
        .put(`${base}/${ativo.id}/servicos`)
        .send({ servicoIds: [corte.id, pintura.id] })
        .expect(200);
      await como(dono)
        .patch(`/negocios/${negocioId}/servicos/${pintura.id}`)
        .send({ ativo: false })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/negocios/${slug.toUpperCase()}`)
        .expect(200);
      expect(body).toEqual({
        nome: 'Barbearia Vitrine',
        slug,
        fuso: 'America/Sao_Paulo',
        profissionais: [{ id: ativo.id, nome: 'Ana' }],
        // Barba só é feita pela Bia (inativa); Pintura está desativada
        servicos: [
          {
            id: corte.id,
            nome: 'Corte',
            duracaoMin: 30,
            precoCentavos: 3500,
            profissionalIds: [ativo.id],
          },
        ],
      });
      expect(JSON.stringify(body)).not.toContain(dono.id);
    });

    it('endereço que não existe dá 404', async () => {
      await request(app.getHttpServer())
        .get('/negocios/nao-existe-mesmo')
        .expect(404);
    });
  });
});
