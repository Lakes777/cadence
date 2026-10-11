import { Logger } from '@nestjs/common';
import type { Config } from '../config/config.js';
import type { LembretesService } from './lembretes.service.js';
import { TrabalhadorDeLembretes } from './trabalhador.js';

describe('TrabalhadorDeLembretes.conferir', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('um envio que falha não segura os outros do lote', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const enviados: string[] = [];
    const lembretes = {
      atrasados: () => Promise.resolve(['a', 'quebrada', 'b']),
      enviar: (id: string) => {
        if (id === 'quebrada') return Promise.reject(new RangeError('fuso'));
        enviados.push(id);
        return Promise.resolve('enviado');
      },
    } as unknown as LembretesService;
    const trabalhador = new TrabalhadorDeLembretes({} as Config, lembretes);
    await trabalhador.conferir();
    expect(enviados).toEqual(['a', 'b']);
  });

  it('não roda duas conferências ao mesmo tempo', async () => {
    let chamadas = 0;
    const lembretes = {
      atrasados: () => {
        chamadas++;
        return Promise.resolve([]);
      },
    } as unknown as LembretesService;
    const trabalhador = new TrabalhadorDeLembretes({} as Config, lembretes);
    await Promise.all([trabalhador.conferir(), trabalhador.conferir()]);
    expect(chamadas).toBe(1);
  });
});
