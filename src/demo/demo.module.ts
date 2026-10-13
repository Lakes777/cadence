import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller.js';

/**
 * Modo demonstração (CADENCE_DEMO=true). Aqui fica só o GET /demo; a entrada de visitante é
 * POST /auth/visitante (mesmo cookie de /auth/entrar) e a reposição é o comando
 * `npm run semear-demo` (src/demo/semear.ts), fora da API.
 */
@Module({ controllers: [DemoController] })
export class DemoModule {}
