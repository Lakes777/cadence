import type { Papel } from '../api/tipos';

/**
 * Para onde ir depois de entrar. Só caminhos deste site: "//outro.site" ou "https://..."
 * levariam a pessoa embora logo depois de digitar a senha (redirecionamento aberto).
 */
export function destinoDepoisDeEntrar(
  volta: string | null,
  papel: Papel,
): string {
  const padrao = papel === 'dono' ? '/painel' : '/';
  if (!volta || !volta.startsWith('/')) return padrao;
  // Quem decide é o mesmo parser do navegador: ele apaga tabulações e quebras de linha, e
  // "/\t/golpe.com" vira "//golpe.com", que passaria por uma conferência só de texto
  try {
    const url = new URL(volta, location.origin);
    if (url.origin !== location.origin) return padrao;
    return url.pathname + url.search + url.hash;
  } catch {
    return padrao;
  }
}
