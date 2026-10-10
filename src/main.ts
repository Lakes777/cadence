import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { CONFIG, type Config } from './config/config.js';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.disable('x-powered-by');
  // Atrás do Caddy (mesma máquina), req.ip passa a ser o IP de quem chamou, não o do proxy
  app.set('trust proxy', 'loopback');
  app.useLogger(app.get(Logger));
  // SIGTERM do Docker fecha as conexões com o banco antes de sair
  app.enableShutdownHooks();
  const config = app.get<Config>(CONFIG);
  await app.listen(config.PORTA);
}
await iniciar();
