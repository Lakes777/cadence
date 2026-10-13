import type { Papel } from '../api/tipos';

/**
 * Para onde ir depois de entrar. Só caminhos deste site: "//outro.site" ou "https://..."
 * levariam a pessoa embora logo depois de digitar a senha (redirecionamento aberto).
 */
export function destinoDepoisDeEntrar(
  volta: string | null,
  papel: Papel,
): string {
  if (
    volta &&
    volta.startsWith('/') &&
    !volta.startsWith('//') &&
    !volta.startsWith('/\\')
  ) {
    return volta;
  }
  return papel === 'dono' ? '/painel' : '/';
}
