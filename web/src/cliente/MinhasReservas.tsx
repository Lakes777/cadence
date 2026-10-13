import { useRef, useState, type KeyboardEvent } from 'react';
import { api, mensagemDe } from '../api/cliente';
import { useTempoReal } from '../api/hooks';
import type { Aviso, Reserva } from '../api/tipos';
import { Confirmacao } from '../comum/Confirmacao';
import { Erro } from '../comum/Erro';
import { CartaoDaReserva } from './CartaoDaReserva';
import { useBusca } from '../api/busca';
import './cliente.css';
import { useTitulo } from '../comum/titulo';

type Periodo = 'proximas' | 'anteriores';

const ABAS: { periodo: Periodo; nome: string }[] = [
  { periodo: 'proximas', nome: 'Próximas' },
  { periodo: 'anteriores', nome: 'Anteriores' },
];

/** Em qual aba a reserva aparece (a mesma regra do servidor: termina depois de agora) */
function periodoDe(reserva: Reserva, agora = Date.now()): Periodo {
  return Date.parse(reserva.fim) > agora ? 'proximas' : 'anteriores';
}

/** Põe a reserva no lugar (ou na ordem certa, se é nova): próximas crescente, anteriores ao contrário */
function comReserva(
  lista: Reserva[],
  reserva: Reserva,
  periodo: Periodo,
): Reserva[] {
  if (lista.some((r) => r.id === reserva.id)) {
    return lista.map((r) => (r.id === reserva.id ? reserva : r));
  }
  if (periodoDe(reserva) !== periodo) return lista;
  const sinal = periodo === 'proximas' ? 1 : -1;
  return [...lista, reserva].sort(
    (a, b) => sinal * (Date.parse(a.inicio) - Date.parse(b.inicio)),
  );
}

