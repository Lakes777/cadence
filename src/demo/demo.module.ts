import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../banco/prisma.service.js';
import { CONFIG, type Config } from '../config/config.js';
import { DemoController } from './demo.controller.js';
import { DOMINIO_DA_DEMO } from './demo.js';

/**
 * Modo demonstração (CADENCE_DEMO=true). Aqui fica só o GET /demo; a entrada de visitante é
 * POST /auth/visitante (mesmo cookie de /auth/entrar) e a reposição é o comando
 * `npm run semear-demo` (src/demo/semear.ts), fora da API.
 */
@Module({ controllers: [DemoController] })
export class DemoModule implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * A API não sobe em modo demonstração num banco com contas de verdade (CADENCE_DEMO ligada
   * no .env errado): o cadastro fecharia, qualquer um viraria visitante e reservaria nos
   * negócios reais. Num banco só da demonstração, a contagem é sempre 0.
   */
  async onModuleInit(): Promise<void> {
    if (!this.config.CADENCE_DEMO) return;
    const reais = await this.prisma.usuario.count({
      where: { NOT: { email: { endsWith: `@${DOMINIO_DA_DEMO}` } } },
    });
    if (reais > 0) {
      throw new Error(
        `CADENCE_DEMO=true, mas o banco tem ${reais} conta(s) que não são da demonstração: ` +
          'a demonstração precisa de um banco só dela. A API não vai subir.',
      );
    }
  }
}
