import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { criarApp } from './app.js';

describe('/saude', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await criarApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 com o banco de verdade', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/saude')
      .expect(200);
    expect(resposta.body).toEqual({ status: 'ok', banco: 'ok', fila: 'ok' });
  });

  it('devolve o X-Request-Id recebido quando ele é válido', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/saude')
      .set('X-Request-Id', 'pedido-123')
      .expect(200);
    expect(resposta.headers['x-request-id']).toBe('pedido-123');
  });

  it.each([
    ['comprido demais', 'x'.repeat(65)],
    ['com espaço', 'a b'],
    ['com caractere de HTML', 'id<script>'],
  ])('troca um X-Request-Id %s por um UUID novo', async (_caso, recebido) => {
    const resposta = await request(app.getHttpServer())
      .get('/saude')
      .set('X-Request-Id', recebido)
      .expect(200);
    expect(resposta.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('responde 404 em JSON para rota que não existe', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/nada')
      .expect(404);
    expect(resposta.body).toMatchObject({ statusCode: 404 });
  });
});
