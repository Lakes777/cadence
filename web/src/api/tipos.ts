/**
 * Os formatos que a API devolve (espelham os arquivos respostas.ts do servidor).
 * Datas e horas chegam em UTC (ISO); `hora` e `data` já vêm no fuso do negócio.
 */

export type Papel = 'cliente' | 'dono';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
}

/** Resposta de cadastro, entrar, renovar e visitante */
export interface Sessao {
  usuario: Usuario;
  tokenDeAcesso: string;
  /** Segundos até o token de acesso vencer */
  expiraEm: number;
}

export interface Negocio {
  id: string;
  nome: string;
  slug: string;
  fuso: string;
}

export interface HorarioSemanal {
  /** 0 = domingo ... 6 = sábado */
  diaDaSemana: number;
  inicio: string;
  fim: string;
}

export interface Profissional {
  id: string;
  nome: string;
  ativo: boolean;
  servicoIds: string[];
  horarios: HorarioSemanal[];
}

export interface Servico {
  id: string;
  nome: string;
  duracaoMin: number;
  precoCentavos: number;
  ativo: boolean;
}

export interface Bloqueio {
  id: string;
  profissionalId: string | null;
  inicio: string;
  fim: string;
  motivo: string | null;
}

/** GET /negocios/:slug (público): só o que está ativo */
export interface Vitrine {
  nome: string;
  slug: string;
  fuso: string;
  profissionais: { id: string; nome: string }[];
  servicos: (Omit<Servico, 'ativo'> & { profissionalIds: string[] })[];
}

export interface HorarioLivre {
  inicio: string;
  fim: string;
  /** HH:MM no fuso do negócio */
  hora: string;
  profissionalIds: string[];
}

/** GET /negocios/:slug/disponibilidade */
export interface Disponibilidade {
  data: string;
  fuso: string;
  servico: { id: string; nome: string; duracaoMin: number };
  horarios: HorarioLivre[];
}

export interface Reserva {
  id: string;
  negocio: { nome: string; slug: string; fuso: string };
  servico: { id: string; nome: string };
  profissional: { id: string; nome: string };
  inicio: string;
  fim: string;
  precoCentavos: number;
  status: 'confirmada' | 'cancelada';
}

/** GET /negocios/:id/agenda (dono): inclui quem reservou */
export interface ItemDaAgenda extends Omit<Reserva, 'negocio'> {
  cliente: { nome: string; email: string };
}

export interface Aviso {
  id: string;
  tipo: 'lembrete';
  texto: string;
  reservaId: string;
  reservaCancelada: boolean;
  criadoEm: string;
  lidoEm: string | null;
}

/** O que chega pelo WebSocket (ver a seção "Tempo real" do README) */
export type MensagemDoServidor =
  | { tipo: 'horarios'; negocio: string; de: string; ate: string }
  | { tipo: 'catalogo'; negocio: string; novoEndereco?: string }
  | { tipo: 'reserva'; reserva: Reserva }
  | { tipo: 'aviso'; aviso: Aviso }
  | { tipo: 'entrou'; expiraEm: number }
  | { tipo: 'saiu' }
  | { tipo: 'sessaoVencida' }
  | { tipo: 'assinado'; negocio: string }
  | { tipo: 'desassinado'; negocio: string }
  | { tipo: 'erro'; mensagem: string };
