import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type CanActivate,
} from '@nestjs/common';
import { CONFIG, type Config } from '../config/config.js';

export const CADASTRO_FECHADO_NA_DEMO =
  'Na demonstração, entre como visitante.';

/**
 * Rota que só existe na demonstração: fora dela, 404 (como qualquer rota que não existe).
 * É um guard, e não um `if` no método, porque os guards rodam antes da validação do corpo:
 * fora da demonstração a resposta é 404 seja qual for o corpo.
 */
@Injectable()
export class SoNaDemoGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  canActivate(): boolean {
    if (!this.config.CADENCE_DEMO) throw new NotFoundException();
    return true;
  }
}

/**
 * Cadastro fechado na demonstração: o dono visitante é compartilhado e veria na agenda o nome
 * e o e-mail de quem se cadastrasse de verdade. Guard pelo mesmo motivo do de cima (403 antes
 * de olhar o corpo).
 */
@Injectable()
export class ForaDaDemoGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  canActivate(): boolean {
    if (this.config.CADENCE_DEMO) {
      throw new ForbiddenException(CADASTRO_FECHADO_NA_DEMO);
    }
    return true;
  }
}
