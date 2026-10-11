import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { CONFIG, type Config } from './config/config.js';

/** O que vale tanto para o servidor de verdade quanto para os testes de ponta a ponta. */
export function configurarApp(app: NestExpressApplication): void {
  const config = app.get<Config>(CONFIG);
  app.disable('x-powered-by');
  // Atrás do Caddy, req.ip passa a ser o IP de quem chamou, não o do proxy (ver CONFIANCA_NO_PROXY)
  app.set('trust proxy', config.CONFIANCA_NO_PROXY);
  app.use(cookieParser());
}
