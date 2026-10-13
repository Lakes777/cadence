import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { api, ErroDaApi, mensagemDe } from '../api/cliente';
import { useAssinatura, useSessao, useTempoReal } from '../api/hooks';
import type { Reserva, Vitrine } from '../api/tipos';
import { Erro } from '../comum/Erro';
import {
  diaDaSemana,
  formatarDia,
  formatarDinheiro,
  hojeNoFuso,
  NOMES_DOS_DIAS,
} from '../comum/formatos';
import { useBusca } from '../api/busca';
import { CartaoDaReserva, formatarDuracao } from './CartaoDaReserva';
import { diasDaAgenda, montarGrade, type DisponibilidadeDoDia } from './dados';
import { GradeDeHorarios } from './GradeDeHorarios';
import './cliente.css';
import { useTitulo } from '../comum/titulo';

/** Quanto tempo o contorno vermelho do horário pego ao vivo fica na tela */
export const CONTORNO_MS = 1000;
const DIAS_POR_PAGINA = 7;

/**
 * /b/:slug: escolher serviço, profissional, dia e horário, e reservar. Serviço, profissional e
 * dia ficam na URL (?servico=&profissional=&dia=), para voltar ao mesmo lugar; a hora escolhida
 * só vai para a URL na ida ao login (&hora=), e volta marcada se ainda estiver livre.
 */
