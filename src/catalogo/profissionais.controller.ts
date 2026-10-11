import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { Papeis, UsuarioAtual } from '../auth/decoradores.js';
import type { UsuarioDoToken } from '../auth/usuario-do-token.js';
import { ID } from '../comum/id.pipe.js';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import {
  esquemaHorarios,
  esquemaMudancaProfissional,
  esquemaNovoProfissional,
  esquemaServicosDoProfissional,
  type Horarios,
  type MudancaProfissional,
  type NovoProfissional,
  type ServicosDoProfissional,
} from './catalogo.dto.js';
import { ProfissionaisService } from './profissionais.service.js';
import type { ProfissionalResposta } from './respostas.js';

@Controller('negocios/:negocioId/profissionais')
@Papeis('dono')
export class ProfissionaisController {
  constructor(private readonly profissionais: ProfissionaisService) {}

  @Get()
  listar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
  ): Promise<ProfissionalResposta[]> {
    return this.profissionais.listar(negocioId, dono.id);
  }

  @Post()
  criar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Body(new ValidacaoZod(esquemaNovoProfissional)) dados: NovoProfissional,
  ): Promise<ProfissionalResposta> {
    return this.profissionais.criar(negocioId, dono.id, dados);
  }

  /** Mudar o nome ou desativar (`{"ativo": false}`); não há apagar, por causa das reservas */
  @Patch(':id')
  atualizar(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Param('id', ID) id: string,
    @Body(new ValidacaoZod(esquemaMudancaProfissional))
    dados: MudancaProfissional,
  ): Promise<ProfissionalResposta> {
    return this.profissionais.atualizar(negocioId, dono.id, id, dados);
  }

  @Put(':id/servicos')
  definirServicos(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Param('id', ID) id: string,
    @Body(new ValidacaoZod(esquemaServicosDoProfissional))
    dados: ServicosDoProfissional,
  ): Promise<ProfissionalResposta> {
    return this.profissionais.definirServicos(negocioId, dono.id, id, dados);
  }

  @Put(':id/horarios')
  definirHorarios(
    @UsuarioAtual() dono: UsuarioDoToken,
    @Param('negocioId', ID) negocioId: string,
    @Param('id', ID) id: string,
    @Body(new ValidacaoZod(esquemaHorarios)) dados: Horarios,
  ): Promise<ProfissionalResposta> {
    return this.profissionais.definirHorarios(negocioId, dono.id, id, dados);
  }
}
