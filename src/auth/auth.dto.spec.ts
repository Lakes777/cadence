import { esquemaDeCadastro, esquemaDeLogin } from './auth.dto.js';

const valido = {
  nome: 'Chris Cornell',
  email: 'chris@exemplo.com',
  senha: 'like-a-stone',
};

describe('esquemaDeCadastro', () => {
  it('normaliza o e-mail e o nome, e o papel padrão é cliente', () => {
    const dados = esquemaDeCadastro.parse({
      ...valido,
      nome: '  Chris Cornell ',
      email: '  Chris@Exemplo.COM ',
    });
    expect(dados).toEqual({ ...valido, papel: 'cliente' });
  });

  it('aceita o papel de dono', () => {
    expect(esquemaDeCadastro.parse({ ...valido, papel: 'dono' }).papel).toBe(
      'dono',
    );
  });

  it.each([
    ['nome vazio', { nome: '   ' }, 'nome'],
    ['nome comprido', { nome: 'a'.repeat(81) }, 'nome'],
    ['e-mail sem arroba', { email: 'chris.exemplo.com' }, 'email'],
    ['senha curta', { senha: '1234567' }, 'senha'],
    ['senha gigante', { senha: 'a'.repeat(129) }, 'senha'],
    ['papel inventado', { papel: 'admin' }, 'papel'],
  ])('recusa %s', (_caso, mudanca, campo) => {
    const resultado = esquemaDeCadastro.safeParse({ ...valido, ...mudanca });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual([campo]);
  });

  it('ignora campos extras (ninguém se cadastra com id escolhido)', () => {
    const dados = esquemaDeCadastro.parse({ ...valido, id: 'meu-id' });
    expect(dados).not.toHaveProperty('id');
  });
});

describe('esquemaDeLogin', () => {
  it('normaliza o e-mail e não mexe na senha', () => {
    expect(
      esquemaDeLogin.parse({ email: ' A@B.com ', senha: ' com espaço ' }),
    ).toEqual({ email: 'a@b.com', senha: ' com espaço ' });
  });

  it('recusa senha vazia', () => {
    expect(
      esquemaDeLogin.safeParse({ email: 'a@b.com', senha: '' }).success,
    ).toBe(false);
  });
});
