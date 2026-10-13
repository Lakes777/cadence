/**
 * O que identifica a demonstração (CADENCE_DEMO=true): o negócio de exemplo e as contas que a
 * reposição pode apagar. Toda conta da demonstração usa um e-mail neste domínio; `.invalid` é
 * reservado (RFC 2606) e nunca existe de verdade, então nenhum e-mail real cai aqui por acaso.
 */
export const DOMINIO_DA_DEMO = 'demo.cadence.invalid';

export const SLUG_DA_DEMO = 'barbearia-exemplo';
export const NOME_DA_DEMO = 'Barbearia Exemplo';
export const FUSO_DA_DEMO = 'America/Sao_Paulo';

/** A conta do dono, compartilhada por todos os visitantes que entram como dono */
export const EMAIL_DO_DONO_DA_DEMO = `dono@${DOMINIO_DA_DEMO}`;

/**
 * Hash que nenhuma senha confere (não tem o formato `scrypt$...`, e `conferirSenha` trata hash
 * mal formado como senha errada): as contas da demonstração só entram por /auth/visitante.
 */
export const SENHA_DE_DEMONSTRACAO = 'demo$sem-senha';

/**
 * Limites contra abuso (um script poderia encher a agenda ou o banco entre uma reposição e
 * outra): reservas futuras por visitante (aqui) e contas de visitante criadas por hora
 * (VISITANTES_POR_HORA, na configuração).
 */
export const RESERVAS_POR_VISITANTE = 3;

/** A conta é da demonstração (a reposição pode apagar)? */
export function ehDaDemo(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DOMINIO_DA_DEMO}`);
}

/** E-mail novo para cada visitante cliente: cada um vê só as próprias reservas */
export function emailDeVisitante(id: string): string {
  return `visitante-${id}@${DOMINIO_DA_DEMO}`;
}
