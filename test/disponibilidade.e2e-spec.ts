import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RELOGIO } from '../src/comum/relogio.js';
import { novaConta, type Conta } from './ajudantes.js';
import { criarApp } from './app.js';

/** Segunda-feira, 12/10/2026, 08:00 em São Paulo */
let agora = new Date('2026-10-12T08:00:00-03:00');

describe('disponibilidade', () => {
  let app: INestApplication<App>;
  let dono: Conta;

  const http = () => request(app.getHttpServer());
  const como = (metodo: 'post' | 'put' | 'patch', url: string) =>
    http()[metodo](url).set('Authorization', `Bearer ${dono.token}`);

  /** Negócio com a Ana (seg 09-12, faz Corte de 30 min) e a Bia (seg 10-11, não faz Corte) */
  async function montar(fuso = 'America/Sao_Paulo') {
    const negocio = (
      await como('post', '/negocios')
        .send({ nome: 'Barbearia', slug: `disp-${randomUUID()}`, fuso })
        .expect(201)
    ).body as { id: string; slug: string };
    const base = `/negocios/${negocio.id}`;
    const corte = (
      await como('post', `${base}/servicos`)
        .send({ nome: 'Corte', duracaoMin: 30, precoCentavos: 3500 })
        .expect(201)
    ).body as { id: string };
    const barba = (
      await como('post', `${base}/servicos`)
        .send({ nome: 'Barba', duracaoMin: 60, precoCentavos: 2500 })
        .expect(201)
    ).body as { id: string };
    const ana = (
      await como('post', `${base}/profissionais`)
        .send({ nome: 'Ana' })
        .expect(201)
    ).body as { id: string };
    const bia = (
      await como('post', `${base}/profissionais`)
        .send({ nome: 'Bia' })
        .expect(201)
    ).body as { id: string };
    await como('put', `${base}/profissionais/${ana.id}/servicos`)
      .send({ servicoIds: [corte.id, barba.id] })
      .expect(200);
    await como('put', `${base}/profissionais/${bia.id}/servicos`)
      .send({ servicoIds: [barba.id] })
      .expect(200);
    await como('put', `${base}/profissionais/${ana.id}/horarios`)
      .send({ horarios: [{ diaDaSemana: 1, inicio: '09:00', fim: '12:00' }] })
      .expect(200);
    await como('put', `${base}/profissionais/${bia.id}/horarios`)
      .send({ horarios: [{ diaDaSemana: 1, inicio: '10:00', fim: '11:00' }] })
      .expect(200);
    return { ...negocio, base, corte, barba, ana, bia };
  }

  function consultar(slug: string, query: Record<string, string>) {
    return http().get(`/negocios/${slug}/disponibilidade`).query(query);
  }

  const horas = (body: { horarios: { hora: string }[] }) =>
    body.horarios.map((h) => h.hora);

  beforeAll(async () => {
    app = await criarApp({}, (m) =>
      m.overrideProvider(RELOGIO).useValue({ agora: () => agora }),
    );
    dono = await novaConta(app, 'dono');
  });

  afterEach(() => {
    agora = new Date('2026-10-12T08:00:00-03:00');
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista os horários do dia, sem login, com início e fim em UTC', async () => {
    const n = await montar();
    const { body } = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-12',
    }).expect(200);
    expect(body.data).toBe('2026-10-12');
    expect(body.fuso).toBe('America/Sao_Paulo');
    expect(body.servico).toEqual({
      id: n.corte.id,
      nome: 'Corte',
      duracaoMin: 30,
    });
    expect(horas(body)).toEqual([
      '09:00',
      '09:15',
      '09:30',
      '09:45',
      '10:00',
      '10:15',
      '10:30',
      '10:45',
      '11:00',
      '11:15',
      '11:30',
    ]);
    expect(body.horarios[0]).toEqual({
      inicio: '2026-10-12T12:00:00.000Z',
      fim: '2026-10-12T12:30:00.000Z',
      hora: '09:00',
      profissionalIds: [n.ana.id],
    });
  });

  it('junta quem atende no mesmo horário e filtra por profissional', async () => {
    const n = await montar();
    const { body } = await consultar(n.slug, {
      servicoId: n.barba.id,
      data: '2026-10-12',
    }).expect(200);
    const dez = body.horarios.find((h: { hora: string }) => h.hora === '10:00');
    expect(dez.profissionalIds).toEqual([n.ana.id, n.bia.id].sort());
    const soBia = await consultar(n.slug, {
      servicoId: n.barba.id,
      data: '2026-10-12',
      profissionalId: n.bia.id,
    }).expect(200);
    expect(horas(soBia.body)).toEqual(['10:00']);
  });

  it('esconde o que começa em menos de 30 min', async () => {
    const n = await montar();
    agora = new Date('2026-10-12T10:05:00-03:00');
    const { body } = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-12',
    }).expect(200);
    expect(horas(body)[0]).toBe('10:45');
  });

  it('respeita bloqueios do profissional e do negócio todo', async () => {
    const n = await montar();
    await como('post', `${n.base}/bloqueios`)
      .send({
        profissionalId: n.ana.id,
        inicio: '2026-10-12T09:00:00-03:00',
        fim: '2026-10-12T10:00:00-03:00',
      })
      .expect(201);
    const { body } = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-12',
    }).expect(200);
    expect(horas(body)[0]).toBe('10:00');

    await como('post', `${n.base}/bloqueios`)
      .send({
        inicio: '2026-10-19T00:00:00-03:00',
        fim: '2026-10-20T00:00:00-03:00',
        motivo: 'Feriado',
      })
      .expect(201);
    const feriado = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-19',
    }).expect(200);
    expect(feriado.body.horarios).toEqual([]);
  });

  it('quem foi desativado ou não faz o serviço não aparece; serviço desativado é 404', async () => {
    const n = await montar();
    await como('patch', `${n.base}/profissionais/${n.ana.id}`)
      .send({ ativo: false })
      .expect(200);
    const { body } = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-12',
    }).expect(200);
    expect(body.horarios).toEqual([]);
    await como('patch', `${n.base}/servicos/${n.corte.id}`)
      .send({ ativo: false })
      .expect(200);
    await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-12',
    }).expect(404);
  });

  it('dia sem expediente fica vazio; dia que já passou também', async () => {
    const n = await montar();
    const terca = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-13',
    }).expect(200);
    expect(terca.body.horarios).toEqual([]);
    const passado = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-05',
    }).expect(200);
    expect(passado.body.horarios).toEqual([]);
  });

  it('a agenda abre só 60 dias à frente (o 60º sim, o 61º não)', async () => {
    const n = await montar();
    // 12/10 + 60 dias = 11/12 (sexta, sem expediente: vazio, mas 200); 12/12 é o 61º
    const sexta = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-12-11',
    }).expect(200);
    expect(sexta.body.horarios).toEqual([]);
    await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-12-12',
    }).expect(400);
    // Uma segunda dentro da janela tem a agenda completa
    const segunda = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-12-07',
    }).expect(200);
    expect(segunda.body.horarios).toHaveLength(11);
  });

  it('profissional de outro negócio (ou que não existe) não traz nada', async () => {
    const a = await montar();
    const b = await montar();
    for (const profissionalId of [b.ana.id, randomUUID()]) {
      const { body } = await consultar(a.slug, {
        servicoId: a.corte.id,
        data: '2026-10-12',
        profissionalId,
      }).expect(200);
      expect(body.horarios).toEqual([]);
    }
  });

  it('usa o fuso do negócio (Lisboa: 09:00 local = 08:00 UTC em outubro)', async () => {
    const n = await montar('Europe/Lisbon');
    // Hoje não serve: às 08:00 em São Paulo já são 12:00 em Lisboa e a manhã passou
    const hoje = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-12',
    }).expect(200);
    expect(hoje.body.horarios).toEqual([]);
    const { body } = await consultar(n.slug, {
      servicoId: n.corte.id,
      data: '2026-10-19',
    }).expect(200);
    expect(body.horarios[0]).toMatchObject({
      hora: '09:00',
      inicio: '2026-10-19T08:00:00.000Z',
    });
  });

  it('serviço de outro negócio, endereço que não existe e consulta mal feita', async () => {
    const a = await montar();
    const b = await montar();
    await consultar(a.slug, {
      servicoId: b.corte.id,
      data: '2026-10-12',
    }).expect(404);
    await consultar('nao-existe', {
      servicoId: a.corte.id,
      data: '2026-10-12',
    }).expect(404);
    const ruim = await consultar(a.slug, { data: '2026-02-30' }).expect(400);
    expect(
      ruim.body.erros.map((e: { campo: string }) => e.campo).sort(),
    ).toEqual(['data', 'servicoId']);
  });
});
