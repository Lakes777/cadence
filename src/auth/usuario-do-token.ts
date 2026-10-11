import type { Papel } from '../generated/prisma/client.js';

/** O que o token de acesso carrega e os guards põem em `req.usuario`. */
export interface UsuarioDoToken {
  id: string;
  papel: Papel;
}

export interface UsuarioPublico {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
}

export interface Sessao {
  usuario: UsuarioPublico;
  tokenDeAcesso: string;
  /** Segundos até o token de acesso vencer (a interface renova um pouco antes) */
  expiraEm: number;
  /** Vai só no cookie httpOnly, nunca no corpo da resposta */
  tokenDeRenovacao: string;
  /** Quando o token de renovação vence (o cookie some junto) */
  renovacaoExpiraEm: Date;
}
