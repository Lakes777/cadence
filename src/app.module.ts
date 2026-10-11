import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { BancoModule } from './banco/banco.module.js';
import { CatalogoModule } from './catalogo/catalogo.module.js';
import { CONFIG, type Config } from './config/config.js';
import { ConfigModule } from './config/config.module.js';
import { SaudeModule } from './saude/saude.module.js';

const ID_DO_PEDIDO = /^[\w-]{1,64}$/;

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: Config) => ({
        pinoHttp: {
          level: config.NIVEL_DO_LOG,
          // Aproveita o X-Request-Id de quem chamou (ex.: o Caddy) só se for um id razoável
          genReqId: (req, res) => {
            const recebido = req.headers['x-request-id'];
            const id =
              typeof recebido === 'string' && ID_DO_PEDIDO.test(recebido)
                ? recebido
                : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
          ],
          // O /saude é chamado a cada minuto pelo Vigil; não precisa encher o log
          autoLogging: { ignore: (req) => req.url === '/saude' },
          transport:
            config.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    BancoModule,
    AuthModule,
    CatalogoModule,
    SaudeModule,
  ],
})
export class AppModule {}
