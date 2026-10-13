import { NavLink, Link, Outlet, useNavigate } from 'react-router';
import { useDemo, useSessao } from '../api/hooks';
import { sair } from '../api/sessao';

/** Cabeçalho (a marca e o que cada papel acessa), a faixa da demonstração e o rodapé */
export function Layout() {
  const { usuario } = useSessao();
  const demo = useDemo();
  const navegar = useNavigate();

  async function aoSair() {
    await sair();
    await navegar('/');
  }

  return (
    <>
      {demo?.demo && (
        <p className="faixa-demo" role="note">
          Demonstração: os dados voltam ao original a cada hora.
        </p>
      )}
      <header className="cabecalho">
        <div className="cabecalho__dentro">
          <Link to="/" className="marca">
            <img src="/icone.svg" alt="" width="24" height="24" />
            CADENCE
          </Link>
          <nav className="navegacao" aria-label="Principal">
            {usuario?.papel === 'dono' && (
              <NavLink to="/painel">Painel</NavLink>
            )}
            {usuario?.papel === 'cliente' && (
              <NavLink to="/minhas">Minhas reservas</NavLink>
            )}
            {usuario ? (
              <>
                <span className="miudo">{usuario.nome}</span>
                <button
                  type="button"
                  className="botao-link"
                  onClick={() => void aoSair()}
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <NavLink to="/entrar">Entrar</NavLink>
                <NavLink to="/cadastro">Criar conta</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="pagina" id="conteudo">
        <Outlet />
      </main>
      <footer className="rodape">
        Cadence: agenda de reservas sem reserva dupla ·{' '}
        <a href="https://github.com/Lakes777/cadence">código no GitHub</a>
      </footer>
    </>
  );
}
