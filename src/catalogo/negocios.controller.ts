import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Papeis, Publica, UsuarioAtual } from '../auth/decoradores.js';
import type { UsuarioDoToken } from '../auth/usuario-do-token.js';
import { ID } from '../comum/id.pipe.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import {
  esquemaMudancaNegocio,
  esquemaNovoNegocio,
  type MudancaNegocio,
  type NovoNegocio,
} from './catalogo.dto.js';
import { NegociosService } from './negocios.service.js';
import type { NegocioResposta, VitrineResposta } from './respostas.js';

@Controller('negocios')
@Papeis('dono')
export class NegociosController {
  constructor(private readonly negocios: NegociosService) {}

  @Post()
  criar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Body(new ValidacaoZod(esquemaNovoNegocio)) dados: NovoNegocio,
  ): Promise<NegocioResposta> {
    return this.negocios.criar(dono.id, dados);
  }

  /** Os negócios de quem está logado */
  @Get()
  meus(@UsuarioAtual() dono: UsuarioDoToken): Promise<NegocioResposta[]> {
    return this.negocios.meus(dono.id);
  }

  @Patch(':id')
  atualizar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('id', ID) id: string,
    @Body(new ValidacaoZod(esquemaMudancaNegocio)) dados: MudancaNegocio,
  ): Promise<NegocioResposta> {
    return this.negocios.atualizar(id, dono.id, dados);
  }
}

/** Separado porque não tem o `@Papeis('dono')` da classe acima: qualquer um vê a vitrine. */
@Controller('negocios')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ conta: true })
export class VitrineController {
  constructor(private readonly negocios: NegociosService) {}

  @Get(':slug')
  @Publica()
  vitrine(@Param('slug') slug: string): Promise<VitrineResposta> {
    return this.negocios.vitrine(slug.toLowerCase());
  }
}
