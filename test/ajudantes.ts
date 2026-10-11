import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';

export interface Conta {
  id: string;
  token: string;
}

/** Cria uma conta nova (e-mail único) e devolve o id e o token de acesso. */
export async function novaConta(
  app: INestApplication<App>,
  papel: 'dono' | 'cliente',
): Promise<Conta> {
  const resposta = await request(app.getHttpServer())
    .post('/auth/cadastro')
    .send({
      nome: papel === 'dono' ? 'Dono' : 'Cliente',
      email: `${papel}-${randomUUID()}@exemplo.com`,
      senha: 'by-the-way-i-try',
      papel,
    })
    .expect(201);
  return { id: resposta.body.usuario.id, token: resposta.body.tokenDeAcesso };
}
