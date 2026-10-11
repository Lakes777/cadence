/** Formato aceito (o banco tem a mesma regra): minúsculas, números e hífens entre palavras. */
export const FORMATO_DO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TAMANHO_MAXIMO_DO_SLUG = 60;

/** "Barbearia São João!" -> "barbearia-sao-joao". Pode voltar vazio (nome só com símbolos). */
export function gerarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAMANHO_MAXIMO_DO_SLUG)
    .replace(/-+$/, '');
}
