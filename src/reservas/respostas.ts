import type { Reserva } from '../generated/prisma/client.js';

type ReservaCompleta = Reserva & {
  negocio: { nome: string; slug: string; fuso: string };
  servico: { id: string; nome: string };
  profissional: { id: string; nome: string };
};

/** O que o cliente vê da própria reserva */
export interface ReservaResposta {
  id: string;
  negocio: { nome: string; slug: string; fuso: string };
  servico: { id: string; nome: string };
  profissional: { id: string; nome: string };
  inicio: string;
  fim: string;
  precoCentavos: number;
  status: 'confirmada' | 'cancelada';
}

/** O que o dono vê na agenda: inclui quem reservou */
export interface ItemDaAgenda extends Omit<ReservaResposta, 'negocio'> {
  cliente: { nome: string; email: string };
}

export const INCLUIR = {
  negocio: { select: { nome: true, slug: true, fuso: true } },
  servico: { select: { id: true, nome: true } },
  profissional: { select: { id: true, nome: true } },
} as const;

export function reservaResposta(r: ReservaCompleta): ReservaResposta {
  return {
    id: r.id,
    negocio: r.negocio,
    servico: r.servico,
    profissional: r.profissional,
    inicio: r.inicio.toISOString(),
    fim: r.fim.toISOString(),
    precoCentavos: r.precoCentavos,
    status: r.status,
  };
}

export function itemDaAgenda(
  r: ReservaCompleta & { cliente: { nome: string; email: string } },
): ItemDaAgenda {
  const { negocio: _negocio, ...resto } = reservaResposta(r);
  return { ...resto, cliente: r.cliente };
}
