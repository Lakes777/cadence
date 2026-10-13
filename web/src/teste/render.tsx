import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { aplicar } from '../api/sessao';
import type { Usuario } from '../api/tipos';

/** Renderiza a tela numa rota (com os parâmetros), como se o navegador estivesse nela */
export function renderNaRota(
  tela: ReactElement,
  { rota = '/', caminho = '/' }: { rota?: string; caminho?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path={rota} element={tela} />
        <Route path="*" element={<p>outra página</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

export const CLIENTE: Usuario = {
  id: 'c1',
  nome: 'Clara Cliente',
  email: 'clara@exemplo.com',
  papel: 'cliente',
};

export const DONO: Usuario = {
  id: 'd1',
  nome: 'Davi Dono',
  email: 'davi@exemplo.com',
  papel: 'dono',
};

/** Deixa a aba logada (sem passar pela tela de entrar) */
export function logarComo(usuario: Usuario): void {
  aplicar({ usuario, tokenDeAcesso: `token-${usuario.id}`, expiraEm: 900 });
}
