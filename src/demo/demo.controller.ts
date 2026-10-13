import { Controller, Get, Inject } from '@nestjs/common';
import { Publica } from '../auth/decoradores.js';
import { CONFIG, type Config } from '../config/config.js';
import { SLUG_DA_DEMO } from './demo.js';

export interface EstadoDaDemo {
  demo: boolean;
  /** O slug do negócio de exemplo, para a interface abrir direto nele */
  negocio: string | null;
}

/**
 * A interface pergunta aqui se mostra os botões "entrar como cliente/dono". Sem banco e sem
 * limite de pedidos: é só ler a configuração.
 */
@Controller('demo')
@Publica()
export class DemoController {
  constructor(@Inject(CONFIG) private readonly config: Config) {}

  @Get()
  estado(): EstadoDaDemo {
    return this.config.CADENCE_DEMO
      ? { demo: true, negocio: SLUG_DA_DEMO }
      : { demo: false, negocio: null };
  }
}
