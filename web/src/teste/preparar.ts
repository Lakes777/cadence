import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { esquecerDemoParaTeste } from '../api/hooks';
import { reiniciarSessaoParaTeste } from '../api/sessao';
import { trocarTempoRealParaTeste } from '../api/tempo-real';
import { WebSocketFalso } from './websocket-falso';

// Nenhum teste fala com um servidor de verdade: sem isto, uma tela que assina um negócio abriria
// um WebSocket real para localhost:3000 (a porta padrão da API), e com a API rodando em dev os
// testes assinariam negócios nela
beforeEach(() => {
  vi.stubGlobal('WebSocket', WebSocketFalso);
});

afterEach(() => {
  cleanup();
  reiniciarSessaoParaTeste();
  esquecerDemoParaTeste();
  trocarTempoRealParaTeste(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
