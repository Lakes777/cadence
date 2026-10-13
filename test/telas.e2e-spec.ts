import type { INestApplication } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { criarApp } from './app.js';

describe('telas servidas pela API (PASTA_DAS_TELAS)', () => {
  let app: INestApplication<App>;
  let pasta: string;
  const HTML = '<!doctype html><title>Cadence</title><div id="raiz"></div>';
  const NAVEGADOR = 'text/html,application/xhtml+xml,*/*;q=0.8';

  beforeAll(async () => {
    pasta = mkdtempSync(join(tmpdir(), 'cadence-telas-'));
    mkdirSync(join(pasta, 'assets'));
    writeFileSync(join(pasta, 'index.html'), HTML);
    writeFileSync(join(pasta, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(pasta, 'icone.svg'), '<svg/>');
    app = await criarApp({ PASTA_DAS_TELAS: pasta });
  });

  afterAll(async () => {
    await app.close();
    // A próxima aplicação deste processo não herda a pasta
    delete process.env.PASTA_DAS_TELAS;
    rmSync(pasta, { recursive: true, force: true });
  });

  it.each(['/', '/b/barbearia-exemplo', '/painel/123/servicos', '/entrar'])(
    'o navegador em %s recebe o index.html, sem cache',
    async (caminho) => {
      const resposta = await request(app.getHttpServer())
        .get(caminho)
        .set('Accept', NAVEGADOR)
        .expect(200);
      expect(resposta.text).toBe(HTML);
      expect(resposta.headers['cache-control']).toBe('no-cache');
    },
  );

  it('os arquivos com hash ficam em cache para sempre; os outros, não', async () => {
    const js = await request(app.getHttpServer())
      .get('/assets/app-abc123.js')
      .expect(200);
    expect(js.headers['cache-control']).toContain('immutable');
    const icone = await request(app.getHttpServer())
      .get('/icone.svg')
      .expect(200);
    expect(icone.headers['cache-control']).toBe('no-cache');
  });

  it('as rotas da API continuam com a API, mesmo pedidas pelo navegador', async () => {
    const saude = await request(app.getHttpServer())
      .get('/saude')
      .set('Accept', NAVEGADOR)
      .expect(200);
    expect(saude.body).toMatchObject({ status: 'ok' });
    const vitrine = await request(app.getHttpServer())
      .get('/negocios/nao-existe')
      .set('Accept', NAVEGADOR)
      .expect(404);
    expect(vitrine.body).toMatchObject({ statusCode: 404 });
  });

  it('quem não pede HTML recebe o 404 em JSON, não a tela', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/qualquer-coisa')
      .set('Accept', 'application/json')
      .expect(404);
    expect(resposta.body).toMatchObject({ statusCode: 404 });
  });

  it('POST fora da API não vira tela', async () => {
    await request(app.getHttpServer())
      .post('/entrar')
      .set('Accept', NAVEGADOR)
      .expect(404);
  });
});
