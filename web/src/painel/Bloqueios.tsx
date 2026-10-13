import { useState, type FormEvent } from 'react';
import { api, ErroDaApi } from '../api/cliente';
import { useTempoReal } from '../api/hooks';
import type { Bloqueio, Profissional } from '../api/tipos';
import { Campo } from '../comum/Campo';
import { Erro } from '../comum/Erro';
import { dataValida, hojeNoFuso, somarDias } from '../comum/formatos';
import { useBusca } from '../api/busca';
import { mensagemGeral, useEnvio } from './busca';
import { Confirmacao } from '../comum/Confirmacao';
import { useNegocio } from './contexto';
import { inicioDoDia, localParaIso, partesLocais } from './fuso';

/** "25/12/2026 09:00" no fuso do negócio */
export function formatarMomento(iso: string, fuso: string): string {
  const { data, hora } = partesLocais(iso, fuso);
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a} ${hora}`;
}

/** /painel/:negocioId/bloqueios: folgas, feriados e afins, do negócio todo ou de alguém */
export function Bloqueios() {
  const negocio = useNegocio();
  const { fuso } = negocio;
  const hoje = hojeNoFuso(fuso);
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(somarDias(hoje, 90));
  const periodoValido = dataValida(de) && dataValida(ate) && de <= ate;
  const deIso = periodoValido ? inicioDoDia(de, fuso).toISOString() : '';
  const ateIso = periodoValido
    ? inicioDoDia(somarDias(ate, 1), fuso).toISOString()
    : '';

  const bloqueios = useBusca(`${negocio.id}|${deIso}|${ateIso}`, (sinal) =>
    periodoValido
      ? api<Bloqueio[]>(
          `/negocios/${negocio.id}/bloqueios?de=${encodeURIComponent(deIso)}&ate=${encodeURIComponent(ateIso)}`,
          { sinal },
        )
      : Promise.resolve([]),
  );
  const profissionais = useBusca(negocio.id, (sinal) =>
    api<Profissional[]>(`/negocios/${negocio.id}/profissionais`, { sinal }),
  );

  useTempoReal((evento) => {
    // Outra aba criou ou removeu um bloqueio (o evento é o mesmo das reservas)
    if (
      evento.tipo === 'reconectou' ||
      (evento.tipo === 'horarios' && evento.negocio === negocio.slug)
    ) {
      bloqueios.recarregar();
    }
  });

  const [confirmando, setConfirmando] = useState<string | null>(null);
  const remocao = useEnvio();
  const [situacao, setSituacao] = useState('');

  async function remover(b: Bloqueio) {
    const feito = await remocao.enviar(async () => {
      await api<void>(`/negocios/${negocio.id}/bloqueios/${b.id}`, {
        metodo: 'DELETE',
      });
      return true;
    });
    setConfirmando(null);
    if (!feito) return;
    bloqueios.mudar((lista) => lista?.filter((x) => x.id !== b.id));
    setSituacao('Bloqueio removido.');
  }

  const nomeDe = (id: string | null) =>
    id === null
      ? 'Negócio todo'
      : (profissionais.dados?.find((p) => p.id === id)?.nome ?? 'Profissional');

  return (
    <section aria-labelledby="titulo-bloqueios">
      <h2 id="titulo-bloqueios">Bloqueios</h2>
      <p className="miudo dica">
        Folga, feriado, manutenção: ninguém reserva nesse período. Reservas já
        marcadas nele continuam (cancele pela agenda, se for o caso). Horas no
        fuso do negócio ({fuso}).
      </p>
      <div className="cartao">
        <h3>Novo bloqueio</h3>
        <NovoBloqueio
          negocioId={negocio.id}
          fuso={fuso}
          hoje={hoje}
          profissionais={profissionais.dados ?? []}
          aoCriar={() => {
            bloqueios.recarregar();
            setSituacao('Bloqueio criado.');
          }}
        />
      </div>

      <h3 className="titulo-da-lista">Bloqueios no período</h3>
      <div className="barra-da-agenda">
        <label className="campo campo--curto">
          <span>De</span>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </label>
        <label className="campo campo--curto">
          <span>Até</span>
          <input
            type="date"
            value={ate}
            min={de}
            onChange={(e) => setAte(e.target.value)}
          />
        </label>
      </div>
      {!periodoValido && (
        <p className="erro">Escolha um período com o fim depois do começo.</p>
      )}
      <p role="status" className="so-leitor">
        {situacao}
      </p>
      <Erro mensagem={mensagemGeral(remocao.erro, [])} />
      {!bloqueios.dados && bloqueios.carregando && (
        <p className="carregando">Carregando…</p>
      )}
      {bloqueios.mensagem && (
        <div>
          <Erro mensagem={bloqueios.mensagem} />
          <button
            type="button"
            className="botao botao--contorno botao--pequeno"
            onClick={bloqueios.recarregar}
          >
            Tentar de novo
          </button>
        </div>
      )}
      {bloqueios.dados?.length === 0 && periodoValido && (
        <p className="vazio">Nenhum bloqueio nesse período.</p>
      )}
      {bloqueios.dados && bloqueios.dados.length > 0 && (
        <table className="tabela tabela--empilha">
          <thead>
            <tr>
              <th scope="col">Quem</th>
              <th scope="col">Início</th>
              <th scope="col">Fim</th>
              <th scope="col">Motivo</th>
              <th scope="col">
                <span className="so-leitor">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {bloqueios.dados.map((b) => {
              const descricao = `${nomeDe(b.profissionalId)}, de ${formatarMomento(b.inicio, fuso)} a ${formatarMomento(b.fim, fuso)}`;
              return (
                <tr key={b.id}>
                  <td data-rotulo="Quem">{nomeDe(b.profissionalId)}</td>
                  <td data-rotulo="Início">
                    {formatarMomento(b.inicio, fuso)}
                  </td>
                  <td data-rotulo="Fim">{formatarMomento(b.fim, fuso)}</td>
                  <td data-rotulo="Motivo">{b.motivo ?? '—'}</td>
                  <td data-rotulo="Ações" className="acoes-da-linha">
                    {confirmando === b.id ? (
                      <Confirmacao
                        pergunta={`Remover o bloqueio (${descricao})? O período volta a aceitar reservas.`}
                        confirmar="Sim, remover"
                        enviando={remocao.enviando}
                        aoConfirmar={() => void remover(b)}
                        aoVoltar={() => setConfirmando(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="botao botao--perigo botao--pequeno"
                        aria-label={`Remover o bloqueio: ${descricao}`}
                        onClick={() => {
                          remocao.limparErro();
                          setConfirmando(b.id);
                        }}
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function NovoBloqueio({
  negocioId,
  fuso,
  hoje,
  profissionais,
  aoCriar,
}: {
  negocioId: string;
  fuso: string;
  hoje: string;
  profissionais: Profissional[];
  aoCriar: () => void;
}) {
  const [quem, setQuem] = useState('');
  const [dataInicio, setDataInicio] = useState(hoje);
  const [horaInicio, setHoraInicio] = useState('00:00');
  const [dataFim, setDataFim] = useState(somarDias(hoje, 1));
  const [horaFim, setHoraFim] = useState('00:00');
  const [motivo, setMotivo] = useState('');
  const [locais, setLocais] = useState<{ inicio?: string; fim?: string }>({});
  const { enviando, erro, enviar } = useEnvio();
  const daApi = erro instanceof ErroDaApi ? erro : null;

  function converter(data: string, hora: string): string | undefined | null {
    if (!data || !hora) return null;
    return localParaIso(data, hora, fuso);
  }

  function explicar(valor: string | undefined | null): string | undefined {
    if (valor === null) return 'Informe a data e a hora';
    if (valor === undefined) {
      return `Esse horário não existe em ${fuso} nesse dia (o relógio pula no horário de verão)`;
    }
    return undefined;
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    const inicio = converter(dataInicio, horaInicio);
    const fim = converter(dataFim, horaFim);
    const novos = { inicio: explicar(inicio), fim: explicar(fim) };
    setLocais(novos);
    if (!inicio || !fim) return;
    const criado = await enviar(() =>
      api<Bloqueio>(`/negocios/${negocioId}/bloqueios`, {
        metodo: 'POST',
        corpo: {
          ...(quem ? { profissionalId: quem } : {}),
          inicio,
          fim,
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        },
      }),
    );
    if (!criado) return;
    setMotivo('');
    aoCriar();
  }

  const erroDoInicio = locais.inicio ?? daApi?.doCampo('inicio');
  const erroDoFim = locais.fim ?? daApi?.doCampo('fim');

  return (
    <form
      className="formulario formulario--grade"
      onSubmit={(e) => void aoEnviar(e)}
      noValidate
    >
      <Erro
        mensagem={mensagemGeral(erro, [
          'inicio',
          'fim',
          'motivo',
          'profissionalId',
        ])}
      />
      <label className="campo campo--largo">
        <span>Vale para</span>
        <select
          value={quem}
          onChange={(e) => setQuem(e.target.value)}
          aria-invalid={daApi?.doCampo('profissionalId') ? true : undefined}
        >
          <option value="">O negócio todo</option>
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {daApi?.doCampo('profissionalId') && (
          <small className="erro">{daApi.doCampo('profissionalId')}</small>
        )}
      </label>
      <fieldset className="momento">
        <legend>Começa</legend>
        <Campo
          rotulo="Data de início"
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          erro={erroDoInicio}
        />
        <Campo
          rotulo="Hora de início"
          type="time"
          value={horaInicio}
          onChange={(e) => setHoraInicio(e.target.value)}
        />
      </fieldset>
      <fieldset className="momento">
        <legend>Termina</legend>
        <Campo
          rotulo="Data do fim"
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          erro={erroDoFim}
        />
        <Campo
          rotulo="Hora do fim"
          type="time"
          value={horaFim}
          onChange={(e) => setHoraFim(e.target.value)}
        />
      </fieldset>
      <Campo
        rotulo="Motivo (opcional)"
        maxLength={200}
        placeholder="Feriado, folga…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        erro={daApi?.doCampo('motivo')}
      />
      <div className="acoes">
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar bloqueio'}
        </button>
      </div>
    </form>
  );
}
