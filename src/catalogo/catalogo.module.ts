import { Module } from '@nestjs/common';
import { TempoRealModule } from '../tempo-real/tempo-real.module.js';
import { BloqueiosController } from './bloqueios.controller.js';
import { BloqueiosService } from './bloqueios.service.js';
import {
  NegociosController,
  VitrineController,
} from './negocios.controller.js';
import { NegociosService } from './negocios.service.js';
import { ProfissionaisController } from './profissionais.controller.js';
import { ProfissionaisService } from './profissionais.service.js';
import { ServicosController } from './servicos.controller.js';
import { ServicosService } from './servicos.service.js';

/** Negócio, profissionais, serviços, horário semanal e bloqueios (fase 3). */
@Module({
  imports: [TempoRealModule],
  controllers: [
    NegociosController,
    VitrineController,
    ProfissionaisController,
    ServicosController,
    BloqueiosController,
  ],
  providers: [
    NegociosService,
    ProfissionaisService,
    ServicosService,
    BloqueiosService,
  ],
  exports: [NegociosService],
})
export class CatalogoModule {}
