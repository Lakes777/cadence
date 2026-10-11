import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Papel } from '../generated/prisma/client.js';
import type { UsuarioDoToken } from './usuario-do-token.js';

export const ROTA_PUBLICA = 'rotaPublica';
export const PAPEIS = 'papeis';

/** Toda rota exige login, a não ser que leve este decorador. */
export const Publica = () => SetMetadata(ROTA_PUBLICA, true);

/** Só os papéis listados passam (403 para os outros). */
export const Papeis = (...papeis: Papel[]) => SetMetadata(PAPEIS, papeis);

export type RequestComUsuario = Request & { usuario?: UsuarioDoToken };

/** O usuário do token de acesso (só em rotas que não são públicas). */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): UsuarioDoToken | undefined =>
    contexto.switchToHttp().getRequest<RequestComUsuario>().usuario,
);
