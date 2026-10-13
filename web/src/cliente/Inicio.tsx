import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, mensagemDe } from '../api/cliente';
import { useDemo, useSessao } from '../api/hooks';
import { aplicar } from '../api/sessao';
import type { Sessao } from '../api/tipos';
import { Erro } from '../comum/Erro';
import { useRevelar } from '../comum/revelar';
import { useTitulo } from '../comum/titulo';
import { CartaoDoInicio } from './CartaoDoInicio';
import './cliente.css';

/** Só letras minúsculas, números e hífen, como o endereço que a API gera */
const FORMATO_DO_ENDERECO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Aceita o endereço sozinho ou colado com o começo (".../b/barbearia-sao-joao") */
function enderecoDigitado(texto: string): string {
  const limpo = texto.trim().toLowerCase().replace(/\/+$/, '');
  const depoisDoB = limpo.match(/\/b\/([^/?#]+)/);
  return depoisDoB ? depoisDoB[1] : limpo;
}

const PASSOS_DO_CLIENTE = [
  ['Abra o link', 'Cada estabelecimento tem o próprio endereço de reservas.'],
  ['Escolha', 'Serviço, profissional, dia e um horário livre na grade.'],
  [
    'Pronto',
    'A reserva é sua. Lembrete 24 h antes; cancela até 2 h antes, sozinho.',
  ],
] as const;

const PASSOS_DO_DONO = [
  ['Cadastre', 'Serviços com duração e preço, e quem atende cada um.'],
  [
    'Defina a semana',
    'O horário de trabalho de cada profissional, com intervalos.',
  ],
  [
    'Acompanhe',
    'As reservas chegam no painel na hora, sem recarregar a página.',
  ],
] as const;

const GARANTIAS = [
  [
    'Sem reserva dupla',
    'O banco recusa dois clientes no mesmo horário do mesmo profissional, mesmo se clicarem juntos.',
  ],
  [
    'Ao vivo',
    'Quando alguém reserva, o horário some da tela de todo mundo que está olhando aquele dia.',
  ],
  [
    'Lembrete garantido',
    'Fila com Redis; se ela cair, uma conferência periódica envia o que faltou.',
  ],
] as const;

/** Tela de início: o cartão de ponto, o que é o Cadence, como funciona e os dois caminhos */
export function Inicio() {
  useTitulo(null);
  const demo = useDemo();
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const [endereco, setEndereco] = useState('');
  const [erroDoEndereco, setErroDoEndereco] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const id = useId();
  const comoFunciona = useRevelar<HTMLElement>();
  const garantias = useRevelar<HTMLElement>();

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    const slug = enderecoDigitado(endereco);
    if (!FORMATO_DO_ENDERECO.test(slug)) {
      setErroDoEndereco(
        'Use só letras, números e hífen, como em barbearia-sao-joao.',
      );
      return;
    }
    void navegar(`/b/${slug}`);
  }

  /** Na demonstração, o painel abre com a conta de visitante do dono, sem passar pelo Entrar */
  async function verOPainel() {
    setErro(null);
    setEntrando(true);
    try {
      const sessao = await api<Sessao>('/auth/visitante', {
        metodo: 'POST',
        corpo: { papel: 'dono' },
      });
      aplicar(sessao, true);
      await navegar('/painel');
    } catch (e) {
      setErro(mensagemDe(e));
      setEntrando(false);
    }
  }

  const naDemo = demo?.demo && demo.negocio;

  return (
    <div className="inicio">
      <section className="inicio__topo">
        <CartaoDoInicio />
        <div className="inicio__texto">
          <p className="miudo">Agenda de reservas</p>
          <h1 className="inicio__titulo">
            <span>Bata o ponto</span> <span>no seu horário.</span>
          </h1>
          <p>
            Escolha o serviço, o profissional e o horário. Ninguém mais fica com
            ele: dois clientes nunca batem o mesmo ponto.
          </p>
          <Erro mensagem={erro} />
          {demo === null ? (
            <p className="carregando">Carregando…</p>
          ) : naDemo ? (
            <>
              <div className="acoes inicio__caminhos">
                <Link className="botao" to={`/b/${demo.negocio}`}>
                  Reservar como cliente
                </Link>
                {usuario?.papel === 'dono' ? (
                  <Link className="botao botao--contorno" to="/painel">
                    Ver o painel do dono
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="botao botao--contorno"
                    disabled={entrando}
                    onClick={() => void verOPainel()}
                  >
                    {entrando ? 'Abrindo…' : 'Ver o painel do dono'}
                  </button>
                )}
              </div>
              <p className="miudo">
                Sem cadastro: a demonstração usa contas de visitante.
              </p>
            </>
          ) : (
            <>
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
                      setErroDoEndereco(null);
                    }}
                    placeholder="barbearia-sao-joao"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    aria-invalid={erroDoEndereco ? true : undefined}
                    aria-describedby={erroDoEndereco ? `${id}-erro` : undefined}
                  />
                </div>
                {erroDoEndereco && (
                  <small className="erro" id={`${id}-erro`}>
                    {erroDoEndereco}
                  </small>
                )}
                <button className="botao" type="submit">
                  Reservar horário
                </button>
              </form>
              {!usuario && (
                <p className="inicio__dono">
                  Tem um estabelecimento?{' '}
                  <Link to="/cadastro">Crie a agenda dele</Link>.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section
        className="inicio__secao"
        aria-labelledby={`${id}-como`}
        ref={comoFunciona}
      >
        <h2 id={`${id}-como`}>Como funciona</h2>
        <div className="inicio__colunas">
          <Passos titulo="Para quem reserva" passos={PASSOS_DO_CLIENTE} />
          <Passos titulo="Para o estabelecimento" passos={PASSOS_DO_DONO} />
        </div>
      </section>

      <section
        className="inicio__secao"
        aria-labelledby={`${id}-garantias`}
        ref={garantias}
      >
        <h2 id={`${id}-garantias`}>O que o Cadence garante</h2>
        <ul className="garantias">
          {GARANTIAS.map(([titulo, texto], i) => (
            <li key={titulo} className="garantia">
              <span className="garantia__numero" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Passos({
  titulo,
  passos,
}: {
  titulo: string;
  passos: readonly (readonly [string, string])[];
}) {
  return (
    <div className="cartao passos">
      <h3>{titulo}</h3>
      <ol className="passos__lista">
        {passos.map(([nome, texto]) => (
          <li key={nome}>
            <strong>{nome}.</strong> {texto}
          </li>
        ))}
      </ol>
    </div>
  );
}
