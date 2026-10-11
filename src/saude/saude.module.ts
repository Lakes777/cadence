import { Module } from '@nestjs/common';
import { LembretesModule } from '../lembretes/lembretes.module.js';
import { SaudeController } from './saude.controller.js';

@Module({ imports: [LembretesModule], controllers: [SaudeController] })
export class SaudeModule {}
