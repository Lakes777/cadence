import { createHash, randomBytes } from 'node:crypto';

/** 30 dias: cada renovação empurra o prazo; quem fica 30 dias sem abrir precisa entrar de novo. */
export const DIAS_DO_TOKEN_DE_RENOVACAO = 30;

/** Prazo máximo de uma família: um token roubado não serve para sempre, mesmo renovado. */
export const DIAS_DA_FAMILIA = 90;

/** Pedido repetido com o mesmo token dentro desta janela não conta como roubo (ver renovar). */
export const SEGUNDOS_DE_TOLERANCIA = 30;

export const COOKIE_DE_RENOVACAO = 'cadence_renovacao';

/** 256 bits aleatórios: não precisa de sal nem de hash lento, só não pode ficar legível no banco. */
export function novoTokenDeRenovacao(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** 30 dias a partir de agora, mas nunca depois do fim da família. */
export function expiracaoDoTokenDeRenovacao(
  agora: Date,
  familiaCriadaEm: Date,
): Date {
  return new Date(
    Math.min(
      agora.getTime() + DIAS_DO_TOKEN_DE_RENOVACAO * DIA_MS,
      fimDaFamilia(familiaCriadaEm).getTime(),
    ),
  );
}

export function fimDaFamilia(familiaCriadaEm: Date): Date {
  return new Date(familiaCriadaEm.getTime() + DIAS_DA_FAMILIA * DIA_MS);
}
