import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { UsuarioAtual } from '../auth/decoradores.js';
import type { UsuarioDoToken } from '../auth/usuario-do-token.js';
import { ID } from '../comum/id.pipe.js';
import { LembretesService, type AvisoResposta } from './lembretes.service.js';

/** Os avisos de quem está logado (por enquanto, os lembretes das reservas) */
@Controller('avisos')
export class AvisosController {
  constructor(private readonly lembretes: LembretesService) {}

  /** Os 50 mais recentes, do mais novo para o mais antigo */
  @Get()
  avisos(@UsuarioAtual() usuario: UsuarioDoToken): Promise<AvisoResposta[]> {
    return this.lembretes.avisos(usuario.id);
  }

  @Post(':id/lido')
  @HttpCode(200)
  marcarLido(
    @UsuarioAtual() usuario: UsuarioDoToken,
    @Param('id', ID) id: string,
  ): Promise<AvisoResposta> {
    return this.lembretes.marcarLido(id, usuario.id);
  }
}
