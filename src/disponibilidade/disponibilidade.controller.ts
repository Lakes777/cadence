import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Publica } from '../auth/decoradores.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { esquemaConsulta, type Consulta } from './disponibilidade.dto.js';
import {
  DisponibilidadeService,
  type DisponibilidadeResposta,
} from './disponibilidade.service.js';

@Controller('negocios/:slug/disponibilidade')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ conta: true })
export class DisponibilidadeController {
  constructor(private readonly disponibilidade: DisponibilidadeService) {}

  /** `?servicoId=...&data=AAAA-MM-DD[&profissionalId=...]`: os horários livres do dia */
  @Get()
  @Publica()
  consultar(
    @Param('slug') slug: string,
    @Query(new ValidacaoZod(esquemaConsulta)) consulta: Consulta,
  ): Promise<DisponibilidadeResposta> {
    return this.disponibilidade.consultar(slug.toLowerCase(), consulta);
  }
}