/** /minhas: as reservas do cliente (próximas e anteriores), cancelar e os avisos */
export function MinhasReservas() {
  useTitulo('Minhas reservas');
  const [periodo, setPeriodo] = useState<Periodo>('proximas');
  const [anuncio, setAnuncio] = useState('');
  const abas = useRef<(HTMLButtonElement | null)[]>([]);

  const reservas = useBusca<Reserva[]>(`reservas:${periodo}`, (sinal) =>
    api<Reserva[]>(`/reservas?periodo=${periodo}`, { sinal }),
  );
  const avisos = useBusca<Aviso[]>('avisos', (sinal) =>
    api<Aviso[]>('/avisos', { sinal }),
  );

  useTempoReal((evento) => {
    if (evento.tipo === 'reconectou') {
      reservas.recarregar();
      avisos.recarregar();
    } else if (evento.tipo === 'reserva') {
      const { reserva } = evento;
      reservas.mudar((lista) => comReserva(lista, reserva, periodo));
      if (reserva.status === 'cancelada') {
        avisos.mudar((lista) =>
          lista.map((a) =>
            a.reservaId === reserva.id ? { ...a, reservaCancelada: true } : a,
          ),
        );
      }
      setAnuncio(
        reserva.status === 'cancelada'
          ? `A reserva de ${reserva.servico.nome} em ${reserva.negocio.nome} foi cancelada.`
          : `Nova reserva: ${reserva.servico.nome} em ${reserva.negocio.nome}.`,
      );
    } else if (evento.tipo === 'aviso') {
      const { aviso } = evento;
      avisos.mudar((lista) =>
        lista.some((a) => a.id === aviso.id)
          ? lista.map((a) => (a.id === aviso.id ? aviso : a))
          : [aviso, ...lista],
      );
      setAnuncio(`Novo aviso: ${aviso.texto}`);
    }
  });

  function aoTeclar(evento: KeyboardEvent, indice: number) {
    const passo =
      evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (!passo) return;
    evento.preventDefault();
    const proximo = (indice + passo + ABAS.length) % ABAS.length;
    setPeriodo(ABAS[proximo].periodo);
    abas.current[proximo]?.focus();
  }

  return (
    <section className="minhas">
      <h1>Minhas reservas</h1>
      <p className="so-leitor" aria-live="polite" aria-atomic="true">
        {anuncio}
      </p>

      <div className="minhas__colunas">
        <div>
          <div className="abas" role="tablist" aria-label="Período">
            {ABAS.map((aba, i) => (
              <button
                key={aba.periodo}
                ref={(el) => {
                  abas.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`aba-${aba.periodo}`}
                aria-selected={periodo === aba.periodo}
                aria-controls="painel-reservas"
                tabIndex={periodo === aba.periodo ? 0 : -1}
                className="aba"
                onClick={() => setPeriodo(aba.periodo)}
                onKeyDown={(e) => aoTeclar(e, i)}
              >
                {aba.nome}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="painel-reservas"
            aria-labelledby={`aba-${periodo}`}
            className="minhas__lista"
          >
            {reservas.erro !== undefined && (
              <div className="alerta" role="alert">
                <p>{mensagemDe(reservas.erro)}</p>
                <button
                  type="button"
                  className="botao botao--pequeno botao--contorno"
                  onClick={reservas.recarregar}
                >
                  Tentar de novo
                </button>
              </div>
            )}
            {!reservas.dados ? (
              reservas.carregando && (
                <p className="carregando">Carregando reservas…</p>
              )
            ) : reservas.dados.length === 0 ? (
              <p className="aviso">
                {periodo === 'proximas'
                  ? 'Nenhuma reserva marcada. Quando você reservar, ela aparece aqui.'
                  : 'Nenhuma reserva anterior.'}
              </p>
            ) : (
              <ul className="lista-de-cartoes">
                {reservas.dados.map((r) => (
                  <li key={r.id}>
                    <ItemDaReserva
                      reserva={r}
                      podeCancelar={periodo === 'proximas'}
                      aoMudar={(nova) =>
                        reservas.mudar((lista) =>
                          comReserva(lista, nova, periodo),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <Avisos
          avisos={avisos.dados}
          erro={avisos.erro}
          carregando={avisos.carregando}
          recarregar={avisos.recarregar}
          aoLer={(lido) =>
            avisos.mudar((lista) =>
              lista.map((a) => (a.id === lido.id ? lido : a)),
            )
          }
        />
      </div>
    </section>
  );
}

function ItemDaReserva({
  reserva,
  podeCancelar,
  aoMudar,
}: {
  reserva: Reserva;
  podeCancelar: boolean;
  aoMudar: (reserva: Reserva) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const cartao = useRef<HTMLElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    setEnviando(true);
    setErro(null);
    try {
      aoMudar(
        await api<Reserva>(`/reservas/${reserva.id}/cancelar`, {
          metodo: 'POST',
        }),
      );
      setConfirmando(false);
      // O botão some junto com a confirmação: o foco vai para o cartão (agora "cancelada")
      requestAnimationFrame(() => cartao.current?.focus());
    } catch (e) {
      // O 422 traz a regra certa ("só até 2 h antes", "já começou")
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <CartaoDaReserva ref={cartao} reserva={reserva} titulo="h2">
      {podeCancelar && reserva.status === 'confirmada' && (
        <div className="cartao-de-ponto__acoes">
          <Erro mensagem={erro} />
          {confirmando ? (
            <Confirmacao
              pergunta="Cancelar esta reserva? O horário volta a ficar livre."
              confirmar="Sim, cancelar"
              voltar="Não, manter"
              enviando={enviando}
              aoConfirmar={() => void cancelar()}
              aoVoltar={() => {
                setConfirmando(false);
                setErro(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="botao botao--contorno botao--pequeno"
              onClick={() => setConfirmando(true)}
            >
              Cancelar reserva
            </button>
          )}
        </div>
      )}
    </CartaoDaReserva>
  );
}

function Avisos({
  avisos,
  erro,
  carregando,
  recarregar,
  aoLer,
}: {
  avisos: Aviso[] | undefined;
  erro: unknown;
  carregando: boolean;
  recarregar: () => void;
  aoLer: (aviso: Aviso) => void;
}) {
  const [erroAoLer, setErroAoLer] = useState<string | null>(null);
  const naoLidos = avisos?.filter((a) => !a.lidoEm).length ?? 0;

  async function marcar(aviso: Aviso) {
    setErroAoLer(null);
    try {
      aoLer(await api<Aviso>(`/avisos/${aviso.id}/lido`, { metodo: 'POST' }));
    } catch (e) {
      setErroAoLer(mensagemDe(e));
    }
  }

  return (
    <aside className="avisos" aria-labelledby="titulo-avisos">
      <h2 id="titulo-avisos">
        Avisos
        {naoLidos > 0 && (
          <span className="avisos__contagem">
            {naoLidos} {naoLidos === 1 ? 'não lido' : 'não lidos'}
          </span>
        )}
      </h2>
      <Erro mensagem={erroAoLer} />
      {erro !== undefined && (
        <div className="alerta" role="alert">
          <p>{mensagemDe(erro)}</p>
          <button
            type="button"
            className="botao botao--pequeno botao--contorno"
            onClick={recarregar}
          >
            Tentar de novo
          </button>
        </div>
      )}
      {!avisos ? (
        carregando && <p className="carregando">Carregando avisos…</p>
      ) : avisos.length === 0 ? (
        <p className="miudo">
          Nenhum aviso. O lembrete chega 24 h antes de cada reserva.
        </p>
      ) : (
        <ul className="lista-simples">
          {avisos.map((a) => (
            <li
              key={a.id}
              className={`aviso-item${a.lidoEm ? '' : ' aviso-item--novo'}`}
            >
              {!a.lidoEm && <span className="so-leitor">Não lido: </span>}
              <p className="aviso-item__texto">{a.texto}</p>
              {a.reservaCancelada && (
                <p className="erro">Esta reserva foi cancelada depois.</p>
              )}
              <p className="miudo">
                {new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(a.criadoEm))}
              </p>
              {!a.lidoEm && (
                <button
                  type="button"
                  className="botao-link"
                  onClick={() => void marcar(a)}
                >
                  Marcar como lido
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
