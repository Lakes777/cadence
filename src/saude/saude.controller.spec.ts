import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../banco/prisma.service.js';
import { LIMITE_DA_CONSULTA_MS, SaudeController } from './saude.controller.js';

function controladorCom(consulta: () => Promise<unknown>): SaudeController {
  const prisma = { $queryRaw: consulta } as unknown as PrismaService;
  return new SaudeController(prisma);
}

describe('SaudeController', () => {
  let aviso: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('responde ok quando o banco responde', async () => {
    const controlador = controladorCom(() =>
      Promise.resolve([{ '?column?': 1 }]),
    );
    await expect(controlador.verificar()).resolves.toEqual({
      status: 'ok',
      banco: 'ok',
    });
    expect(aviso).not.toHaveBeenCalled();
  });

  it('responde 503 sem vazar o erro do banco, mas registra o motivo no log', async () => {
    const controlador = controladorCom(() =>
      Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    );
    const erro = await controlador.verificar().catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    const corpo = (erro as ServiceUnavailableException).getResponse();
    expect(corpo).toEqual({ status: 'erro', banco: 'fora do ar' });
    expect(JSON.stringify(corpo)).not.toContain('10.0.0.5');
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED 10.0.0.5:5432'),
    );
  });

  it('responde 503 quando o banco congela e a consulta nunca termina', async () => {
    vi.useFakeTimers();
    const controlador = controladorCom(() => new Promise(() => {}));
    const resultado = controlador.verificar().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(LIMITE_DA_CONSULTA_MS - 1);
    let terminou = false;
    void resultado.then(() => (terminou = true));
    await Promise.resolve();
    expect(terminou).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await resultado).toBeInstanceOf(ServiceUnavailableException);
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('não respondeu em 5000 ms'),
    );
  });

  it('não deixa o relógio do limite pendurado depois de responder', async () => {
    vi.useFakeTimers();
    const controlador = controladorCom(() => Promise.resolve([]));
    await controlador.verificar();
    expect(vi.getTimerCount()).toBe(0);
  });
});
