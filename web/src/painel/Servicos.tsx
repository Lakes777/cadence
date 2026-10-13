import { useState, type FormEvent } from 'react';
import { api, ErroDaApi } from '../api/cliente';
import type { Servico } from '../api/tipos';
import { Campo } from '../comum/Campo';
import { Erro } from '../comum/Erro';
import { formatarDinheiro } from '../comum/formatos';
import { mensagemGeral, useBusca, useEnvio } from './busca';
import { useNegocio } from './contexto';
import { centavosParaReais, reaisParaCentavos } from './dinheiro';

/** /painel/:negocioId/servicos */
export function Servicos() {
  const negocio = useNegocio();
  const servicos = useBusca(
    (sinal) => api<Servico[]>(`/negocios/${negocio.id}/servicos`, { sinal }),
    negocio.id,
  );
  const [editando, setEditando] = useState<string | null>(null);
  const alternar = useEnvio();
  const editado = servicos.dados?.find((s) => s.id === editando);

  function trocar(s: Servico) {
    servicos.definir((lista) =>
      lista?.some((x) => x.id === s.id)
        ? lista.map((x) => (x.id === s.id ? s : x))
        : [...(lista ?? []), s],
    );
  }

  async function ativar(s: Servico) {
    const novo = await alternar.enviar(() =>
      api<Servico>(`/negocios/${negocio.id}/servicos/${s.id}`, {
        metodo: 'PATCH',
        corpo: { ativo: !s.ativo },
      }),
    );
    if (novo) trocar(novo);
  }

  return (
    <section aria-labelledby="titulo-servicos">
      <h2 id="titulo-servicos">Serviços</h2>
      {editado ? (
        <div className="cartao">
          <h3>Editar {editado.nome}</h3>
          <FormularioDeServico
            key={editado.id}
            negocioId={negocio.id}
            servico={editado}
            aoSalvar={(s) => {
              trocar(s);
              setEditando(null);
            }}
            aoVoltar={() => setEditando(null)}
          />
        </div>
      ) : (
        <div className="cartao">
          <h3>Novo serviço</h3>
          <FormularioDeServico negocioId={negocio.id} aoSalvar={trocar} />
        </div>
      )}

      {!servicos.dados && servicos.carregando && (
        <p className="carregando">Carregando…</p>
      )}
      {servicos.erro && (
        <div>
          <Erro mensagem={servicos.erro} />
          <button
            type="button"
            className="botao botao--contorno botao--pequeno"
            onClick={servicos.recarregar}
          >
            Tentar de novo
          </button>
        </div>
      )}
      <Erro mensagem={mensagemGeral(alternar.erro, [])} />
      {servicos.dados?.length === 0 && (
        <p className="vazio">
          Nenhum serviço ainda. Cada serviço tem duração e preço; depois, marque
          quem faz cada um na aba Profissionais.
        </p>
      )}
      {servicos.dados && servicos.dados.length > 0 && (
        <table className="tabela tabela--empilha">
          <thead>
            <tr>
              <th scope="col">Serviço</th>
              <th scope="col">Duração</th>
              <th scope="col">Preço</th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className="so-leitor">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {servicos.dados.map((s) => (
              <tr key={s.id} className={s.ativo ? undefined : 'inativo'}>
                <td data-rotulo="Serviço">{s.nome}</td>
                <td data-rotulo="Duração">{s.duracaoMin} min</td>
                <td data-rotulo="Preço">{formatarDinheiro(s.precoCentavos)}</td>
                <td data-rotulo="Situação">{s.ativo ? 'Ativo' : 'Inativo'}</td>
                <td data-rotulo="Ações" className="acoes-da-linha">
                  <button
                    type="button"
                    className="botao botao--contorno botao--pequeno"
                    aria-label={`Editar ${s.nome}`}
                    onClick={() => setEditando(s.id)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="botao botao--contorno botao--pequeno"
                    disabled={alternar.enviando}
                    aria-label={`${s.ativo ? 'Desativar' : 'Ativar'} ${s.nome}`}
                    onClick={() => void ativar(s)}
                  >
                    {s.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FormularioDeServico({
  negocioId,
  servico,
  aoSalvar,
  aoVoltar,
}: {
  negocioId: string;
  servico?: Servico;
  aoSalvar: (s: Servico) => void;
  aoVoltar?: () => void;
}) {
  const [nome, setNome] = useState(servico?.nome ?? '');
  const [duracao, setDuracao] = useState(String(servico?.duracaoMin ?? 30));
  const [preco, setPreco] = useState(
    servico ? centavosParaReais(servico.precoCentavos) : '',
  );
  const [erroDoPreco, setErroDoPreco] = useState<string | undefined>();
  const [situacao, setSituacao] = useState('');
  const { enviando, erro, enviar } = useEnvio();
  const daApi = erro instanceof ErroDaApi ? erro : null;

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setSituacao('');
    const precoCentavos = reaisParaCentavos(preco);
    if (precoCentavos === undefined) {
      setErroDoPreco('Digite o preço em reais, como 35,00');
      return;
    }
    setErroDoPreco(undefined);
    const corpo = { nome, duracaoMin: Number(duracao), precoCentavos };
    const salvo = await enviar(() =>
      api<Servico>(
        servico
          ? `/negocios/${negocioId}/servicos/${servico.id}`
          : `/negocios/${negocioId}/servicos`,
        { metodo: servico ? 'PATCH' : 'POST', corpo },
      ),
    );
    if (!salvo) return;
    aoSalvar(salvo);
    if (!servico) {
      setNome('');
      setPreco('');
      setSituacao(`${salvo.nome} criado.`);
    }
  }

  return (
    <form
      className="formulario formulario--grade"
      onSubmit={(e) => void aoEnviar(e)}
      noValidate
    >
      <Erro
        mensagem={mensagemGeral(erro, ['nome', 'duracaoMin', 'precoCentavos'])}
      />
      <Campo
        rotulo="Nome"
        maxLength={80}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        erro={daApi?.doCampo('nome')}
      />
      <Campo
        rotulo="Duração (minutos)"
        type="number"
        inputMode="numeric"
        min={5}
        max={480}
        step={5}
        value={duracao}
        onChange={(e) => setDuracao(e.target.value)}
        erro={daApi?.doCampo('duracaoMin')}
      />
      <Campo
        rotulo="Preço (R$)"
        inputMode="decimal"
        placeholder="35,00"
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        erro={erroDoPreco ?? daApi?.doCampo('precoCentavos')}
      />
      <div className="acoes">
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : servico ? 'Salvar' : 'Criar serviço'}
        </button>
        {aoVoltar && (
          <button
            type="button"
            className="botao botao--contorno"
            onClick={aoVoltar}
            disabled={enviando}
          >
            Voltar
          </button>
        )}
        <span role="status" className="miudo">
          {situacao}
        </span>
      </div>
    </form>
  );
}