export function Reservar() {
  const { slug = '' } = useParams();
  const [busca, setBusca] = useSearchParams();
  const navegar = useNavigate();
  const local = useLocation();
  const { usuario, carregando: sessaoCarregando } = useSessao();
  useAssinatura(slug || undefined);

  const vitrine = useBusca<Vitrine>(slug ? `vitrine:${slug}` : null, (sinal) =>
    api<Vitrine>(`/negocios/${encodeURIComponent(slug)}`, { sinal }),
  );
  useTitulo(vitrine.dados?.nome);
  const v = vitrine.dados;
  const servico = v?.servicos.find((s) => s.id === busca.get('servico'));
  const profissionais =
    v && servico
      ? v.profissionais.filter((p) => servico.profissionalIds.includes(p.id))
      : [];
  const profissional = profissionais.find(
    (p) => p.id === busca.get('profissional'),
  );
  const fuso = v?.fuso;
  // "Hoje" entra na dependência: numa aba aberta desde ontem, os dias andam na próxima renderização
  const hoje = fuso ? hojeNoFuso(fuso) : '';
  const dias = useMemo(
    () => (fuso && hoje ? diasDaAgenda(fuso) : []),
    [fuso, hoje],
  );
  const diaNaUrl = busca.get('dia');
  const dia = diaNaUrl && dias.includes(diaNaUrl) ? diaNaUrl : dias[0];

  const [escolhido, setEscolhido] = useState<string | null>(() =>
    busca.get('hora'),
  );
  const escolhidoAgora = useRef(escolhido);
  const [tomados, setTomados] = useState<string[]>([]);
  const [anuncio, setAnuncio] = useState('');
  const [erroDoEnvio, setErroDoEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feita, setFeita] = useState<Reserva | null>(null);
  // A tela inteira troca ao confirmar: o foco vai para o cartão, não fica perdido no <body>
  const cartaoFeito = useRef<HTMLElement>(null);
  useEffect(() => {
    if (feita) cartaoFeito.current?.focus();
  }, [feita]);
  /** A chave da tentativa atual: o mesmo envio repetido (após erro de rede) usa a mesma */
  const tentativa = useRef<{ assinatura: string; chave: string } | null>(null);
  useEffect(() => {
    escolhidoAgora.current = escolhido;
  });

  const chaveDoDia =
    v && servico && dia
      ? `${slug}|${servico.id}|${profissional?.id ?? ''}|${dia}`
      : null;
  const disp = useBusca<DisponibilidadeDoDia>(
    chaveDoDia,
    (sinal) => {
      const q = new URLSearchParams({ servicoId: servico!.id, data: dia! });
      if (profissional) q.set('profissionalId', profissional.id);
      return api<DisponibilidadeDoDia>(
        `/negocios/${encodeURIComponent(slug)}/disponibilidade?${q}`,
        { sinal },
      );
    },
    (novo, anterior) => {
      const livres = new Set(novo.horarios.map((h) => h.hora));
      const meu = escolhidoAgora.current;
      if (!anterior) {
        // Primeira vez deste dia: a hora que veio da URL (volta do login) pode ter sido pega
        if (meu && !livres.has(meu)) {
          setEscolhido(null);
          setAnuncio(
            `O horário ${meu} não está mais livre. Escolha outro horário.`,
          );
        }
        return;
      }
      const sumiram = anterior.horarios
        .map((h) => h.hora)
        .filter((hora) => !livres.has(hora));
      if (!sumiram.length) return;
      setTomados(sumiram);
      if (meu && sumiram.includes(meu)) {
        setEscolhido(null);
        setAnuncio(
          `Alguém reservou ${meu} antes de você. Escolha outro horário.`,
        );
      } else {
        setAnuncio(
          sumiram.length === 1
            ? `O horário ${sumiram[0]} não está mais livre.`
            : `Os horários ${sumiram.join(', ')} não estão mais livres.`,
        );
      }
    },
  );

  useEffect(() => {
    if (!tomados.length) return;
    const relogio = setTimeout(() => setTomados([]), CONTORNO_MS);
    return () => clearTimeout(relogio);
  }, [tomados]);

  useTempoReal((evento) => {
    if (evento.tipo === 'reconectou') {
      vitrine.recarregar();
      disp.recarregar();
    } else if (evento.tipo === 'horarios' && evento.negocio === slug) {
      if (dia && evento.de <= dia && dia <= evento.ate) disp.recarregar();
    } else if (evento.tipo === 'catalogo' && evento.negocio === slug) {
      if (evento.novoEndereco && evento.novoEndereco !== slug) {
        void navegar(`/b/${evento.novoEndereco}${local.search}`, {
          replace: true,
        });
      } else {
        vitrine.recarregar();
        disp.recarregar();
      }
    }
  });

  function mudar(campos: Record<string, string | null>) {
    const nova = new URLSearchParams(busca);
    for (const [nome, valor] of Object.entries(campos)) {
      if (valor) nova.set(nome, valor);
      else nova.delete(nome);
    }
    nova.delete('hora');
    setBusca(nova, { replace: true });
    setEscolhido(null);
    setErroDoEnvio(null);
    setAnuncio('');
  }

  const horarioEscolhido = disp.dados?.horarios.find(
    (h) => h.hora === escolhido,
  );

  async function confirmar() {
    if (!servico || !dia || !horarioEscolhido) return;
    if (!usuario) {
      const volta = new URLSearchParams(busca);
      volta.set('servico', servico.id);
      volta.set('dia', dia);
      volta.set('hora', horarioEscolhido.hora);
      void navegar(
        `/entrar?volta=${encodeURIComponent(`${local.pathname}?${volta}`)}`,
      );
      return;
    }
    const corpo = {
      servicoId: servico.id,
      ...(profissional ? { profissionalId: profissional.id } : {}),
      inicio: horarioEscolhido.inicio,
    };
    const assinatura = JSON.stringify([slug, corpo]);
    if (tentativa.current?.assinatura !== assinatura) {
      tentativa.current = { assinatura, chave: crypto.randomUUID() };
    }
    setEnviando(true);
    setErroDoEnvio(null);
    try {
      const reserva = await api<Reserva>(
        `/negocios/${encodeURIComponent(slug)}/reservas`,
        {
          metodo: 'POST',
          corpo,
          cabecalhos: { 'Idempotency-Key': tentativa.current.chave },
        },
      );
      tentativa.current = null;
      setEscolhido(null);
      setFeita(reserva);
    } catch (erro) {
      const status = erro instanceof ErroDaApi ? erro.status : 0;
      // Sem resposta (rede) ou erro do servidor: talvez tenha gravado, então repetir usa a
      // mesma chave e o servidor devolve a mesma reserva. Recusa clara: a próxima é outra
      if (status >= 400 && status < 500) tentativa.current = null;
      if (status === 409) {
        setEscolhido(null);
        disp.recarregar();
      }
      setErroDoEnvio(mensagemDe(erro));
    } finally {
      setEnviando(false);
    }
  }

  if (feita) {
    return (
      <section className="reservar" aria-labelledby="ponto-batido">
        <p className="miudo" id="ponto-batido">
          Ponto batido: reserva confirmada
        </p>
        <CartaoDaReserva
          ref={cartaoFeito}
          reserva={feita}
          titulo="h1"
          selo={
            <span className="selo" aria-hidden="true">
              Batido
            </span>
          }
        >
          <div className="acoes">
            <Link className="botao" to="/minhas">
              Ver minhas reservas
            </Link>
            <button
              type="button"
              className="botao botao--contorno"
              onClick={() => setFeita(null)}
            >
              Reservar outro horário
            </button>
          </div>
        </CartaoDaReserva>
      </section>
    );
  }

  if (vitrine.carregando && !v) {
    return <p className="carregando">Carregando…</p>;
  }
  if (!v) {
    const naoExiste =
      vitrine.erro instanceof ErroDaApi && vitrine.erro.status === 404;
    return (
      <section className="cartao" role="alert">
        <h1>
          {naoExiste
            ? 'Estabelecimento não encontrado'
            : 'Não foi possível abrir a agenda'}
        </h1>
        <p>
          {naoExiste
            ? 'Não achamos nenhum estabelecimento neste endereço. Confira o link que você recebeu (ele pode ter mudado).'
            : mensagemDe(vitrine.erro)}
        </p>
        <div className="acoes">
          {!naoExiste && (
            <button
              type="button"
              className="botao"
              onClick={vitrine.recarregar}
            >
              Tentar de novo
            </button>
          )}
          <Link className="botao botao--contorno" to="/">
            Voltar ao início
          </Link>
        </div>
      </section>
    );
  }

  const grade = disp.dados ? montarGrade(disp.dados) : [];
  const livres = disp.dados?.horarios.length ?? 0;

  return (
    <section className="reservar">
      <h1>{v.nome}</h1>
      <p className="so-leitor" aria-live="polite" aria-atomic="true">
        {anuncio}
      </p>
      {usuario?.papel === 'dono' && (
        <p className="aviso" role="note">
          Você entrou como estabelecimento. Para reservar, saia e entre com uma
          conta de cliente.
        </p>
      )}

      {!v.servicos.length ? (
        <p className="aviso">
          Este estabelecimento ainda não tem serviços para reservar.
        </p>
      ) : (
        <div className="reservar__passos">
          <fieldset className="passo">
            <legend className="passo__titulo">1. Serviço</legend>
            <div className="opcoes">
              {v.servicos.map((s) => (
                <label
                  key={s.id}
                  className={`opcao${s.id === servico?.id ? ' opcao--escolhida' : ''}`}
                >
                  <input
                    type="radio"
                    name="servico"
                    className="so-leitor"
                    checked={s.id === servico?.id}
                    onChange={() =>
                      mudar({
                        servico: s.id,
                        profissional: s.profissionalIds.includes(
                          profissional?.id ?? '',
                        )
                          ? (profissional?.id ?? null)
                          : null,
                      })
                    }
                  />
                  <span className="opcao__nome">{s.nome}</span>
                  <span className="miudo">
                    {formatarDuracao(s.duracaoMin)} ·{' '}
                    {formatarDinheiro(s.precoCentavos)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {servico && dia && (
            <>
              <fieldset className="passo">
                <legend className="passo__titulo">2. Profissional</legend>
                <div className="opcoes opcoes--linha">
                  {[{ id: '', nome: 'Qualquer um' }, ...profissionais].map(
                    (p) => {
                      const marcado = p.id === (profissional?.id ?? '');
                      return (
                        <label
                          key={p.id || 'qualquer'}
                          className={`opcao opcao--curta${marcado ? ' opcao--escolhida' : ''}`}
                        >
                          <input
                            type="radio"
                            name="profissional"
                            className="so-leitor"
                            checked={marcado}
                            onChange={() =>
                              mudar({ profissional: p.id || null })
                            }
                          />
                          <span className="opcao__nome">{p.nome}</span>
                        </label>
                      );
                    },
                  )}
                </div>
              </fieldset>

              <EscolhaDoDia
                dias={dias}
                dia={dia}
                aoEscolher={(d) => mudar({ dia: d })}
              />

              <div className="passo">
                <h2 className="passo__titulo">4. Horário</h2>
                <div className="cartao cartao-do-dia">
                  <header className="cartao-do-dia__topo">
                    <p className="cartao-do-dia__negocio">{v.nome}</p>
                    <p className="cartao-do-dia__data">{formatarDia(dia)}</p>
                    <p className="miudo cartao-do-dia__ficha">
                      <span>
                        {profissional?.nome ?? 'Qualquer profissional'}
                      </span>
                      <span>
                        {servico.nome} · {formatarDuracao(servico.duracaoMin)}
                      </span>
                      <span>{formatarDinheiro(servico.precoCentavos)}</span>
                    </p>
                  </header>
                  {disp.erro !== undefined && (
                    <div className="alerta" role="alert">
                      <p>{mensagemDe(disp.erro)}</p>
                      <button
                        type="button"
                        className="botao botao--pequeno botao--contorno"
                        onClick={disp.recarregar}
                      >
                        Tentar de novo
                      </button>
                    </div>
                  )}
                  {!disp.dados ? (
                    disp.carregando && (
                      <p className="carregando">Carregando horários…</p>
                    )
                  ) : grade.length === 0 ? (
                    <p className="cartao-do-dia__vazio">
                      Sem atendimento neste dia. Tente outro.
                    </p>
                  ) : (
                    <>
                      {livres === 0 && (
                        <p className="cartao-do-dia__vazio">
                          Todos os horários deste dia já foram reservados.
                        </p>
                      )}
                      <GradeDeHorarios
                        itens={grade}
                        escolhido={horarioEscolhido ? escolhido : null}
                        tomados={tomados}
                        rotulo={`Horários de ${formatarDia(dia)}`}
                        aoEscolher={(hora) => {
                          setEscolhido(hora);
                          setErroDoEnvio(null);
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="confirmar">
                <Erro mensagem={erroDoEnvio} />
                <p className="confirmar__resumo">
                  {horarioEscolhido
                    ? `${formatarDia(dia)}, ${horarioEscolhido.hora} · ${servico.nome} · ${formatarDinheiro(servico.precoCentavos)}`
                    : 'Escolha um horário livre.'}
                </p>
                <button
                  type="button"
                  className="botao"
                  disabled={
                    !horarioEscolhido ||
                    enviando ||
                    sessaoCarregando ||
                    usuario?.papel === 'dono'
                  }
                  onClick={() => void confirmar()}
                >
                  {enviando
                    ? 'Reservando…'
                    : usuario
                      ? 'Confirmar reserva'
                      : 'Entrar e confirmar'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const MESES = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  month: 'long',
});

/** "outubro" ou "outubro e novembro": o mês dos dias que estão na tela */
function mesesDe(dias: string[]): string {
  const nomes = [
    ...new Set(dias.map((d) => MESES.format(new Date(`${d}T12:00:00Z`)))),
  ];
  return nomes.join(' e ');
}

/** Os dias da agenda, uma semana por vez, no fuso do negócio */
function EscolhaDoDia({
  dias,
  dia,
  aoEscolher,
}: {
  dias: string[];
  dia: string;
  aoEscolher: (dia: string) => void;
}) {
  const daEscolha = Math.floor(
    Math.max(0, dias.indexOf(dia)) / DIAS_POR_PAGINA,
  );
  const [pagina, setPagina] = useState<number | null>(null);
  const atual = pagina ?? daEscolha;
  const ultima = Math.floor((dias.length - 1) / DIAS_POR_PAGINA);
  const visiveis = dias.slice(
    atual * DIAS_POR_PAGINA,
    (atual + 1) * DIAS_POR_PAGINA,
  );
  return (
    <fieldset className="passo">
      <legend className="passo__titulo">3. Dia</legend>
      <p className="miudo dias__mes" aria-hidden="true">
        {mesesDe(visiveis)}
      </p>
      <div className="dias">
        <button
          type="button"
          className="botao botao--contorno botao--pequeno dias__seta"
          disabled={atual === 0}
          onClick={() => setPagina(atual - 1)}
          aria-label="Dias anteriores"
        >
          ‹
        </button>
        <div className="dias__lista">
          {visiveis.map((d) => {
            const marcado = d === dia;
            return (
              <label
                key={d}
                className={`dia${marcado ? ' dia--escolhido' : ''}`}
              >
                <input
                  type="radio"
                  name="dia"
                  className="so-leitor"
                  checked={marcado}
                  onChange={() => {
                    setPagina(null);
                    aoEscolher(d);
                  }}
                  aria-label={`${formatarDia(d)}${d === dias[0] ? ' (hoje)' : ''}`}
                />
                <span className="dia__semana" aria-hidden="true">
                  {d === dias[0]
                    ? 'Hoje'
                    : NOMES_DOS_DIAS[diaDaSemana(d)].slice(0, 3)}
                </span>
                <span className="dia__numero" aria-hidden="true">
                  {d.slice(8, 10)}
                </span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className="botao botao--contorno botao--pequeno dias__seta"
          disabled={atual >= ultima}
          onClick={() => setPagina(atual + 1)}
          aria-label="Próximos dias"
        >
          ›
        </button>
      </div>
    </fieldset>
  );
}
