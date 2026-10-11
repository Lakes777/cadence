import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module.js';
import { DisponibilidadeModule } from '../disponibilidade/disponibilidade.module.js';
import { LembretesModule } from '../lembretes/lembretes.module.js';
import {
  AgendaController,
  MinhasReservasController,
  NovaReservaController,
} from './reservas.controller.js';
import { ReservasService } from './reservas.service.js';

/** Reservas sem reserva dupla, cancelamento e agenda do dono (fase 5). */
@Module({
  imports: [CatalogoModule, DisponibilidadeModule, LembretesModule],
  controllers: [
    NovaReservaController,
    MinhasReservasController,
    AgendaController,
  ],
  providers: [ReservasService],
})
export class ReservasModule {}
