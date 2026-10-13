import { Route, Routes } from 'react-router';
import { api } from '../api/cliente';
import { useDemo } from '../api/hooks';
import type { Negocio } from '../api/tipos';
import { useBusca } from './busca';
import { NegociosContexto } from './contexto';
import { MeusNegocios } from './MeusNegocios';
import { PainelDoNegocio } from './PainelDoNegocio';
import './painel.css';

/**
 * /painel/* (só para dono): a lista de negócios e, em /painel/:negocioId/..., as telas de um
 * negócio. A lista é buscada uma vez aqui e compartilhada (criar e editar já a atualizam).
 */
export function Painel() {
  const demo = useDemo();
  const negocios = useBusca(
    (sinal) => api<Negocio[]>('/negocios', { sinal }),
    'negocios',
  );

  return (
    <NegociosContexto.Provider value={negocios}>
      {demo?.demo && (
        <p className="aviso" role="note">
          Você está no painel de exemplo: as mudanças voltam ao original a cada
          hora.
        </p>
      )}
      <Routes>
        <Route index element={<MeusNegocios />} />
        <Route path=":negocioId/*" element={<PainelDoNegocio />} />
      </Routes>
    </NegociosContexto.Provider>
  );
}
