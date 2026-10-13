import { useState, type FormEvent } from 'react';
import { api, ErroDaApi } from '../api/cliente';
import type { Profissional, Servico } from '../api/tipos';
import { Campo } from '../comum/Campo';
import { Erro } from '../comum/Erro';
import { NOMES_DOS_DIAS } from '../comum/formatos';
import { useBusca } from '../api/busca';
import { mensagemGeral, useEnvio } from './busca';
import { useNegocio } from './contexto';
import { EditorDeHorario } from './EditorDeHorario';
import { ORDEM_DOS_DIAS } from './semana';

/** /painel/:negocioId/profissionais */
export function Profissionais() {
  const negocio = useNegocio();
  const profissionais = useBusca(negocio.id, (sinal) =>
    api<Profissional[]>(`/negocios/${negocio.id}/profissionais`, { sinal }),
  );
  const servicos = useBusca(negocio.id, (sinal) =>
    api<Servico[]>(`/negocios/${negocio.id}/servicos`, { sinal }),
  );

  function trocar(p: Profissional) {
    profissionais.mudar((lista) =>
      lista?.some((x) => x.id === p.id)
        ? lista.map((x) => (x.id === p.id ? p : x))
        : [...(lista ?? []), p],
    );
  }

  return (
    <section aria-labelledby="titulo-profissionais">
      <h2 id="titulo-profissionais">Profissionais</h2>
      <NovoProfissional negocioId={negocio.id} aoCriar={trocar} />
      {!profissionais.dados && profissionais.carregando && (
        <p className="carregando">Carregando…</p>
      )}
      {profissionais.mensagem && (
        <div>
          <Erro mensagem={profissionais.mensagem} />
          <button
            type="button"
            className="botao botao--contorno botao--pequeno"
            onClick={profissionais.recarregar}
          >
            Tentar de novo
          </button>
        </div>
      )}
      {profissionais.dados?.length === 0 && (
        <p className="vazio">
          Nenhum profissional ainda. Cadastre quem atende: cada um tem os
          próprios serviços e o próprio horário.
        </p>
      )}
      {profissionais.dados?.map((p) => (
        <CartaoDoProfissional
          key={p.id}
          negocioId={negocio.id}
          profissional={p}
          servicos={servicos.dados}
          erroDosServicos={servicos.mensagem}
          aoMudar={trocar}
        />
      ))}
    </section>
  );
}

function NovoProfissional({
  negocioId,
  aoCriar,
}: {
  negocioId: string;
  aoCriar: (p: Profissional) => void;
}) {
  const [nome, setNome] = useState('');
  const [situacao, setSituacao] = useState('');
  const { enviando, erro, enviar } = useEnvio();
  const daApi = erro instanceof ErroDaApi ? erro : null;

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setSituacao('');
    const criado = await enviar(() =>
      api<Profissional>(`/negocios/${negocioId}/profissionais`, {
        metodo: 'POST',
        corpo: { nome },
      }),
    );
    if (!criado) return;
    aoCriar(criado);
    setNome('');
    setSituacao(`${criado.nome} cadastrado. Marque os serviços e o horário.`);
  }

  return (
    <form
      className="formulario formulario--linha cartao"
      onSubmit={(e) => void aoEnviar(e)}
      noValidate
    >
      <Erro mensagem={mensagemGeral(erro, ['nome'])} />
      <Campo
        rotulo="Novo profissional"
        placeholder="Nome"
        maxLength={80}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        erro={daApi?.doCampo('nome')}
      />
      <button className="botao" type="submit" disabled={enviando}>
        {enviando ? 'Cadastrando…' : 'Cadastrar'}
      </button>
      <p role="status" className="miudo">
        {situacao}
      </p>
    </form>
  );
}

function resumoDoHorario(p: Profissional): string {
  const dias = ORDEM_DOS_DIAS.filter((d) =>
    p.horarios.some((h) => h.diaDaSemana === d),
  );
  if (!dias.length) return 'sem horário';
  return dias
    .map((d) => NOMES_DOS_DIAS[d].slice(0, 3).toLowerCase())
    .join(', ');
}

