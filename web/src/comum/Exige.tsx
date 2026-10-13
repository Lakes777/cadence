import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSessao } from '../api/hooks';
import type { Papel } from '../api/tipos';

/**
 * Só mostra o conteúdo para quem está logado (com o papel, se dado). Sem login, manda para
 * /entrar e volta depois; com outro papel, explica em vez de redirecionar em silêncio.
 */
export function Exige({
  papel,
  children,
}: {
  papel?: Papel;
  children: ReactNode;
}) {
  const { usuario, carregando } = useSessao();
  const local = useLocation();
  if (carregando) return <p className="carregando">Carregando…</p>;
  if (!usuario) {
    const volta = encodeURIComponent(local.pathname + local.search);
    return <Navigate to={`/entrar?volta=${volta}`} replace />;
  }
  if (papel && usuario.papel !== papel) {
    return (
      <div className="cartao" role="alert">
        <h2>Área {papel === 'dono' ? 'do estabelecimento' : 'do cliente'}</h2>
        <p>
          Você entrou como{' '}
          {usuario.papel === 'dono' ? 'estabelecimento' : 'cliente'}. Esta
          página é para {papel === 'dono' ? 'estabelecimentos' : 'clientes'}.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
