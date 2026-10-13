import { useRef, useState, type FormEvent } from 'react';
import { api, ErroDaApi } from '../api/cliente';
import type { Negocio } from '../api/tipos';
import { Campo } from '../comum/Campo';
import { Erro } from '../comum/Erro';
import { mensagemGeral, useEnvio } from './busca';
import { comNegocio, useNegocio, useNegocios } from './contexto';
import { SeletorDeFuso } from './SeletorDeFuso';

/**
 * Copia o texto: a API do clipboard (só em HTTPS ou localhost) e, sem ela, o jeito antigo
 * (selecionar um campo e execCommand). Devolve false se nenhum funcionou.
 */
export async function copiarTexto(
  texto: string,
  campo?: HTMLInputElement | null,
): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // permissão negada ou página sem foco: tenta o jeito antigo
  }
  if (!campo || typeof document.execCommand !== 'function') return false;
  campo.focus();
  campo.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/** /painel/:negocioId/negocio: nome, endereço e fuso, e o link público para divulgar */
export function DadosDoNegocio() {
  const negocio = useNegocio();
  const negocios = useNegocios();
  const [nome, setNome] = useState(negocio.nome);
  const [slug, setSlug] = useState(negocio.slug);
  const [fuso, setFuso] = useState(negocio.fuso);
  const [situacao, setSituacao] = useState('');
  const { enviando, erro, enviar, limparErro } = useEnvio();
  const daApi = erro instanceof ErroDaApi ? erro : null;
  const erroDoSlug =
    daApi?.doCampo('slug') ??
    (daApi?.status === 409 ? daApi.message : undefined);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setSituacao('');
    const mudancas: Partial<Negocio> = {};
    if (nome.trim() !== negocio.nome) mudancas.nome = nome;
    if (slug.trim().toLowerCase() !== negocio.slug) mudancas.slug = slug.trim();
    if (fuso.trim() !== negocio.fuso) mudancas.fuso = fuso.trim();
    if (!Object.keys(mudancas).length) {
      limparErro();
      setSituacao('Nada mudou.');
      return;
    }
    const salvo = await enviar(() =>
      api<Negocio>(`/negocios/${negocio.id}`, {
        metodo: 'PATCH',
        corpo: mudancas,
      }),
    );
    if (!salvo) return;
    negocios.definir((lista) => comNegocio(lista, salvo));
    setNome(salvo.nome);
    setSlug(salvo.slug);
    setFuso(salvo.fuso);
    setSituacao(
      mudancas.slug
        ? 'Dados salvos. O endereço antigo deixou de funcionar.'
        : 'Dados salvos.',
    );
  }

  return (
    <section aria-labelledby="titulo-dados">
      <h2 id="titulo-dados">Dados do negócio</h2>
      <LinkPublico slug={negocio.slug} />
      <div className="cartao">
        <form
          className="formulario"
          onSubmit={(e) => void salvar(e)}
          noValidate
        >
          <Erro
            mensagem={mensagemGeral(erro, ['nome', 'slug', 'fuso'], [409])}
          />
          <Campo
            rotulo="Nome"
            maxLength={80}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            erro={daApi?.doCampo('nome')}
          />
          <Campo
            rotulo="Endereço"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={60}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            erro={erroDoSlug}
          />
          <p className="miudo dica">
            Trocar o endereço tira do ar o link antigo.
          </p>
          <SeletorDeFuso
            valor={fuso}
            aoMudar={setFuso}
            erro={daApi?.doCampo('fuso')}
            desabilitado={enviando}
          />
          <p className="miudo dica">
            O horário semanal segue o relógio do fuso: 09:00 continua 09:00 no
            fuso novo.
          </p>
          <div className="acoes">
            <button className="botao" type="submit" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar'}
            </button>
            <span role="status" className="miudo">
              {situacao}
            </span>
          </div>
        </form>
      </div>
    </section>
  );
}

function LinkPublico({ slug }: { slug: string }) {
  const caminho = `/b/${slug}`;
  const link = `${window.location.origin}${caminho}`;
  const campo = useRef<HTMLInputElement>(null);
  const [situacao, setSituacao] = useState('');

  async function copiar() {
    const deu = await copiarTexto(link, campo.current);
    setSituacao(
      deu
        ? 'Link copiado.'
        : 'Não deu para copiar sozinho: o link está selecionado, copie com Ctrl+C.',
    );
    if (!deu) campo.current?.select();
  }

  return (
    <div className="cartao link-publico">
      <h3>Link para os clientes</h3>
      <label className="campo">
        <span>Endereço público</span>
        <input
          ref={campo}
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
        />
      </label>
      <div className="acoes">
        <button type="button" className="botao" onClick={() => void copiar()}>
          Copiar link
        </button>
        <a
          className="botao botao--contorno"
          href={caminho}
          target="_blank"
          rel="noreferrer"
        >
          Abrir a página
          <span className="so-leitor"> (abre em outra aba)</span>
        </a>
        <span role="status" className="miudo">
          {situacao}
        </span>
      </div>
    </div>
  );
}