function CartaoDoProfissional({
  negocioId,
  profissional: p,
  servicos,
  erroDosServicos,
  aoMudar,
}: {
  negocioId: string;
  profissional: Profissional;
  servicos: Servico[] | undefined;
  erroDosServicos: string | null;
  aoMudar: (p: Profissional) => void;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [abriuHorario, setAbriuHorario] = useState(false);
  const [nome, setNome] = useState(p.nome);
  const patch = useEnvio();
  const daApi = patch.erro instanceof ErroDaApi ? patch.erro : null;
  const caminho = `/negocios/${negocioId}/profissionais/${p.id}`;

  async function mudar(corpo: { nome?: string; ativo?: boolean }) {
    const novo = await patch.enviar(() =>
      api<Profissional>(caminho, { metodo: 'PATCH', corpo }),
    );
    if (!novo) return false;
    aoMudar(novo);
    return true;
  }

  async function renomear(evento: FormEvent) {
    evento.preventDefault();
    if (await mudar({ nome })) setRenomeando(false);
  }

  return (
    <article
      className={`cartao profissional${p.ativo ? '' : ' profissional--inativo'}`}
      aria-label={p.nome}
    >
      <header className="profissional__topo">
        {renomeando ? (
          <form
            className="formulario formulario--linha"
            onSubmit={(e) => void renomear(e)}
            noValidate
          >
            <Campo
              rotulo={`Novo nome de ${p.nome}`}
              maxLength={80}
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              erro={daApi?.doCampo('nome')}
            />
            <button
              className="botao botao--pequeno"
              type="submit"
              disabled={patch.enviando}
            >
              Salvar nome
            </button>
            <button
              className="botao botao--contorno botao--pequeno"
              type="button"
              onClick={() => {
                setNome(p.nome);
                setRenomeando(false);
                patch.limparErro();
              }}
            >
              Voltar
            </button>
          </form>
        ) : (
          <>
            <h3>{p.nome}</h3>
            <span className="miudo">
              {p.ativo ? 'Ativo' : 'Inativo: não aparece para os clientes'} ·{' '}
              {resumoDoHorario(p)}
            </span>
            <div className="acoes">
              <button
                type="button"
                className="botao botao--contorno botao--pequeno"
                onClick={() => setRenomeando(true)}
                aria-label={`Renomear ${p.nome}`}
              >
                Renomear
              </button>
              <button
                type="button"
                className="botao botao--contorno botao--pequeno"
                disabled={patch.enviando}
                onClick={() => void mudar({ ativo: !p.ativo })}
                aria-label={`${p.ativo ? 'Desativar' : 'Ativar'} ${p.nome}`}
              >
                {p.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </>
        )}
      </header>
      <Erro mensagem={mensagemGeral(patch.erro, renomeando ? ['nome'] : [])} />

      <details>
        <summary>Serviços que faz ({p.servicoIds.length})</summary>
        {servicos ? (
          <ServicosDoProfissional
            negocioId={negocioId}
            profissional={p}
            servicos={servicos}
            aoSalvar={aoMudar}
          />
        ) : erroDosServicos ? (
          <Erro mensagem={erroDosServicos} />
        ) : (
          <p className="carregando">Carregando os serviços…</p>
        )}
      </details>
      <details
        onToggle={(e) => {
          if (e.currentTarget.open) setAbriuHorario(true);
        }}
      >
        <summary>Horário semanal</summary>
        {/* Só monta ao abrir (são 7 dias de campos por profissional); depois fica montado,
            para não perder o que foi digitado se a pessoa fechar e abrir de novo */}
        {abriuHorario && (
          <EditorDeHorario
            negocioId={negocioId}
            profissional={p}
            aoSalvar={aoMudar}
          />
        )}
      </details>
    </article>
  );
}

function ServicosDoProfissional({
  negocioId,
  profissional: p,
  servicos,
  aoSalvar,
}: {
  negocioId: string;
  profissional: Profissional;
  servicos: Servico[];
  aoSalvar: (p: Profissional) => void;
}) {
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(
    () => new Set(p.servicoIds),
  );
  const [situacao, setSituacao] = useState('');
  const { enviando, erro, enviar } = useEnvio();

  if (!servicos.length) {
    return (
      <p className="vazio">
        Nenhum serviço cadastrado. Crie os serviços na aba Serviços.
      </p>
    );
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setSituacao('');
    const salvo = await enviar(() =>
      api<Profissional>(
        `/negocios/${negocioId}/profissionais/${p.id}/servicos`,
        // A lista inteira, na ordem da tela: o PUT troca tudo
        {
          metodo: 'PUT',
          corpo: {
            servicoIds: servicos
              .filter((s) => marcados.has(s.id))
              .map((s) => s.id),
          },
        },
      ),
    );
    if (!salvo) return;
    aoSalvar(salvo);
    setSituacao('Serviços salvos.');
  }

  return (
    <form onSubmit={(e) => void salvar(e)} className="servicos-do-profissional">
      <Erro mensagem={mensagemGeral(erro, [])} />
      <fieldset>
        <legend className="so-leitor">Serviços que {p.nome} faz</legend>
        {servicos.map((s) => (
          <label key={s.id} className="caixa">
            <input
              type="checkbox"
              checked={marcados.has(s.id)}
              onChange={(e) => {
                const novo = new Set(marcados);
                if (e.target.checked) novo.add(s.id);
                else novo.delete(s.id);
                setMarcados(novo);
                setSituacao('');
              }}
            />
            {s.nome}
            {!s.ativo && <span className="miudo"> (inativo)</span>}
          </label>
        ))}
      </fieldset>
      <div className="acoes">
        <button
          className="botao botao--pequeno"
          type="submit"
          disabled={enviando}
        >
          {enviando ? 'Salvando…' : 'Salvar serviços'}
        </button>
        <span role="status" className="miudo">
          {situacao}
        </span>
      </div>
    </form>
  );
}
