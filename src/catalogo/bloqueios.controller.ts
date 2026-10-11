import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Papeis, UsuarioAtual } from '../auth/decoradores.js';
import type { UsuarioDoToken } from '../auth/usuario-do-token.js';
import { ID } from '../comum/id.pipe.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import {
  esquemaNovoBloqueio,
  esquemaPeriodo,
  type NovoBloqueio,
  type Periodo,
} from './catalogo.dto.js';
import { BloqueiosService } from './bloqueios.service.js';
import type { BloqueioResposta } from './respostas.js';

@Controller('negocios/:negocioId/bloqueios')
@Papeis('dono')
export class BloqueiosController {
  constructor(private readonly bloqueios: BloqueiosService) {}

  /** `?de=...&ate=...` (ISO com fuso); sem `de`, de agora em diante */
  @Get()
  listar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Query(new ValidacaoZod(esquemaPeriodo)) periodo: Periodo,
  ): Promise<BloqueioResposta[]> {
    return this.bloqueios.listar(negocioId, dono.id, periodo);
  }

  @Post()
  criar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Body(new ValidacaoZod(esquemaNovoBloqueio)) dados: NovoBloqueio,
  ): Promise<BloqueioResposta> {
    return this.bloqueios.criar(negocioId, dono.id, dados);
  }

  @Delete(':id')
  @HttpCode(204)
  remover(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Param('id', ID) id: string,
  ): Promise<void> {
    return this.bloqueios.remover(negocioId, dono.id, id);
  }
}
