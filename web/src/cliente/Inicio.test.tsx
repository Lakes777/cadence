import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFalsa } from '../teste/api-falsa';
import { Inicio } from './Inicio';
import { renderComLocal } from './teste-do-cliente';

describe('Inicio', () => {
  it('mostra o cartão, o título e, na demonstração, os dois caminhos', async () => {
    apiFalsa({ 'GET /demo': { corpo: { demo: true, negocio: 'navalha' } } });
    renderComLocal(<Inicio />);
    expect(
      screen.getByRole('heading', { name: /Bata o ponto no seu horário\./ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reservado')).toBeInTheDocument();
    const cliente = await screen.findByRole('link', {
      name: 'Reservar como cliente',
    });
    expect(cliente).toHaveAttribute('href', '/b/navalha');
    expect(
      screen.getByRole('button', { name: 'Ver o painel do dono' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Endereço do estabelecimento'),
    ).not.toBeInTheDocument();
  });

  it('explica como funciona para os dois lados e o que é garantido', async () => {
    apiFalsa({ 'GET /demo': { corpo: { demo: true, negocio: 'navalha' } } });
    renderComLocal(<Inicio />);
    expect(
      screen.getByRole('heading', { name: 'Como funciona' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Para quem reserva' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Para o estabelecimento' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Sem reserva dupla' }),
    ).toBeInTheDocument();
  });

  it('o painel do dono entra como visitante e abre o /painel', async () => {
    const falsa = apiFalsa({
      'GET /demo': { corpo: { demo: true, negocio: 'navalha' } },
      'POST /auth/visitante': {
        corpo: {
          usuario: { id: 'd1', nome: 'Visitante', email: 'v@x', papel: 'dono' },
          tokenDeAcesso: 't',
          expiraEm: 900,
        },
      },
    });
    const usuario = userEvent.setup();
    renderComLocal(<Inicio />);
    await usuario.click(
      await screen.findByRole('button', { name: 'Ver o painel do dono' }),
    );
    expect(await screen.findByTestId('local')).toHaveTextContent('/painel');
    expect(falsa.pedidos('POST /auth/visitante')[0].corpo).toEqual({
      papel: 'dono',
    });
  });

  it('se a conta de visitante falhar, mostra o erro e continua no início', async () => {
    apiFalsa({
      'GET /demo': { corpo: { demo: true, negocio: 'navalha' } },
      'POST /auth/visitante': {
        status: 429,
        corpo: { message: 'Muitos visitantes' },
      },
    });
    const usuario = userEvent.setup();
    renderComLocal(<Inicio />);
    await usuario.click(
      await screen.findByRole('button', { name: 'Ver o painel do dono' }),
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('local')).toHaveTextContent(/^\/$/);
    expect(
      screen.getByRole('button', { name: 'Ver o painel do dono' }),
    ).toBeEnabled();
  });

  it('fora da demonstração, explica o link e vai ao endereço digitado', async () => {
    apiFalsa({ 'GET /demo': { corpo: { demo: false, negocio: null } } });
    const usuario = userEvent.setup();
    renderComLocal(<Inicio />);
    const campo = await screen.findByLabelText('Endereço do estabelecimento');
    expect(screen.getByText(/próprio link de reservas/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Crie a agenda dele' }),
    ).toHaveAttribute('href', '/cadastro');

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
