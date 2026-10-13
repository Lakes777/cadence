import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { esquecerDemoParaTeste } from '../api/hooks';
import { reiniciarSessaoParaTeste } from '../api/sessao';
import { trocarTempoRealParaTeste } from '../api/tempo-real';

afterEach(() => {
  cleanup();
  reiniciarSessaoParaTeste();
  esquecerDemoParaTeste();
  trocarTempoRealParaTeste(null);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
