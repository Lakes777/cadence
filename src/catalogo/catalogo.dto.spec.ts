import {
  esquemaHorarios,
  esquemaMudancaServico,
  esquemaNovoBloqueio,
  esquemaNovoNegocio,
  esquemaNovoServico,
  esquemaPeriodo,
  esquemaServicosDoProfissional,
} from './catalogo.dto.js';

function campos(resultado: { error?: { issues: { path: PropertyKey[] }[] } }) {
  return resultado.error?.issues.map((p) => p.path.join('.'));
}

describe('esquemaNovoNegocio', () => {
  it('usa o fuso de São Paulo por padrão e normaliza o slug', () => {
    expect(
      esquemaNovoNegocio.parse({
        nome: ' Barbearia ',
        slug: ' Barbearia-Exemplo ',
      }),
    ).toEqual({
      nome: 'Barbearia',
      slug: 'barbearia-exemplo',
      fuso: 'America/Sao_Paulo',
    });
  });

  it('grava o fuso com o nome canônico, não como foi digitado', () => {
    expect(
      esquemaNovoNegocio.parse({ nome: 'X', fuso: ' america/sao_paulo ' }).fuso,
    ).toBe('America/Sao_Paulo');
  });

  it.each([
    ['slug com espaço', { slug: 'barbearia exemplo' }, 'slug'],
    ['slug com hífen no fim', { slug: 'barbearia-' }, 'slug'],
    ['fuso inventado', { fuso: 'Brasil/Sampa' }, 'fuso'],
  ])('recusa %s', (_caso, mudanca, campo) => {
    expect(
      campos(esquemaNovoNegocio.safeParse({ nome: 'X', ...mudanca })),
    ).toEqual([campo]);
  });
});

describe('serviços', () => {
  const valido = { nome: 'Corte', duracaoMin: 30, precoCentavos: 3500 };

  it('aceita preço zero (serviço de cortesia)', () => {
    expect(
      esquemaNovoServico.safeParse({ ...valido, precoCentavos: 0 }).success,
    ).toBe(true);
  });

  it.each([
    ['duração fora dos múltiplos de 5', { duracaoMin: 32 }],
    ['duração curta', { duracaoMin: 0 }],
    ['duração de mais de 8 h', { duracaoMin: 485 }],
    ['preço com centavos quebrados', { precoCentavos: 35.5 }],
    ['preço negativo', { precoCentavos: -1 }],
    ['preço como texto', { precoCentavos: '35' }],
  ])('recusa %s', (_caso, mudanca) => {
    expect(
      esquemaNovoServico.safeParse({ ...valido, ...mudanca }).success,
    ).toBe(false);
  });

  it('PATCH vazio é recusado', () => {
    expect(esquemaMudancaServico.safeParse({}).success).toBe(false);
    expect(esquemaMudancaServico.parse({ ativo: false })).toEqual({
      ativo: false,
    });
  });

  it('tira ids repetidos da lista de serviços do profissional', () => {
    const id = '0199d4a2-7a10-7000-8000-000000000001';
    expect(
      esquemaServicosDoProfissional.parse({ servicoIds: [id, id] }),
    ).toEqual({
      servicoIds: [id],
    });
  });
});

describe('esquemaHorarios', () => {
  it('converte HH:MM em minutos e aceita 24:00 como fim', () => {
    expect(
      esquemaHorarios.parse({
        horarios: [{ diaDaSemana: 6, inicio: '18:00', fim: '24:00' }],
      }),
    ).toEqual({
      horarios: [{ diaDaSemana: 6, inicioMin: 1080, fimMin: 1440 }],
    });
  });

  it('aceita lista vazia (o profissional não atende nenhum dia)', () => {
    expect(esquemaHorarios.parse({ horarios: [] })).toEqual({ horarios: [] });
  });

  it('recusa fim antes do início', () => {
    const resultado = esquemaHorarios.safeParse({
      horarios: [{ diaDaSemana: 1, inicio: '12:00', fim: '09:00' }],
    });
    expect(campos(resultado)).toEqual(['horarios.0']);
  });

  it('aponta o intervalo que se sobrepõe', () => {
    const resultado = esquemaHorarios.safeParse({
      horarios: [
        { diaDaSemana: 1, inicio: '09:00', fim: '12:00' },
        { diaDaSemana: 2, inicio: '09:00', fim: '12:00' },
        { diaDaSemana: 1, inicio: '11:00', fim: '13:00' },
      ],
    });
    expect(campos(resultado)).toEqual(['horarios.2']);
    expect(resultado.error?.issues[0].message).toBe(
      'Este intervalo se sobrepõe ao da posição 0',
    );
  });

  it.each([
    ['dia 7', { diaDaSemana: 7 }],
    ['hora sem zero', { inicio: '9:00' }],
    ['dia como texto', { diaDaSemana: 'segunda' }],
  ])('recusa %s', (_caso, mudanca) => {
    expect(
      esquemaHorarios.safeParse({
        horarios: [
          { diaDaSemana: 1, inicio: '09:00', fim: '12:00', ...mudanca },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('esquemaNovoBloqueio', () => {
  const natal = {
    inicio: '2026-12-25T00:00:00-03:00',
    fim: '2026-12-26T00:00:00-03:00',
  };

  it('converte para instantes (UTC)', () => {
    const dados = esquemaNovoBloqueio.parse({ ...natal, motivo: ' Natal ' });
    expect(dados.inicio.toISOString()).toBe('2026-12-25T03:00:00.000Z');
    expect(dados.motivo).toBe('Natal');
  });

  it.each([
    ['sem fuso (ambíguo)', { inicio: '2026-12-25T00:00:00' }, 'inicio'],
    ['fim antes do início', { fim: '2026-12-24T00:00:00-03:00' }, 'fim'],
    ['mais de um ano', { fim: '2028-01-01T00:00:00-03:00' }, 'fim'],
    [
      'profissional com id inválido',
      { profissionalId: 'abc' },
      'profissionalId',
    ],
  ])('recusa %s', (_caso, mudanca, campo) => {
    expect(
      campos(esquemaNovoBloqueio.safeParse({ ...natal, ...mudanca })),
    ).toEqual([campo]);
  });

  it('período de no máximo um ano', () => {
    expect(
      esquemaPeriodo.safeParse({
        de: '2026-01-01T00:00:00Z',
        ate: '2027-01-03T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('período: "ate" precisa ser depois de "de"', () => {
    expect(
      esquemaPeriodo.safeParse({ de: natal.fim, ate: natal.inicio }).success,
    ).toBe(false);
    expect(esquemaPeriodo.parse({})).toEqual({});
  });
});
