import { Module } from '@nestjs/common';
import { RELOGIO, relogioDoSistema } from '../comum/relogio.js';
import { DisponibilidadeController } from './disponibilidade.controller.js';
import { DisponibilidadeService } from './disponibilidade.service.js';

/** Horários livres de um serviço num dia (fase 4). */
@Module({
  controllers: [DisponibilidadeController],
  providers: [
    DisponibilidadeService,
    { provide: RELOGIO, useValue: relogioDoSistema },
  ],
  exports: [DisponibilidadeService, RELOGIO],
})
export class DisponibilidadeModule {}
