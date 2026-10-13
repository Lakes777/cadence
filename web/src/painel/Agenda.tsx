import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, mensagemDe } from '../api/cliente';
import { useTempoReal } from '../api/hooks';
import type { ItemDaAgenda, Profissional, Reserva } from '../api/tipos';
import {
  dataNoFuso,
  dataValida,
  diaDaSemana,
  formatarDia,
  formatarDinheiro,
  formatarHora,
  hojeNoFuso,
  somarDias,
} from '../comum/formatos';
import { useBusca } from '../api/busca';
import { Confirmacao } from '../comum/Confirmacao';
import { useNegocio } from './contexto';
import { inicioDoDia } from './fuso';

/** Quanto tempo a reserva que chegou ao vivo fica destacada */
export const DESTAQUE_MS = 2000;

/** A segunda-feira da semana daquela data (a semana da agenda vai de segunda a domingo) */
function segundaDe(data: string): string {
  return somarDias(data, -((diaDaSemana(data) + 6) % 7));
}

/**
 * /painel/:negocioId: as reservas do dia ou da semana, no fuso do negócio. Ao vivo: um evento
 * `horarios` que toca o período (ou `catalogo`, ou a conexão que voltou) busca de novo sem
 * tirar a lista da tela, e a reserva nova fica destacada por um instante.
 */
