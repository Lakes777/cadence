import {
  Injectable,
  UnsupportedMediaTypeException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Proteção contra CSRF nos POST de /auth, além do SameSite: um formulário HTML de outro site
 * não consegue mandar `Content-Type: application/json`, e um fetch de outra origem com esse
 * cabeçalho precisa de permissão (CORS), que a API não dá. Vale até sem corpo (renovar, sair).
 */
@Injectable()
export class ExigeJsonGuard implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto.switchToHttp().getRequest<Request>();
    if (req.method !== 'POST') return true;
    const tipo = req.headers['content-type']
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (tipo !== 'application/json') {
      throw new UnsupportedMediaTypeException(
        'Envie os pedidos com Content-Type: application/json',
      );
    }
    return true;
  }
}
