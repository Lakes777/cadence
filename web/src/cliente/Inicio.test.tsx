import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFalsa } from '../teste/api-falsa';
import { Inicio } from './Inicio';
import { renderComLocal } from './teste-do-cliente';

describe('Inicio', () => {
  it('mostra o relógio, o título e, na demonstração, leva ao negócio de exemplo', async () => {
    apiFalsa({ 'GET /demo': { corpo: { demo: true, negocio: 'navalha' } } });
    renderComLocal(<Inicio />);
    expect(
      screen.getByRole('heading', { name: /Bata o ponto no seu horário\./ }),
    ).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
    expect(screen.getByText('LIVRE')).toBeInTheDocument();
    const botao = await screen.findByRole('link', { name: 'Reservar horário' });
    expect(botao).toHaveAttribute('href', '/b/navalha');
    expect(
      screen.queryByLabelText('Endereço do estabelecimento'),
    ).not.toBeInTheDocument();
  });

  it('fora da demonstração, explica o link e vai ao endereço digitado', async () => {
    apiFalsa({ 'GET /demo': { corpo: { demo: false, negocio: null } } });
    const usuario = userEvent.setup();
    renderComLocal(<Inicio />);
    const campo = await screen.findByLabelText('Endereço do estabelecimento');
    expect(screen.getByText(/próprio link de reservas/)).toBeInTheDocument();

    await usuario.type(campo, 'Barbearia Velha!');
    await usuario.click(
      screen.getByRole('button', { name: 'Reservar horário' }),
    );
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Use só letras, números e hífen/)).toBeVisible();
    expect(screen.getByTestId('local')).toHaveTextContent(/^\/$/);

    await usuario.clear(campo);
    await usuario.type(campo, 'https://cadence.exemplo/b/Barbearia-Sao-Joao/');
    await usuario.click(
      screen.getByRole('button', { name: 'Reservar horário' }),
    );
    expect(screen.getByTestId('local')).toHaveTextContent(
      '/b/barbearia-sao-joao',
    );
  });

  it('sem resposta do /demo, também oferece o campo', async () => {
    apiFalsa({});
    renderComLocal(<Inicio />);
    expect(
      await screen.findByLabelText('Endereço do estabelecimento'),
    ).toBeInTheDocument();
  });
});
