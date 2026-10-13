import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDemo } from '../api/hooks';
import './cliente.css';
import { useTitulo } from '../comum/titulo';

/** Só letras minúsculas, números e hífen, como o endereço que a API gera */
const FORMATO_DO_ENDERECO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Aceita o endereço sozinho ou colado com o começo (".../b/barbearia-sao-joao") */
function enderecoDigitado(texto: string): string {
  const limpo = texto.trim().toLowerCase().replace(/\/+$/, '');
  const depoisDoB = limpo.match(/\/b\/([^/?#]+)/);
  return depoisDoB ? depoisDoB[1] : limpo;
}

/** Tela de início: o relógio "09:30 LIVRE", o título e o caminho até a agenda */
export function Inicio() {
  useTitulo(null);
  const demo = useDemo();
  const navegar = useNavigate();
  const [endereco, setEndereco] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const id = useId();

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    const slug = enderecoDigitado(endereco);
    if (!FORMATO_DO_ENDERECO.test(slug)) {
      setErro('Use só letras, números e hífen, como em barbearia-sao-joao.');
      return;
    }
    void navegar(`/b/${slug}`);
  }

  return (
    <section className="inicio">
      <div className="relogio" aria-hidden="true">
        <span className="relogio__hora">09:30</span>
        <span className="relogio__livre">LIVRE</span>
      </div>
      <div className="inicio__texto">
        <h1 className="inicio__titulo">
          <span>Bata o ponto</span> <span>no seu horário.</span>
        </h1>
        <p>
          Escolha o serviço, o profissional e o horário. Ninguém mais fica com
          ele: dois clientes nunca batem o mesmo ponto.
        </p>
        {demo === null ? (
          <p className="carregando">Carregando…</p>
        ) : demo.demo && demo.negocio ? (
          <Link className="botao" to={`/b/${demo.negocio}`}>
            Reservar horário
          </Link>
        ) : (
          <form className="inicio__endereco" onSubmit={aoEnviar} noValidate>
            <p>
              Cada estabelecimento tem o próprio link de reservas. Se você
              recebeu só o endereço, digite aqui:
            </p>
            <label className="inicio__rotulo" htmlFor={id}>
              Endereço do estabelecimento
            </label>
            <div className="inicio__linha">
              <span className="inicio__prefixo" aria-hidden="true">
                /b/
              </span>
              <input
                id={id}
                value={endereco}
                onChange={(e) => {
                  setEndereco(e.target.value);
                  setErro(null);
                }}
                placeholder="barbearia-sao-joao"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? `${id}-erro` : undefined}
              />
            </div>
            {erro && (
              <small className="erro" id={`${id}-erro`}>
                {erro}
              </small>
            )}
            <button className="botao" type="submit">
              Reservar horário
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
