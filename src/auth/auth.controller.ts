import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { ValidacaoZod } from '../comum/validacao-zod.pipe.js';
import { CONFIG, type Config } from '../config/config.js';
import {
  esquemaDeCadastro,
  esquemaDeLogin,
  type Cadastro,
  type Login,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { Publica, UsuarioAtual } from './decoradores.js';
import { ExigeJsonGuard } from './exige-json.guard.js';
import { COOKIE_DE_RENOVACAO } from './token-de-renovacao.js';
import type {
  Sessao,
  UsuarioDoToken,
  UsuarioPublico,
} from './usuario-do-token.js';

type RespostaDeSessao = Omit<Sessao, 'tokenDeRenovacao' | 'renovacaoExpiraEm'>;

@Controller('auth')
@UseGuards(ExigeJsonGuard, ThrottlerGuard)
export class AuthController {
  private readonly cookie: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) config: Config,
  ) {
    this.cookie = {
      httpOnly: true,
      // Em produção só vai por HTTPS; nos testes e em dev o servidor é HTTP
      secure: config.NODE_ENV === 'production',
      // Outro site não consegue fazer o navegador mandar o cookie (proteção contra CSRF)
      sameSite: 'strict',
      // O cookie só vai para as rotas que precisam dele
      path: '/auth',
    };
  }

  @Post('cadastro')
  @Publica()
  async cadastrar(
    @Body(new ValidacaoZod(esquemaDeCadastro)) dados: Cadastro,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaDeSessao> {
    return this.responder(await this.auth.cadastrar(dados), res);
  }

  @Post('entrar')
  @Publica()
  @HttpCode(200)
  async entrar(
    @Body(new ValidacaoZod(esquemaDeLogin)) dados: Login,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaDeSessao> {
    return this.responder(await this.auth.entrar(dados), res);
  }

  @Post('renovar')
  @Publica()
  @HttpCode(200)
  async renovar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RespostaDeSessao> {
    try {
      return this.responder(await this.auth.renovar(lerCookie(req)), res);
    } catch (erro) {
      // Cookie que não serve mais: apaga, para o navegador parar de mandar
      res.clearCookie(COOKIE_DE_RENOVACAO, this.cookie);
      throw erro;
    }
  }

  @Post('sair')
  @Publica()
  @SkipThrottle()
  @HttpCode(204)
  async sair(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.sair(lerCookie(req));
    res.clearCookie(COOKIE_DE_RENOVACAO, this.cookie);
  }

  @Get('eu')
  @SkipThrottle()
  eu(@UsuarioAtual() usuario: UsuarioDoToken): Promise<UsuarioPublico> {
    return this.auth.buscar(usuario.id);
  }

  private responder(
    { tokenDeRenovacao, renovacaoExpiraEm, ...sessao }: Sessao,
    res: Response,
  ): RespostaDeSessao {
    res.cookie(COOKIE_DE_RENOVACAO, tokenDeRenovacao, {
      ...this.cookie,
      // O cookie some quando o token vence (30 dias, ou antes, no fim da família)
      expires: renovacaoExpiraEm,
    });
    // A resposta tem token de acesso: nenhum cache (nem proxy) pode guardar
    res.setHeader('Cache-Control', 'no-store');
    return sessao;
  }
}

function lerCookie(req: Request): string | undefined {
  const valor: unknown = req.cookies?.[COOKIE_DE_RENOVACAO];
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}
