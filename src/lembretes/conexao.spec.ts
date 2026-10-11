import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { esperarConexao, vigiarConexao } from './conexao.js';

function conexaoFalsa(status = 'connecting') {
  return Object.assign(new EventEmitter(), { status }) as unknown as Redis &
    EventEmitter & { status: string };
}

describe('vigiarConexao', () => {
  it('registra a queda e a volta uma vez, não cada tentativa de reconectar', () => {
    const logger = new Logger('teste');
    const aviso = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(logger, 'log').mockImplementation(() => {});
    const conexao = conexaoFalsa();
    vigiarConexao(conexao, logger);

    conexao.emit('ready');
    expect(info).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++)
      conexao.emit('error', new Error('ECONNREFUSED'));
    expect(aviso).toHaveBeenCalledTimes(1);
    conexao.emit('ready');
    conexao.emit('ready');
    expect(info).toHaveBeenCalledTimes(1);
    conexao.emit('error', new Error('caiu de novo'));
    expect(aviso).toHaveBeenCalledTimes(2);
  });
});

describe('esperarConexao', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('responde na hora se a conexão já está pronta', async () => {
    await expect(esperarConexao(conexaoFalsa('ready'), 1_000)).resolves.toBe(
      true,
    );
  });

  it('espera o "ready" e não deixa ouvinte nem relógio pendurados', async () => {
    vi.useFakeTimers();
    const conexao = conexaoFalsa();
    const pronta = esperarConexao(conexao, 2_000);
    conexao.emit('ready');
    await expect(pronta).resolves.toBe(true);
    expect(conexao.listenerCount('ready')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('desiste depois do limite (a API sobe sem o Redis)', async () => {
    vi.useFakeTimers();
    const conexao = conexaoFalsa();
    const pronta = esperarConexao(conexao, 2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pronta).resolves.toBe(false);
    expect(conexao.listenerCount('ready')).toBe(0);
  });
});
