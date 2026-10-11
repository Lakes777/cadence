import type {
  Bloqueio,
  HorarioDeTrabalho,
  Negocio,
  Profissional,
  Servico,
} from '../generated/prisma/client.js';
import { paraHora } from './horarios.js';

/** Formatos de resposta: o que sai da API (sem dono_id, criado_em e afins). */

export interface NegocioResposta {
  id: string;
  nome: string;
  slug: string;
  fuso: string;
}

export interface HorarioResposta {
  diaDaSemana: number;
  inicio: string;
  fim: string;
}

export interface ProfissionalResposta {
  id: string;
  nome: string;
  ativo: boolean;
  servicoIds: string[];
  horarios: HorarioResposta[];
}

export interface ServicoResposta {
  id: string;
  nome: string;
  duracaoMin: number;
  precoCentavos: number;
  ativo: boolean;
}

export interface BloqueioResposta {
  id: string;
  profissionalId: string | null;
  inicio: string;
  fim: string;
  motivo: string | null;
}

/** O que o cliente vê: só o que está ativo e pode ser reservado */
export interface VitrineResposta {
  nome: string;
  slug: string;
  fuso: string;
  profissionais: { id: string; nome: string }[];
  servicos: (Omit<ServicoResposta, 'ativo'> & { profissionalIds: string[] })[];
}

export function negocioResposta({
  id,
  nome,
  slug,
  fuso,
}: Negocio): NegocioResposta {
  return { id, nome, slug, fuso };
}

export function horariosResposta(
  horarios: HorarioDeTrabalho[],
): HorarioResposta[] {
  return [...horarios]
    .sort((a, b) => a.diaDaSemana - b.diaDaSemana || a.inicioMin - b.inicioMin)
    .map((h) => ({
      diaDaSemana: h.diaDaSemana,
      inicio: paraHora(h.inicioMin),
      fim: paraHora(h.fimMin),
    }));
}

export function profissionalResposta(
  p: Profissional & {
    servicos: { servicoId: string }[];
    horarios: HorarioDeTrabalho[];
  },
): ProfissionalResposta {
  return {
    id: p.id,
    nome: p.nome,
    ativo: p.ativo,
    servicoIds: p.servicos.map((s) => s.servicoId).sort(),
    horarios: horariosResposta(p.horarios),
  };
}

export function servicoResposta(s: Servico): ServicoResposta {
  return {
    id: s.id,
    nome: s.nome,
    duracaoMin: s.duracaoMin,
    precoCentavos: s.precoCentavos,
    ativo: s.ativo,
  };
}

export function bloqueioResposta(b: Bloqueio): BloqueioResposta {
  return {
    id: b.id,
    profissionalId: b.profissionalId,
    inicio: b.inicio.toISOString(),
    fim: b.fim.toISOString(),
    motivo: b.motivo,
  };
}
