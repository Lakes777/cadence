import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Papeis, UsuarioAtual } from '../auth/decoradores.js';
import type { UsuarioDoToken } from '../auth/usuario-do-token.js';
import { esquemaPeriodo, type Periodo } from '../catalogo/catalogo.dto.js';
import { ID } from '../comum/id.pipe.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import {
  esquemaMinhas,
  esquemaNovaReserva,
  type Minhas,
  type NovaReserva,
} from './reservas.dto.js';
import { ReservasService } from './reservas.service.js';
import type { ItemDaAgenda, ReservaResposta } from './respostas.js';

/** Reservar num negócio: qualquer pessoa logada (o dono de outro negócio também é cliente) */
@Controller('negocios/:slug/reservas')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ conta: true })
export class NovaReservaController {
  constructor(private readonly reservas: ReservasService) {}

  @Post()
  async criar(
    @UsuarioAtual() usuario: UsuarioDoToken,
    @Param('slug') slug: string,
    @Headers('idempotency-key') chave: string | undefined,
    @Body(new ValidacaoZod(esquemaNovaReserva)) pedido: NovaReserva,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReservaResposta> {
    const { reserva, nova } = await this.reservas.criar(
      slug.toLowerCase(),
      usuario.id,
      chave,
      pedido,
    );
    // Repetição do mesmo pedido: 200 com a mesma reserva, em vez de 201
    res.status(nova ? 201 : 200);
    return reserva;
  }
}

@Controller('reservas')
export class MinhasReservasController {
  constructor(private readonly reservas: ReservasService) {}

  /** `?periodo=proximas` (padrão) ou `anteriores` */
  @Get()
  minhas(
    @UsuarioAtual() usuario: UsuarioDoToken,
    @Query(new ValidacaoZod(esquemaMinhas)) consulta: Minhas,
  ): Promise<ReservaResposta[]> {
    return this.reservas.minhas(usuario.id, consulta);
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(
    @UsuarioAtual() usuario: UsuarioDoToken,
    @Param('id', ID) id: string,
  ): Promise<ReservaResposta> {
    return this.reservas.cancelar(id, usuario.id);
  }
}

@Controller('negocios/:negocioId/agenda')
@Papeis('dono')
export class AgendaController {
  constructor(private readonly reservas: ReservasService) {}

  /** `?de=&ate=` (ISO com fuso); no máximo um ano; sem nada, o próximo ano */
  @Get()
  agenda(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Query(new ValidacaoZod(esquemaPeriodo)) periodo: Periodo,
  ): Promise<ItemDaAgenda[]> {
    return this.reservas.agenda(negocioId, dono.id, periodo);
  }
}
