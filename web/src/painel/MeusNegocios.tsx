import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, ErroDaApi } from '../api/cliente';
import type { Negocio } from '../api/tipos';
import { Campo } from '../comum/Campo';
import { Erro } from '../comum/Erro';
import { mensagemGeral, useEnvio } from './busca';
import { comNegocio, useNegocios } from './contexto';
import { SeletorDeFuso } from './SeletorDeFuso';
import { useTitulo } from '../comum/titulo';

/** /painel: os negócios do dono, ou o convite para criar o primeiro */
export function MeusNegocios() {
  useTitulo('Meus negócios');
  const negocios = useNegocios();
  const [criando, setCriando] = useState(false);
  const lista = negocios.dados;

  return (
    <section aria-labelledby="titulo-negocios">
      <h1 id="titulo-negocios">Meus negócios</h1>
      {lista === undefined && negocios.carregando && (
        <p className="carregando">Carregando…</p>
      )}
      {lista === undefined && negocios.mensagem && (
        <div>
          <Erro mensagem={negocios.mensagem} />
          <button
            type="button"
            className="botao botao--contorno"
            onClick={negocios.recarregar}
          >
            Tentar de novo
          </button>
        </div>
      )}
      {lista && lista.length === 0 && (
        <div className="cartao">
          <h2>Comece pelo seu negócio</h2>
          <p>
            Crie o negócio (a barbearia, a quadra, o estúdio) e depois cadastre
            os profissionais, os serviços e o horário de cada um. Seus clientes
            reservam pelo endereço público dele.
          </p>
          <NovoNegocio />
        </div>
      )}
      {lista && lista.length > 0 && (
        <>
          <ul className="lista-simples lista-de-negocios">
            {lista.map((n) => (
              <li key={n.id}>
                <Link to={`/painel/${n.id}`} className="titulo">
                  {n.nome}
                </Link>
                <span className="miudo">
                  /b/{n.slug} · {n.fuso}
                </span>
              </li>
            ))}
          </ul>
          {criando ? (
            <div className="cartao">
              <h2>Novo negócio</h2>
              <NovoNegocio aoVoltar={() => setCriando(false)} />
            </div>
          ) : (
            <button
              type="button"
              className="botao botao--contorno"
              onClick={() => setCriando(true)}
            >
              Criar outro negócio
            </button>
          )}
        </>
      )}
    </section>
  );
}

function NovoNegocio({ aoVoltar }: { aoVoltar?: () => void }) {
  const negocios = useNegocios();
  const navegar = useNavigate();
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [fuso, setFuso] = useState('America/Sao_Paulo');
  const { enviando, erro, enviar } = useEnvio();
  const daApi = erro instanceof ErroDaApi ? erro : null;
  // 409 é endereço repetido: o servidor manda só a mensagem, sem dizer o campo
  const erroDoSlug =
    daApi?.doCampo('slug') ??
    (daApi?.status === 409 ? daApi.message : undefined);
  const semCampo = mensagemGeral(erro, ['nome', 'slug', 'fuso'], [409]);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    const criado = await enviar(() =>
      api<Negocio>('/negocios', {
        metodo: 'POST',
        corpo: { nome, ...(slug.trim() ? { slug: slug.trim() } : {}), fuso },
      }),
    );
    if (!criado) return;
    negocios.mudar((lista) => comNegocio(lista, criado));
    await navegar(`/painel/${criado.id}`);
  }

  return (
    <form className="formulario" onSubmit={(e) => void aoEnviar(e)} noValidate>
      <Erro mensagem={semCampo} />
      <Campo
        rotulo="Nome do negócio"
        required
        maxLength={80}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        erro={daApi?.doCampo('nome')}
      />
      <Campo
        rotulo="Endereço (opcional)"
        placeholder="barbearia-exemplo"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={60}
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        erro={erroDoSlug}
      />
      <p className="miudo dica">Fica em /b/endereço. Em branco, sai do nome.</p>
      <SeletorDeFuso
        valor={fuso}
        aoMudar={setFuso}
        erro={daApi?.doCampo('fuso')}
        desabilitado={enviando}
      />
      <div className="acoes">
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar negócio'}
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
      </div>
    </form>
  );
}