export function Agenda() {
  const negocio = useNegocio();
  const { fuso } = negocio;
  const [busca, setBusca] = useSearchParams();
  const visao = busca.get('visao') === 'semana' ? 'semana' : 'dia';
  const hoje = hojeNoFuso(fuso);
  const pedido = busca.get('dia');
  const dia = pedido && dataValida(pedido) ? pedido : hoje;
  const filtro = busca.get('profissional') ?? '';

  const primeiro = visao === 'dia' ? dia : segundaDe(dia);
  const dias =
    visao === 'dia'
      ? [primeiro]
      : Array.from({ length: 7 }, (_, i) => somarDias(primeiro, i));
  const ultimo = dias[dias.length - 1];
  const de = inicioDoDia(primeiro, fuso).toISOString();
  const ate = inicioDoDia(somarDias(ultimo, 1), fuso).toISOString();
  const chave = `${negocio.id}|${de}|${ate}`;

  // ---- Ao vivo ----
  const aoVivo = useRef(false);
  const [destacadas, setDestacadas] = useState<ReadonlySet<string>>(new Set());
  const [anuncio, setAnuncio] = useState('');
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(relogio.current), []);

  /**
   * Uma busca causada por evento ao vivo: o que não estava na lista anterior é novo. Calculado
   * quando os dados chegam (antes de a tela mudar), para o destaque aparecer junto com a linha.
   */
  function chegou(lista: ItemDaAgenda[], anterior: ItemDaAgenda[] | undefined) {
    const veioAoVivo = aoVivo.current;
    aoVivo.current = false;
    if (!veioAoVivo || !anterior) return;
    const antes = new Set(anterior.map((r) => r.id));
    const chegaram = lista.filter(
      (r) => r.status === 'confirmada' && !antes.has(r.id),
    );
    if (!chegaram.length) return;
    setDestacadas(new Set(chegaram.map((r) => r.id)));
    const horas = chegaram.map((r) => formatarHora(r.inicio, fuso));
    setAnuncio(
      horas.length === 1
        ? `Nova reserva às ${horas[0]}.`
        : `Novas reservas às ${horas.join(', ')}.`,
    );
    clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setDestacadas(new Set()), DESTAQUE_MS);
  }

  const agenda = useBusca(
    chave,
    (sinal) =>
      api<ItemDaAgenda[]>(
        `/negocios/${negocio.id}/agenda?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,
        { sinal },
      ),
    chegou,
  );
  const profissionais = useBusca(negocio.id, (sinal) =>
    api<Profissional[]>(`/negocios/${negocio.id}/profissionais`, { sinal }),
  );

  useTempoReal((evento) => {
    const doNegocio =
      (evento.tipo === 'horarios' || evento.tipo === 'catalogo') &&
      evento.negocio === negocio.slug;
    if (
      evento.tipo === 'reconectou' ||
      (doNegocio && evento.tipo === 'catalogo')
    ) {
      aoVivo.current = true;
      agenda.recarregar();
      profissionais.recarregar();
    } else if (
      doNegocio &&
      evento.tipo === 'horarios' &&
      evento.de <= ultimo &&
      evento.ate >= primeiro
    ) {
      aoVivo.current = true;
      agenda.recarregar();
    }
  });

  // ---- Cancelar ----
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [erroDe, setErroDe] = useState<{ id: string; mensagem: string } | null>(
    null,
  );

  async function cancelar(item: ItemDaAgenda) {
    setErroDe(null);
    setCancelando(true);
    try {
      const feita = await api<Reserva>(`/reservas/${item.id}/cancelar`, {
        metodo: 'POST',
      });
      agenda.mudar((lista) =>
        lista?.map((r) =>
          r.id === item.id ? { ...r, status: feita.status } : r,
        ),
      );
      setAnuncio(
        `Reserva das ${formatarHora(item.inicio, fuso)} de ${item.cliente.nome} cancelada.`,
      );
      // A confirmação some: o foco volta para a linha da reserva, não fica perdido no <body>
      requestAnimationFrame(() =>
        document.getElementById(`linha-${item.id}`)?.focus(),
      );
    } catch (e) {
      // 422 (já começou), 404...: a mensagem do servidor diz o porquê
      setErroDe({ id: item.id, mensagem: mensagemDe(e) });
    } finally {
      setCancelando(false);
      setConfirmando(null);
    }
  }

  // ---- Navegação ----
  function ir(mudancas: Record<string, string | null>) {
    const nova = new URLSearchParams(busca);
    for (const [nome, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === '') nova.delete(nome);
      else nova.set(nome, valor);
    }
    setBusca(nova);
  }
  const passo = visao === 'dia' ? 1 : 7;
  const unidade = visao === 'dia' ? 'Dia' : 'Semana';

  const opcoes = profissionais.dados?.map((p) => ({
    id: p.id,
    nome: p.nome,
  })) ?? [
    ...new Map(
      (agenda.dados ?? []).map((r) => [r.profissional.id, r.profissional]),
    ).values(),
  ];

  const titulo =
    visao === 'dia'
      ? formatarDia(primeiro)
      : `${formatarDia(primeiro)} a ${formatarDia(ultimo)}`;

  return (
    <section aria-labelledby="titulo-agenda">
      <h2 id="titulo-agenda" className="so-leitor">
        Agenda
      </h2>
      <div className="barra-da-agenda">
        <div className="grupo" role="group" aria-label="Visão">
          <button
            type="button"
            className="botao botao--pequeno botao--contorno"
            aria-pressed={visao === 'dia'}
            onClick={() => ir({ visao: null })}
          >
            Dia
          </button>
          <button
            type="button"
            className="botao botao--pequeno botao--contorno"
            aria-pressed={visao === 'semana'}
            onClick={() => ir({ visao: 'semana' })}
          >
            Semana
          </button>
        </div>
        <div className="grupo" role="group" aria-label="Período">
          <button
            type="button"
            className="botao botao--pequeno botao--contorno"
            aria-label={`${unidade} anterior`}
            onClick={() => ir({ dia: somarDias(dia, -passo) })}
          >
            ← Anterior
          </button>
          <button
            type="button"
            className="botao botao--pequeno botao--contorno"
            onClick={() => ir({ dia: null })}
          >
            Hoje
          </button>
          <button
            type="button"
            className="botao botao--pequeno botao--contorno"
            aria-label={`${unidade === 'Dia' ? 'Próximo dia' : 'Próxima semana'}`}
            onClick={() => ir({ dia: somarDias(dia, passo) })}
          >
            Próximo →
          </button>
        </div>
        <label className="campo campo--curto">
          <span>Ir para o dia</span>
          <input
            type="date"
            value={dia}
            onChange={(e) =>
              dataValida(e.target.value) && ir({ dia: e.target.value })
            }
          />
        </label>
        <label className="campo campo--curto">
          <span>Profissional</span>
          <select
            value={filtro}
            onChange={(e) => ir({ profissional: e.target.value })}
          >
            <option value="">Todos</option>
            {opcoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="titulo-do-periodo">
        <span className="titulo">{titulo}</span>
        {dia === hoje && visao === 'dia' && (
          <span className="miudo"> · hoje</span>
        )}
        {agenda.carregando && agenda.dados && (
          <span className="miudo"> · atualizando…</span>
        )}
      </p>
      <p className="so-leitor" aria-live="polite" role="status">
        {anuncio}
      </p>

      {!agenda.dados && agenda.carregando && (
        <p className="carregando">Carregando a agenda…</p>
      )}
      {agenda.mensagem && (
        <div>
          <p className="alerta" role="alert">
            {agenda.mensagem}
          </p>
          <button
            type="button"
            className="botao botao--contorno botao--pequeno"
            onClick={agenda.recarregar}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {agenda.dados &&
        dias.map((d) => {
          const doDia = agenda.dados!.filter(
            (r) =>
              dataNoFuso(r.inicio, fuso) === d &&
              (!filtro || r.profissional.id === filtro),
          );
          const confirmadas = doDia.filter(
            (r) => r.status === 'confirmada',
          ).length;
          return (
            <section
              key={d}
              className="dia-da-agenda"
              aria-label={visao === 'semana' ? formatarDia(d) : undefined}
            >
              {visao === 'semana' && (
                <h3>
                  {formatarDia(d)}
                  {d === hoje && <span className="miudo"> · hoje</span>}
                </h3>
              )}
              {doDia.length === 0 ? (
                <p className="miudo vazio">Nenhuma reserva.</p>
              ) : (
                <>
                  <p className="miudo">
                    {confirmadas}{' '}
                    {confirmadas === 1 ? 'confirmada' : 'confirmadas'}
                    {doDia.length > confirmadas &&
                      ` · ${doDia.length - confirmadas} cancelada${doDia.length - confirmadas === 1 ? '' : 's'}`}
                  </p>
                  <table className="tabela tabela--empilha">
                    <thead>
                      <tr>
                        <th scope="col">Hora</th>
                        <th scope="col">Serviço</th>
                        <th scope="col">Profissional</th>
                        <th scope="col">Cliente</th>
                        <th scope="col">Preço</th>
                        <th scope="col">Situação</th>
                        <th scope="col">
                          <span className="so-leitor">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {doDia.map((r) => (
                        <LinhaDaReserva
                          key={r.id}
                          reserva={r}
                          fuso={fuso}
                          destacada={destacadas.has(r.id)}
                          confirmando={confirmando === r.id}
                          enviando={cancelando}
                          erro={erroDe?.id === r.id ? erroDe.mensagem : null}
                          aoPedirCancelar={() => {
                            setErroDe(null);
                            setConfirmando(r.id);
                          }}
                          aoVoltar={() => setConfirmando(null)}
                          aoConfirmar={() => void cancelar(r)}
                        />
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          );
        })}
    </section>
  );
}

function LinhaDaReserva({
  reserva: r,
  fuso,
  destacada,
  confirmando,
  enviando,
  erro,
  aoPedirCancelar,
  aoVoltar,
  aoConfirmar,
}: {
  reserva: ItemDaAgenda;
  fuso: string;
  destacada: boolean;
  confirmando: boolean;
  enviando: boolean;
  erro: string | null;
  aoPedirCancelar: () => void;
  aoVoltar: () => void;
  aoConfirmar: () => void;
}) {
  const hora = formatarHora(r.inicio, fuso);
  const cancelada = r.status === 'cancelada';
  const podeCancelar = !cancelada && new Date(r.inicio).getTime() > Date.now();
  const classes = [
    cancelada ? 'reserva--cancelada' : '',
    destacada ? 'reserva--nova' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <tr
      id={`linha-${r.id}`}
      tabIndex={-1}
      className={classes || undefined}
      data-testid={`reserva-${r.id}`}
    >
      <td data-rotulo="Hora" className="hora">
        {hora}–{formatarHora(r.fim, fuso)}
        {destacada && <span className="selo-nova">Nova</span>}
      </td>
      <td data-rotulo="Serviço">{r.servico.nome}</td>
      <td data-rotulo="Profissional">{r.profissional.nome}</td>
      <td data-rotulo="Cliente">
        {r.cliente.nome}
        <br />
        <a className="miudo-email" href={`mailto:${r.cliente.email}`}>
          {r.cliente.email}
        </a>
      </td>
      <td data-rotulo="Preço">{formatarDinheiro(r.precoCentavos)}</td>
      <td data-rotulo="Situação">
        {cancelada ? <span className="carimbo">Cancelada</span> : 'Confirmada'}
      </td>
      <td data-rotulo="Ações" className="acoes-da-linha">
        {podeCancelar && !confirmando && (
          <button
            type="button"
            className="botao botao--perigo botao--pequeno"
            onClick={aoPedirCancelar}
            aria-label={`Cancelar a reserva das ${hora} de ${r.cliente.nome}`}
          >
            Cancelar
          </button>
        )}
        {confirmando && (
          <Confirmacao
            pergunta={`Cancelar a reserva das ${hora} de ${r.cliente.nome}? O horário volta a ficar livre.`}
            confirmar="Sim, cancelar"
            enviando={enviando}
            aoConfirmar={aoConfirmar}
            aoVoltar={aoVoltar}
          />
        )}
        {erro && (
          <p className="erro" role="alert">
            Não deu para cancelar: {erro}
          </p>
        )}
      </td>
    </tr>
  );
}
