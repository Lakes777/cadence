import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TempoReal } from './tempo-real.js';

/** WebSocket: horários que somem na hora e avisos sem recarregar a página (fase 7). */
@Module({
  imports: [AuthModule],
  providers: [TempoReal],
  exports: [TempoReal],
})
export class TempoRealModule {}
