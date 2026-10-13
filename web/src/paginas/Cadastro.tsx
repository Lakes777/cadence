import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, ErroDaApi, mensagemDe } from '../api/cliente';
import { aplicar } from '../api/sessao';
import type { Papel, Sessao } from '../api/tipos';
import { Campo } from '../comum/Campo';
import { Erro } from '../comum/Erro';
import { destinoDepoisDeEntrar } from '../comum/volta';

export function Cadastro() {
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Papel>('cliente');
  const [erro, setErro] = useState<ErroDaApi | string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const sessao = await api<Sessao>('/auth/cadastro', {
        metodo: 'POST',
        corpo: { nome, email, senha, papel },
      });
      aplicar(sessao, true);
      await navegar(
        destinoDepoisDeEntrar(busca.get('volta'), sessao.usuario.papel),
        {
          replace: true,
        },
      );
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e : mensagemDe(e));
      setEnviando(false);
    }
  }

  const doCampo = (campo: string) =>
    erro instanceof ErroDaApi ? erro.doCampo(campo) : undefined;
  const geral =
    typeof erro === 'string'
      ? erro
      : erro && erro.erros.length === 0
        ? erro.message
        : null;

  return (
    <section className="cartao" style={{ maxWidth: '32rem', margin: '0 auto' }}>
      <h1>Criar conta</h1>
      <Erro mensagem={geral} />
      <form className="formulario" onSubmit={(e) => void aoEnviar(e)}>
        <fieldset
          className="campo"
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <legend className="miudo">Eu sou</legend>
          <label>
            <input
              type="radio"
              name="papel"
              checked={papel === 'cliente'}
              onChange={() => setPapel('cliente')}
            />{' '}
            Cliente (quero reservar horários)
          </label>
          <label>
            <input
              type="radio"
              name="papel"
              checked={papel === 'dono'}
              onChange={() => setPapel('dono')}
            />{' '}
            Estabelecimento (quero receber reservas)
          </label>
        </fieldset>
        <Campo
          rotulo="Nome"
          autoComplete="name"
          required
          maxLength={80}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          erro={doCampo('nome')}
        />
        <Campo
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          erro={doCampo('email')}
        />
        <Campo
          rotulo="Senha (pelo menos 8 caracteres)"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          erro={doCampo('senha')}
        />
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <hr className="linha-tracejada" />
      <p>
        Já tem conta? <Link to={`/entrar${location.search}`}>Entrar</Link>
      </p>
    </section>
  );
}
