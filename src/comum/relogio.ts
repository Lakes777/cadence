/** Token do relógio: os testes trocam por um relógio parado numa data conhecida. */
export const RELOGIO = Symbol('RELOGIO');

export interface Relogio {
  agora(): Date;
}

export const relogioDoSistema: Relogio = { agora: () => new Date() };
