import { createContext, useContext } from 'react';
import type { Negocio } from '../api/tipos';
import type { Busca } from './busca';

/** Os negócios do dono, buscados uma vez pelo Painel e compartilhados pelas telas dele */
export const NegociosContexto = createContext<Busca<Negocio[]> | null>(null);

export function useNegocios(): Busca<Negocio[]> {
  const valor = useContext(NegociosContexto);
  if (!valor) throw new Error('useNegocios fora do Painel');
  return valor;
}

/** O negócio aberto em /painel/:negocioId */
export const NegocioContexto = createContext<Negocio | null>(null);

export function useNegocio(): Negocio {
  const valor = useContext(NegocioContexto);
  if (!valor) throw new Error('useNegocio fora de /painel/:negocioId');
  return valor;
}

/** Troca (ou acrescenta) um negócio na lista, depois de criar ou editar */
export function comNegocio(
  lista: Negocio[] | undefined,
  negocio: Negocio,
): Negocio[] {
  const atual = lista ?? [];
  return atual.some((n) => n.id === negocio.id)
    ? atual.map((n) => (n.id === negocio.id ? negocio : n))
    : [...atual, negocio];
}
