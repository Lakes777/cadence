import { Link, NavLink, Route, Routes, useParams } from 'react-router';
import { useAssinatura, useTempoReal } from '../api/hooks';
import { Erro } from '../comum/Erro';
import { Agenda } from './Agenda';
import { Bloqueios } from './Bloqueios';
import { NegocioContexto, useNegocios } from './contexto';
import { DadosDoNegocio } from './DadosDoNegocio';
import { Profissionais } from './Profissionais';
import { Servicos } from './Servicos';
import { useTitulo } from '../comum/titulo';

const ABAS = [
  { para: '', nome: 'Agenda' },
  { para: 'profissionais', nome: 'Profissionais' },
  { para: 'servicos', nome: 'Serviços' },
  { para: 'bloqueios', nome: 'Bloqueios' },
  { para: 'negocio', nome: 'Negócio' },
] as const;

/** /painel/:negocioId/*: a navegação interna e as telas de um negócio */
export function PainelDoNegocio() {
  const { negocioId } = useParams();
  const negocios = useNegocios();
  const negocio = negocios.dados?.find((n) => n.id === negocioId);
  useTitulo(negocio ? `${negocio.nome} · Painel` : 'Painel');

  // Uma assinatura para todas as abas: a agenda e os bloqueios ouvem os eventos
  useAssinatura(negocio?.slug);
  useTempoReal((evento) => {
    // O negócio mudou em outra aba (endereço, fuso, nome): a lista precisa do novo, senão a
    // agenda seguiria contando as horas no fuso antigo
    if (evento.tipo === 'catalogo' && evento.negocio === negocio?.slug) {
      negocios.recarregar();
    }
  });

  if (!negocios.dados) {
    if (negocios.mensagem) {
      return (
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
      );
    }
    return <p className="carregando">Carregando…</p>;
  }
  if (!negocio) {
    return (
      <div className="cartao" role="alert">
        <h1>Negócio não encontrado</h1>
        <p>Ele não existe ou não é seu.</p>
        <Link to="/painel">Ver meus negócios</Link>
      </div>
    );
  }

  const base = `/painel/${negocio.id}`;
  return (
    <NegocioContexto.Provider value={negocio}>
      <div className="painel-topo">
        <p className="miudo">
          <Link to="/painel">Meus negócios</Link> / {negocio.fuso}
        </p>
        <h1>{negocio.nome}</h1>
      </div>
      <nav className="abas" aria-label="Seções do negócio">
        {ABAS.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para ? `${base}/${aba.para}` : base}
            end
          >
            {aba.nome}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Agenda />} />
        <Route path="profissionais" element={<Profissionais />} />
        <Route path="servicos" element={<Servicos />} />
        <Route path="bloqueios" element={<Bloqueios />} />
        <Route path="negocio" element={<DadosDoNegocio />} />
        <Route
          path="*"
          element={
            <p>
              Seção não encontrada. <Link to={base}>Ir para a agenda</Link>
            </p>
          }
        />
      </Routes>
    </NegocioContexto.Provider>
  );
}
