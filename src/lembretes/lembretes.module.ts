import { Module } from '@nestjs/common';
import { DisponibilidadeModule } from '../disponibilidade/disponibilidade.module.js';
import { AvisosController } from './avisos.controller.js';
import { FilaDeLembretes } from './fila.js';
import { LembretesService } from './lembretes.service.js';
import { TrabalhadorDeLembretes } from './trabalhador.js';

/** Lembrete 24 h antes de cada reserva, numa fila do BullMQ com Redis (fase 6). */
@Module({
  // O relógio vem da disponibilidade (os testes trocam um só para a aplicação inteira)
  imports: [DisponibilidadeModule],
  controllers: [AvisosController],
  providers: [FilaDeLembretes, LembretesService, TrabalhadorDeLembretes],
  exports: [FilaDeLembretes],
})
export class LembretesModule {}
