import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ROTA_PUBLICA, type RequestComUsuario } from './decoradores.js';

interface ConteudoDoToken {
  sub: string;
  papel: 'dono' | 'cliente';
}

/**
 * Guard global: exige `Authorization: Bearer <token de acesso>` em toda rota sem `@Publica()`.
 * Não consulta o banco: o token vale 15 min e carrega o id e o papel.
 */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) return true;

    const req = contexto.switchToHttp().getRequest<RequestComUsuario>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Faça login para continuar');
    }
    try {
      const conteudo = await this.jwt.verifyAsync<ConteudoDoToken>(token);
      req.usuario = { id: conteudo.sub, papel: conteudo.papel };
    } catch {
      throw new UnauthorizedException('Sessão expirada ou inválida');
    }
    return true;
  }
}
