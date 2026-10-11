import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Papel } from '../generated/prisma/client.js';
import { PAPEIS, type RequestComUsuario } from './decoradores.js';

/** Roda depois do AutenticacaoGuard: confere o papel das rotas marcadas com `@Papeis(...)`. */
@Injectable()
export class PapeisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const papeis = this.reflector.getAllAndOverride<Papel[] | undefined>(
      PAPEIS,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (!papeis?.length) return true;
    const { usuario } = contexto.switchToHttp().getRequest<RequestComUsuario>();
    if (!usuario || !papeis.includes(usuario.papel)) {
      throw new ForbiddenException('Seu perfil não tem acesso a esta ação');
    }
    return true;
  }
}
