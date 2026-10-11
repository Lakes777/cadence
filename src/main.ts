import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { CONFIG, type Config } from './config/config.js';
import { configurarApp } from './configurar-app.js';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  configurarApp(app);
  app.useLogger(app.get(Logger));
  // SIGTERM do Docker fecha as conexões com o banco antes de sair
  app.enableShutdownHooks();
  const config = app.get<Config>(CONFIG);
  await app.listen(config.PORTA);
}
await iniciar();
