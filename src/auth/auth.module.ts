import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { CONFIG, type Config } from '../config/config.js';
import { AuthController } from './auth.controller.js';
import { AuthService, SEGUNDOS_DO_TOKEN_DE_ACESSO } from './auth.service.js';
import { AutenticacaoGuard } from './autenticacao.guard.js';
import { PapeisGuard } from './papeis.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (config: Config) => ({
        secret: config.JWT_SEGREDO,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: SEGUNDOS_DO_TOKEN_DE_ACESSO,
        },
        // Fixar o algoritmo impede token com "alg: none" ou outro algoritmo
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // A ordem importa: primeiro quem é (401), depois o que pode (403)
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
    { provide: APP_GUARD, useClass: PapeisGuard },
  ],
})
export class AuthModule {}
