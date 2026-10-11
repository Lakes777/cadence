import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Papeis, UsuarioAtual } from '../auth/decoradores.js';
import type { UsuarioDoToken } from '../auth/usuario-do-token.js';
import { ID } from '../comum/id.pipe.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import {
  esquemaMudancaServico,
  esquemaNovoServico,
  type MudancaServico,
  type NovoServico,
} from './catalogo.dto.js';
import type { ServicoResposta } from './respostas.js';
import { ServicosService } from './servicos.service.js';

@Controller('negocios/:negocioId/servicos')
@Papeis('dono')
export class ServicosController {
  constructor(private readonly servicos: ServicosService) {}

  @Get()
  listar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
  ): Promise<ServicoResposta[]> {
    return this.servicos.listar(negocioId, dono.id);
  }

  @Post()
  criar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Body(new ValidacaoZod(esquemaNovoServico)) dados: NovoServico,
  ): Promise<ServicoResposta> {
    return this.servicos.criar(negocioId, dono.id, dados);
  }

  @Patch(':id')
  atualizar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Param('id', ID) id: string,
    @Body(new ValidacaoZod(esquemaMudancaServico)) dados: MudancaServico,
  ): Promise<ServicoResposta> {
    return this.servicos.atualizar(negocioId, dono.id, id, dados);
  }
}
