import { Logger, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hashDoToken } from '../src/auth/token-de-renovacao.js';
import { PrismaService } from '../src/banco/prisma.service.js';
import { criarApp } from './app.js';

const SENHA = 'show-me-how-to-live';

/** E-mail novo a cada teste: todos usam o mesmo banco */
function emailNovo(): string {
  return `cliente-${randomUUID()}@exemplo.com`;
}

/** O valor do cookie de renovação que a resposta mandou gravar */
function cookieDe(resposta: request.Response): string {
  const cookies = ([] as string[]).concat(resposta.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('cadence_renovacao='));
  if (!cookie) throw new Error('a resposta não mandou o cookie de renovação');
  return cookie;
}

function valorDo(cookie: string): string {
  return cookie.split(';')[0];
}

describe('/auth', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());
  /** POST de /auth sem corpo, como a interface manda (o Content-Type JSON é obrigatório) */
  const postar = (rota: string) =>
    http().post(rota).set('Content-Type', 'application/json');

  /** Mexe direto no token guardado (para simular a passagem do tempo) */
  async function mudarToken(cookie: string, dados: Record<string, Date>) {
    const token = cookie.slice('cadence_renovacao='.length);
    await app.get(PrismaService).tokenDeRenovacao.update({
      where: { hash: hashDoToken(token) },
      data: dados,
    });
  }

  const haSegundos = (s: number) => new Date(Date.now() - s * 1000);

  async function cadastrar(dados: Record<string, string> = {}) {
    return http()
      .post('/auth/cadastro')
      .send({ nome: 'Chris', email: emailNovo(), senha: SENHA, ...dados })
      .expect(201);
  }

  beforeAll(async () => {
    app = await criarApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('cadastro', () => {
    it('cria a conta, devolve o token de acesso e grava o de renovação só no cookie', async () => {
      const email = emailNovo();
      const resposta = await cadastrar({ email: email.toUpperCase() });
      expect(resposta.body).toEqual({
        usuario: {
          id: expect.any(String),
          nome: 'Chris',
          email,
          papel: 'cliente',
        },
        tokenDeAcesso: expect.any(String),
        expiraEm: 900,
      });
      expect(resposta.headers['cache-control']).toBe('no-store');
      const cookie = cookieDe(resposta);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/auth/);
      const expira = Date.parse(/Expires=([^;]+)/.exec(cookie)![1]);
      expect(expira - Date.now()).toBeGreaterThan(29.9 * 24 * 3600 * 1000);
      expect(expira - Date.now()).toBeLessThanOrEqual(30 * 24 * 3600 * 1000);
      // Nos testes o servidor é HTTP; em produção o cookie ganha Secure
      expect(cookie).not.toMatch(/Secure/);
    });

    it('recusa e-mail repetido, mesmo com outra caixa, com 409', async () => {
      const email = emailNovo();
      await cadastrar({ email });
      const resposta = await http()
        .post('/auth/cadastro')
        .send({
          nome: 'Outro',
          email: ` ${email.toUpperCase()} `,
          senha: SENHA,
        })
        .expect(409);
      expect(resposta.body.message).toBe('Já existe uma conta com este e-mail');
    });

    it('responde 400 com os campos errados', async () => {
      const resposta = await http()
        .post('/auth/cadastro')
        .send({ nome: '', email: 'sem-arroba', senha: '123' })
        .expect(400);
      expect(
        resposta.body.erros.map((e: { campo: string }) => e.campo),
      ).toEqual(['nome', 'email', 'senha']);
    });
  });

  describe('entrar', () => {
    it('entra com a senha certa (e o e-mail em qualquer caixa)', async () => {
      const email = emailNovo();
      await cadastrar({ email, papel: 'dono' });
      const resposta = await http()
        .post('/auth/entrar')
        .send({ email: email.toUpperCase(), senha: SENHA })
        .expect(200);
      expect(resposta.body.usuario).toMatchObject({ email, papel: 'dono' });
      cookieDe(resposta);
    });

    it('dá a mesma resposta para senha errada e para e-mail sem conta', async () => {
      const email = emailNovo();
      await cadastrar({ email });
      const senhaErrada = await http()
        .post('/auth/entrar')
        .send({ email, senha: 'outra-senha' })
        .expect(401);
      const semConta = await http()
        .post('/auth/entrar')
        .send({ email: emailNovo(), senha: SENHA })
        .expect(401);
      expect(senhaErrada.body).toEqual(semConta.body);
      expect(senhaErrada.body.message).toBe('E-mail ou senha incorretos');
      expect(senhaErrada.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('eu', () => {
    it('devolve o usuário do token', async () => {
      const { body } = await cadastrar();
      const resposta = await http()
        .get('/auth/eu')
        .set('Authorization', `Bearer ${body.tokenDeAcesso}`)
        .expect(200);
      expect(resposta.body).toEqual(body.usuario);
    });

    it('exige o token (401)', async () => {
      await http().get('/auth/eu').expect(401);
    });

    it('recusa token adulterado', async () => {
      const { body } = await cadastrar();
      const [cabecalho, , assinatura] = body.tokenDeAcesso.split('.');
      const conteudo = Buffer.from(
        JSON.stringify({ sub: body.usuario.id, papel: 'dono' }),
      ).toString('base64url');
      await http()
        .get('/auth/eu')
        .set('Authorization', `Bearer ${cabecalho}.${conteudo}.${assinatura}`)
        .expect(401);
    });
  });

  describe('renovar', () => {
    it('troca o token de renovação e devolve um token de acesso novo', async () => {
      const cadastro = await cadastrar();
      const primeiro = cookieDe(cadastro);
      const resposta = await http()
        .post('/auth/renovar')
        .set('Content-Type', 'application/json')
        .set('Cookie', valorDo(primeiro))
        .expect(200);
      expect(resposta.body.usuario).toEqual(cadastro.body.usuario);
      expect(resposta.headers['cache-control']).toBe('no-store');
      const segundo = cookieDe(resposta);
      expect(valorDo(segundo)).not.toBe(valorDo(primeiro));
      await http()
        .get('/auth/eu')
        .set('Authorization', `Bearer ${resposta.body.tokenDeAcesso}`)
        .expect(200);
    });

    it('token gasto usado de novo, passada a tolerância, derruba a sessão inteira', async () => {
      const primeiro = valorDo(cookieDe(await cadastrar()));
      const renovado = await postar('/auth/renovar')
        .set('Cookie', primeiro)
        .expect(200);
      const segundo = valorDo(cookieDe(renovado));
      await mudarToken(primeiro, { usadoEm: haSegundos(31) });

      // Quem roubou o primeiro tenta usar
      const reuso = await postar('/auth/renovar')
        .set('Cookie', primeiro)
        .expect(401);
      expect(cookieDe(reuso)).toMatch(/Expires=Thu, 01 Jan 1970/);
      // O dono de verdade também precisa entrar de novo
      await postar('/auth/renovar').set('Cookie', segundo).expect(401);
    });

    it('o mesmo token de novo em até 30 s (resposta perdida) troca o token emitido antes', async () => {
      const primeiro = valorDo(cookieDe(await cadastrar()));
      // A resposta deste se "perdeu": o navegador nunca recebeu o token a
      const a = await postar('/auth/renovar')
        .set('Cookie', primeiro)
        .expect(200);
      await mudarToken(primeiro, { usadoEm: haSegundos(25) });
      const b = await postar('/auth/renovar')
        .set('Cookie', primeiro)
        .expect(200);
      expect(valorDo(cookieDe(a))).not.toBe(valorDo(cookieDe(b)));
      // Só o último vale; a sessão segue
      const c = await postar('/auth/renovar')
        .set('Cookie', valorDo(cookieDe(b)))
        .expect(200);
      // Se o token a aparecer depois (ladrão que pegou na janela), a família cai
      await postar('/auth/renovar')
        .set('Cookie', valorDo(cookieDe(a)))
        .expect(401);
      await postar('/auth/renovar')
        .set('Cookie', valorDo(cookieDe(c)))
        .expect(401);
    });

    it('recusa token vencido', async () => {
      const token = valorDo(cookieDe(await cadastrar()));
      await mudarToken(token, { expiraEm: haSegundos(1) });
      await postar('/auth/renovar').set('Cookie', token).expect(401);
    });

    it('recusa token de uma família com mais de 90 dias, mesmo sem vencer', async () => {
      const token = valorDo(cookieDe(await cadastrar()));
      await mudarToken(token, {
        familiaCriadaEm: haSegundos(90 * 24 * 3600 + 1),
      });
      await postar('/auth/renovar').set('Cookie', token).expect(401);
    });

    it('pedidos simultâneos do mesmo token: todos respondem, mas só um token fica valendo', async () => {
      const token = valorDo(cookieDe(await cadastrar()));
      const respostas = await Promise.all(
        Array.from({ length: 5 }, () =>
          postar('/auth/renovar').set('Cookie', token),
        ),
      );
      expect(respostas.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      const novos = respostas.map((r) => valorDo(cookieDe(r)));
      expect(new Set(novos).size).toBe(5);

      const prisma = app.get(PrismaService);
      const { familia } = await prisma.tokenDeRenovacao.findUniqueOrThrow({
        where: { hash: hashDoToken(token.slice('cadence_renovacao='.length)) },
      });
      const validos = await prisma.tokenDeRenovacao.findMany({
        where: { familia, usadoEm: null, revogadoEm: null },
      });
      expect(validos).toHaveLength(1);
      const ultimo = novos.find(
        (n) =>
          hashDoToken(n.slice('cadence_renovacao='.length)) === validos[0].hash,
      );
      expect(ultimo).toBeDefined();
      await postar('/auth/renovar').set('Cookie', ultimo!).expect(200);
    });

    it('depois de sair, usar o token antigo não é tratado como roubo', async () => {
      const token = valorDo(cookieDe(await cadastrar()));
      await postar('/auth/sair').set('Cookie', token).expect(204);
      const aviso = vi.spyOn(Logger.prototype, 'warn');
      try {
        await postar('/auth/renovar').set('Cookie', token).expect(401);
        expect(aviso).not.toHaveBeenCalled();
      } finally {
        aviso.mockRestore();
      }
    });

    it('token revogado com a família viva conta como roubo (e fica no log)', async () => {
      const primeiro = valorDo(cookieDe(await cadastrar()));
      const a = await postar('/auth/renovar')
        .set('Cookie', primeiro)
        .expect(200);
      await postar('/auth/renovar').set('Cookie', primeiro).expect(200);
      const aviso = vi.spyOn(Logger.prototype, 'warn');
      try {
        await postar('/auth/renovar')
          .set('Cookie', valorDo(cookieDe(a)))
          .expect(401);
        expect(aviso).toHaveBeenCalledWith(
          expect.stringContaining('Token de renovação reutilizado'),
        );
      } finally {
        aviso.mockRestore();
      }
    });

    it('sem cookie, ou com cookie desconhecido, responde 401', async () => {
      await postar('/auth/renovar').expect(401);
      await postar('/auth/renovar')
        .set('Cookie', 'cadence_renovacao=inventado')
        .expect(401);
    });

    it('uma sessão não afeta a outra (dois aparelhos)', async () => {
      const email = emailNovo();
      const celular = valorDo(cookieDe(await cadastrar({ email })));
      const computador = valorDo(
        cookieDe(
          await http()
            .post('/auth/entrar')
            .send({ email, senha: SENHA })
            .expect(200),
        ),
      );
      await postar('/auth/sair').set('Cookie', celular).expect(204);
      await postar('/auth/renovar').set('Cookie', computador).expect(200);
    });
  });

  describe('sair', () => {
    it('encerra a sessão e apaga o cookie', async () => {
      const token = valorDo(cookieDe(await cadastrar()));
      const resposta = await postar('/auth/sair')
        .set('Cookie', token)
        .expect(204);
      expect(cookieDe(resposta)).toMatch(/Expires=Thu, 01 Jan 1970/);
      await postar('/auth/renovar').set('Cookie', token).expect(401);
    });

    it('sem sessão também responde 204', async () => {
      await postar('/auth/sair').expect(204);
    });
  });

  describe('proteção contra CSRF', () => {
    it('recusa login mandado por formulário HTML (415)', async () => {
      await http()
        .post('/auth/entrar')
        .type('form')
        .send({ email: emailNovo(), senha: SENHA })
        .expect(415);
    });

    it('recusa renovar e sair sem Content-Type JSON', async () => {
      const token = valorDo(cookieDe(await cadastrar()));
      await http().post('/auth/sair').set('Cookie', token).expect(415);
      await http()
        .post('/auth/renovar')
        .set('Cookie', token)
        .set('Content-Type', 'text/plain')
        .expect(415);
      // A sessão continua viva
      await postar('/auth/renovar').set('Cookie', token).expect(200);
    });
  });

  it('a /saude continua aberta', async () => {
    await http().get('/saude').expect(200);
  });
});

describe('/auth com limite de pedidos', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await criarApp({ PEDIDOS_DE_CONTA_POR_MINUTO: '3' });
  });

  afterAll(async () => {
    await app.close();
  });

  const tentar = (ip: string) =>
    request(app.getHttpServer())
      .post('/auth/entrar')
      .set('X-Forwarded-For', ip)
      .send({ email: emailNovo(), senha: 'chute' });

  it('responde 429 depois do limite de tentativas de login por minuto', async () => {
    for (let i = 0; i < 3; i++) await tentar('203.0.113.1').expect(401);
    await tentar('203.0.113.1').expect(429);
  });

  it('conta cada IP separado (o IP real vem do proxy de confiança)', async () => {
    for (let i = 0; i < 3; i++) await tentar('203.0.113.2').expect(401);
    await tentar('203.0.113.2').expect(429);
    await tentar('203.0.113.3').expect(401);
  });
});
