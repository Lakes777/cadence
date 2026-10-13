import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFalsa } from '../teste/api-falsa';
import { abrirPainel, NEGOCIO } from './fixtures';

// Telas inteiras com userEvent: com a suíte toda em paralelo, 5 s (o padrão) fica justo
vi.setConfig({ testTimeout: 15_000 });

describe('meus negócios', () => {
  it('sem nenhum: convida a criar o primeiro', async () => {
    apiFalsa({ 'GET /negocios': { corpo: [] } });
    abrirPainel('/painel');
    expect(
      await screen.findByRole('heading', { name: 'Comece pelo seu negócio' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar negócio' })).toBeEnabled();
  });

  it('lista os negócios com o endereço e o fuso', async () => {
    apiFalsa({ 'GET /negocios': { corpo: [NEGOCIO] } });
    abrirPainel('/painel');
    const link = await screen.findByRole('link', { name: 'Barbearia Exemplo' });
    expect(link).toHaveAttribute('href', '/painel/n1');
    expect(
      screen.getByText('/b/barbearia · America/Sao_Paulo'),
    ).toBeInTheDocument();
  });

  it('criar: mostra o erro de cada campo e, depois de dar certo, abre o negócio', async () => {
    const user = userEvent.setup();
    let tentativa = 0;
    const falsa = apiFalsa({
      'GET /negocios': { corpo: [] },
      'POST /negocios': () => {
        tentativa++;
        if (tentativa === 1) {
          return {
            status: 400,
            corpo: {
              message: 'Dados inválidos',
              erros: [{ campo: 'nome', mensagem: 'Informe o nome' }],
            },
          };
        }
        if (tentativa === 2) {
          // Endereço repetido: o servidor manda só a mensagem, sem o campo
          return {
            status: 409,
            corpo: { message: 'Este endereço já está em uso; escolha outro' },
          };
        }
        return {
          status: 201,
          corpo: { ...NEGOCIO, id: 'n9', fuso: 'Europe/Lisbon' },
        };
      },
      'GET /negocios/:id/agenda': { corpo: [] },
      'GET /negocios/:id/profissionais': { corpo: [] },
    });
    abrirPainel('/painel');

    await user.click(
      await screen.findByRole('button', { name: 'Criar negócio' }),
    );
    const nome = screen.getByRole('textbox', { name: /^Nome do negócio/ });
    expect(await screen.findByText('Informe o nome')).toBeInTheDocument();
    expect(nome).toHaveAttribute('aria-invalid', 'true');
    expect(nome).toHaveAccessibleDescription('Informe o nome');

    await user.type(nome, 'Barbearia Exemplo');
    await user.type(
      screen.getByRole('textbox', { name: /^Endereço \(opcional\)/ }),
      'barbearia',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Fuso horário' }),
      'Europe/Lisbon',
    );
    await user.click(screen.getByRole('button', { name: 'Criar negócio' }));
    const endereco = screen.getByRole('textbox', {
      name: /^Endereço \(opcional\)/,
    });
    expect(endereco).toHaveAccessibleDescription(
      'Este endereço já está em uso; escolha outro',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.clear(endereco);
    await user.type(endereco, 'barbearia-2');
    await user.click(screen.getByRole('button', { name: 'Criar negócio' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Barbearia Exemplo',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(falsa.pedidos('POST /negocios').at(-1)?.corpo).toEqual({
      nome: 'Barbearia Exemplo',
      slug: 'barbearia-2',
      fuso: 'Europe/Lisbon',
    });
    // A agenda já abre (e a navegação interna marca onde estou)
    const nav = screen.getByRole('navigation', { name: 'Seções do negócio' });
    expect(within(nav).getByRole('link', { name: 'Agenda' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('fuso fora da lista: "Outro" pede o nome IANA', async () => {
    const user = userEvent.setup();
    const falsa = apiFalsa({
      'GET /negocios': { corpo: [] },
      'POST /negocios': {
        status: 400,
        corpo: {
          message: 'Dados inválidos',
          erros: [{ campo: 'fuso', mensagem: 'Fuso desconhecido' }],
        },
      },
    });
    abrirPainel('/painel');
    await user.type(
      await screen.findByRole('textbox', { name: /^Nome do negócio/ }),
      'Estúdio',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Fuso horário' }),
      'outro',
    );
    const outro = screen.getByRole('textbox', { name: 'Nome do fuso (IANA)' });
    await user.type(outro, 'Europe/Madri');
    await user.click(screen.getByRole('button', { name: 'Criar negócio' }));
    expect(await screen.findByText('Fuso desconhecido')).toBeInTheDocument();
    expect(outro).toHaveAttribute('aria-invalid', 'true');
    expect(falsa.pedidos('POST /negocios')[0].corpo).toEqual({
      nome: 'Estúdio',
      fuso: 'Europe/Madri',
    });
  });

  it('na demonstração, avisa que as mudanças voltam ao original', async () => {
    apiFalsa({
      'GET /negocios': { corpo: [NEGOCIO] },
      'GET /demo': { corpo: { demo: true, negocio: 'barbearia' } },
    });
    abrirPainel('/painel');
    expect(
      await screen.findByText(
        'Você está no painel de exemplo: as mudanças voltam ao original a cada hora.',
      ),
    ).toBeInTheDocument();
  });

  it('negócio de outro dono (ou que não existe): explica e oferece voltar', async () => {
    apiFalsa({ 'GET /negocios': { corpo: [NEGOCIO] } });
    abrirPainel('/painel/outro');
    expect(
      await screen.findByRole('heading', { name: 'Negócio não encontrado' }),
    ).toBeInTheDocument();
  });

  it('erro ao buscar: mostra e deixa tentar de novo', async () => {
    const user = userEvent.setup();
    let falhar = true;
    apiFalsa({
      'GET /negocios': () => (falhar ? { status: 500 } : { corpo: [NEGOCIO] }),
    });
    abrirPainel('/painel');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Algo deu errado',
    );
    falhar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByRole('link', { name: 'Barbearia Exemplo' }),
    ).toBeInTheDocument();
  });
});
