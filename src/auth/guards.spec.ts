import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AutenticacaoGuard } from './autenticacao.guard.js';
import { Papeis, Publica, type RequestComUsuario } from './decoradores.js';
import { PapeisGuard } from './papeis.guard.js';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';
const jwt = new JwtService({
  secret: SEGREDO,
  signOptions: { algorithm: 'HS256', expiresIn: 60 },
  verifyOptions: { algorithms: ['HS256'] },
});

class Rotas {
  @Publica()
  aberta(): void {}
  fechada(): void {}
  @Papeis('dono')
  doDono(): void {}
}

function contexto(
  rota: keyof Rotas,
  req: Partial<RequestComUsuario>,
): ExecutionContext {
  return {
    getHandler: () => Rotas.prototype[rota],
    getClass: () => Rotas,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function comToken(token: string): Partial<RequestComUsuario> {
  return { headers: { authorization: `Bearer ${token}` } };
}

describe('AutenticacaoGuard', () => {
  const guard = new AutenticacaoGuard(new Reflector(), jwt);

  it('deixa passar rota pública sem token', async () => {
    await expect(
      guard.canActivate(contexto('aberta', { headers: {} })),
    ).resolves.toBe(true);
  });

  it('põe o usuário do token no pedido', async () => {
    const req = comToken(await jwt.signAsync({ sub: 'u1', papel: 'cliente' }));
    await expect(guard.canActivate(contexto('fechada', req))).resolves.toBe(
      true,
    );
    expect(req.usuario).toEqual({ id: 'u1', papel: 'cliente' });
  });

  it.each([
    ['sem cabeçalho', { headers: {} }],
    ['outro esquema', { headers: { authorization: 'Basic abc' } }],
    ['Bearer vazio', { headers: { authorization: 'Bearer ' } }],
    ['token lixo', comToken('nao.e.jwt')],
  ])('recusa %s com 401', async (_caso, req) => {
    await expect(guard.canActivate(contexto('fechada', req))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa token assinado com outro segredo', async () => {
    const outro = new JwtService({ secret: 'x'.repeat(40) });
    const req = comToken(await outro.signAsync({ sub: 'u1', papel: 'dono' }));
    await expect(guard.canActivate(contexto('fechada', req))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa token vencido', async () => {
    const vencido = await jwt.signAsync(
      { sub: 'u1', papel: 'dono' },
      { expiresIn: -1 },
    );
    await expect(
      guard.canActivate(contexto('fechada', comToken(vencido))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('recusa token sem assinatura (alg: none)', async () => {
    const parte = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const semAssinatura = `${parte({ alg: 'none', typ: 'JWT' })}.${parte({ sub: 'u1', papel: 'dono' })}.`;
    await expect(
      guard.canActivate(contexto('fechada', comToken(semAssinatura))),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('PapeisGuard', () => {
  const guard = new PapeisGuard(new Reflector());

  it('deixa passar rota sem papel exigido', () => {
    expect(
      guard.canActivate(
        contexto('fechada', { usuario: { id: 'u1', papel: 'cliente' } }),
      ),
    ).toBe(true);
  });

  it('deixa o dono entrar na rota do dono', () => {
    expect(
      guard.canActivate(
        contexto('doDono', { usuario: { id: 'u1', papel: 'dono' } }),
      ),
    ).toBe(true);
  });

  it('barra o cliente na rota do dono com 403', () => {
    expect(() =>
      guard.canActivate(
        contexto('doDono', { usuario: { id: 'u1', papel: 'cliente' } }),
      ),
    ).toThrow(ForbiddenException);
  });
});
