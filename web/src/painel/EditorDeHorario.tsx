import { useId, useState, type FormEvent } from 'react';
import { api, ErroDaApi, mensagemDe } from '../api/cliente';
import type { Profissional } from '../api/tipos';
import { NOMES_DOS_DIAS } from '../comum/formatos';
import {
  chaveDoIntervalo,
  copiarParaDiasUteis,
  DIAS_UTEIS,
  errosPorIntervalo,
  listaDa,
  ORDEM_DOS_DIAS,
  semanaDe,
  type Semana,
} from './semana';

/**
 * O horário semanal de um profissional: um ou mais intervalos por dia (ex.: 09:00–12:00 e
 * 13:00–18:00). Salvar manda a semana inteira (PUT .../horarios); o servidor confere o formato
 * e recusa intervalos sobrepostos, e cada erro aparece embaixo do intervalo dele.
 */
export function EditorDeHorario({
  negocioId,
  profissional,
  aoSalvar,
}: {
  negocioId: string;
  profissional: Profissional;
  aoSalvar: (p: Profissional) => void;
}) {
  const id = useId();
  const [semana, setSemana] = useState<Semana>(() =>
    semanaDe(profissional.horarios),
  );
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<{
    porIntervalo: Map<string, string>;
    geral: string[];
  }>({ porIntervalo: new Map(), geral: [] });
  const [situacao, setSituacao] = useState('');

  function mudar(nova: Semana) {
    setSemana(nova);
    setSituacao('');
  }

  function mudarIntervalo(
    dia: number,
    posicao: number,
    lado: 'inicio' | 'fim',
    valor: string,
  ) {
    mudar(
      semana.map((intervalos, d) =>
        d === dia
          ? intervalos.map((i, p) =>
              p === posicao ? { ...i, [lado]: valor } : i,
            )
          : intervalos,
      ),
    );
  }

  function adicionar(dia: number) {
    const ultimo = semana[dia].at(-1);
    // Um palpite útil: depois do último intervalo, ou o expediente comercial
    const novo = ultimo
      ? { inicio: ultimo.fim, fim: '' }
      : { inicio: '09:00', fim: '18:00' };
    mudar(
      semana.map((intervalos, d) =>
        d === dia ? [...intervalos, novo] : intervalos,
      ),
    );
  }

  function remover(dia: number, posicao: number) {
    mudar(
      semana.map((intervalos, d) =>
        d === dia ? intervalos.filter((_, p) => p !== posicao) : intervalos,
      ),
    );
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const { horarios, origem } = listaDa(semana);
    setEnviando(true);
    setErros({ porIntervalo: new Map(), geral: [] });
    setSituacao('');
    try {
      const salvo = await api<Profissional>(
        `/negocios/${negocioId}/profissionais/${profissional.id}/horarios`,
        { metodo: 'PUT', corpo: { horarios } },
      );
      setSemana(semanaDe(salvo.horarios));
      aoSalvar(salvo);
      setSituacao('Horário salvo.');
    } catch (e) {
      if (e instanceof ErroDaApi && e.erros.length) {
        const separados = errosPorIntervalo(e.erros, origem);
        setErros({
          porIntervalo: separados.porIntervalo,
          geral: separados.geral.length
            ? separados.geral
            : ['Confira os intervalos marcados.'],
        });
      } else {
        setErros({ porIntervalo: new Map(), geral: [mensagemDe(e)] });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="editor-de-horario"
      onSubmit={(e) => void salvar(e)}
      noValidate
    >
      {erros.geral.length > 0 && (
        <p className="alerta" role="alert">
          {erros.geral.join(' ')}
        </p>
      )}
      <p className="miudo dica">
        Horas no formato HH:MM, no fuso do negócio. O fim do dia é 24:00.
      </p>
      {ORDEM_DOS_DIAS.map((dia) => {
        const nomeDoDia = NOMES_DOS_DIAS[dia];
        const intervalos = semana[dia];
        const util = (DIAS_UTEIS as readonly number[]).includes(dia);
        return (
          <fieldset key={dia} className="dia-do-horario">
            <legend>{nomeDoDia}</legend>
            {intervalos.length === 0 && <p className="miudo">Não trabalha.</p>}
            {intervalos.map((intervalo, posicao) => {
              const chave = chaveDoIntervalo(dia, posicao);
              const erro = erros.porIntervalo.get(chave);
              const idDoErro = `${id}-${chave}-erro`;
              const descricao = `${posicao + 1}º intervalo de ${nomeDoDia.toLowerCase()}`;
              return (
                <div key={posicao} className="intervalo">
                  <label className="campo campo--hora">
                    <span>Início</span>
                    <input
                      inputMode="numeric"
                      placeholder="09:00"
                      maxLength={5}
                      aria-label={`Início do ${descricao}`}
                      value={intervalo.inicio}
                      aria-invalid={erro ? true : undefined}
                      aria-describedby={erro ? idDoErro : undefined}
                      onChange={(e) =>
                        mudarIntervalo(dia, posicao, 'inicio', e.target.value)
                      }
                    />
                  </label>
                  <label className="campo campo--hora">
                    <span>Fim</span>
                    <input
                      inputMode="numeric"
                      placeholder="18:00"
                      maxLength={5}
                      aria-label={`Fim do ${descricao}`}
                      value={intervalo.fim}
                      aria-invalid={erro ? true : undefined}
                      aria-describedby={erro ? idDoErro : undefined}
                      onChange={(e) =>
                        mudarIntervalo(dia, posicao, 'fim', e.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="botao botao--contorno botao--pequeno"
                    aria-label={`Remover o ${descricao}`}
                    onClick={() => remover(dia, posicao)}
                  >
                    Remover
                  </button>
                  {erro && (
                    <small className="erro intervalo__erro" id={idDoErro}>
                      {erro}
                    </small>
                  )}
                </div>
              );
            })}
            <div className="acoes">
              <button
                type="button"
                className="botao-link"
                aria-label={`Adicionar intervalo ${dia === 0 || dia === 6 ? 'no' : 'na'} ${nomeDoDia.toLowerCase()}`}
                onClick={() => adicionar(dia)}
              >
                + Adicionar intervalo
              </button>
              {util && (
                <button
                  type="button"
                  className="botao-link"
                  aria-label={`Copiar ${nomeDoDia.toLowerCase()} para os outros dias úteis`}
                  onClick={() => mudar(copiarParaDiasUteis(semana, dia))}
                >
                  Copiar para os outros dias úteis
                </button>
              )}
            </div>
          </fieldset>
        );
      })}
      <div className="acoes">
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar horário'}
        </button>
        <span role="status" className="miudo">
          {situacao}
        </span>
      </div>
    </form>
  );
}
