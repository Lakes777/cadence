import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ErroDaApi, mensagemDe } from '../api/cliente';
import { useDemo } from '../api/hooks';
import { aplicar } from '../api/sessao';
import type { Papel, Sessao } from '../api/tipos';
import { Campo } from '../comum/Campo';
import { Erro } from '../comum/Erro';
import { destinoDepoisDeEntrar } from '../comum/volta';

export function Entrar() {
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const demo = useDemo();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function concluir(pedido: Promise<Sessao>, destinoVisitante?: string) {
    setErro(null);
    setEnviando(true);
    try {
      const sessao = await pedido;
      aplicar(sessao, true);
      await navegar(
        destinoVisitante ??
          destinoDepoisDeEntrar(busca.get('volta'), sessao.usuario.papel),
        { replace: true },
      );
    } catch (e) {
      setErro(
        e instanceof ErroDaApi && e.status === 401
          ? 'E-mail ou senha incorretos.'
          : mensagemDe(e),
      );
      setEnviando(false);
    }
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    void concluir(
      api<Sessao>('/auth/entrar', { metodo: 'POST', corpo: { email, senha } }),
    );
  }

  function comoVisitante(papel: Papel) {
    const volta = busca.get('volta');
    const destino =
      papel === 'dono'
        ? '/painel'
        : volta
          ? destinoDepoisDeEntrar(volta, 'cliente')
          : demo?.negocio
            ? `/b/${demo.negocio}`
            : '/';
    void concluir(
      api<Sessao>('/auth/visitante', { metodo: 'POST', corpo: { papel } }),
      destino,
    );
  }

  return (
    <section className="cartao" style={{ maxWidth: '32rem', margin: '0 auto' }}>
      <h1>Entrar</h1>
      <Erro mensagem={erro} />
      {demo?.demo && (
        <div className="aviso">
          <p>Para conhecer sem criar conta:</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="botao"
              disabled={enviando}
              onClick={() => comoVisitante('cliente')}
            >
              Entrar como cliente
            </button>
            <button
              type="button"
              className="botao botao--contorno"
              disabled={enviando}
              onClick={() => comoVisitante('dono')}
            >
              Entrar como estabelecimento
            </button>
          </div>
        </div>
      )}
      <form className="formulario" onSubmit={aoEnviar}>
        <Campo
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <hr className="linha-tracejada" />
      <p>
        Não tem conta?{' '}
        <Link to={`/cadastro${location.search}`}>Criar conta</Link>
      </p>
    </section>
  );
}
