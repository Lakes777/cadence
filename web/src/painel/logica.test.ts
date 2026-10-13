import { centavosParaReais, reaisParaCentavos } from './dinheiro';
import { inicioDoDia, localParaIso, partesLocais } from './fuso';
import {
  copiarParaDiasUteis,
  errosPorIntervalo,
  listaDa,
  semanaDe,
} from './semana';

describe('data e hora no fuso do negócio -> instante', () => {
  it('São Paulo (UTC-3, sem horário de verão)', () => {
    expect(localParaIso('2026-10-19', '09:00', 'America/Sao_Paulo')).toBe(
      '2026-10-19T12:00:00.000Z',
    );
    // Perto da meia-noite: o instante já é do dia seguinte em UTC
    expect(localParaIso('2026-10-19', '23:30', 'America/Sao_Paulo')).toBe(
      '2026-10-20T02:30:00.000Z',
    );
    expect(localParaIso('2026-10-19', '24:00', 'America/Sao_Paulo')).toBe(
      '2026-10-20T03:00:00.000Z',
    );
  });

  it('Lisboa no verão (+1) e no inverno (+0)', () => {
    expect(localParaIso('2026-07-15', '09:00', 'Europe/Lisbon')).toBe(
      '2026-07-15T08:00:00.000Z',
    );
    expect(localParaIso('2026-12-15', '09:00', 'Europe/Lisbon')).toBe(
      '2026-12-15T09:00:00.000Z',
    );
  });

  it('Lisboa, 29/03/2026: 01:00 pula para 02:00, e 01:30 não existe', () => {
    expect(
      localParaIso('2026-03-29', '01:30', 'Europe/Lisbon'),
    ).toBeUndefined();
    expect(localParaIso('2026-03-29', '00:59', 'Europe/Lisbon')).toBe(
      '2026-03-29T00:59:00.000Z',
    );
    expect(localParaIso('2026-03-29', '02:00', 'Europe/Lisbon')).toBe(
      '2026-03-29T01:00:00.000Z',
    );
  });

  it('Lisboa, 25/10/2026: 01:30 acontece duas vezes, vale a primeira', () => {
    expect(localParaIso('2026-10-25', '01:30', 'Europe/Lisbon')).toBe(
      '2026-10-25T00:30:00.000Z',
    );
    expect(localParaIso('2026-10-25', '03:00', 'Europe/Lisbon')).toBe(
      '2026-10-25T03:00:00.000Z',
    );
  });

  it('recusa data e hora que não existem no calendário', () => {
    expect(
      localParaIso('2026-02-30', '09:00', 'Europe/Lisbon'),
    ).toBeUndefined();
    expect(
      localParaIso('2026-10-19', '25:00', 'Europe/Lisbon'),
    ).toBeUndefined();
    expect(localParaIso('', '09:00', 'Europe/Lisbon')).toBeUndefined();
  });

  it('o dia começa no pulo onde a meia-noite não existe (Santiago, 06/09/2026)', () => {
    expect(inicioDoDia('2026-09-06', 'America/Santiago').toISOString()).toBe(
      '2026-09-06T04:00:00.000Z',
    );
    expect(inicioDoDia('2026-10-19', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-19T03:00:00.000Z',
    );
  });

  it('e de volta: o relógio do negócio naquele instante', () => {
    expect(
      partesLocais('2026-10-20T02:30:00.000Z', 'America/Sao_Paulo'),
    ).toEqual({ data: '2026-10-19', hora: '23:30' });
    expect(partesLocais('2026-10-20T02:30:00.000Z', 'Europe/Lisbon')).toEqual({
      data: '2026-10-20',
      hora: '03:30',
    });
  });
});

describe('preço em reais -> centavos', () => {
  it.each([
    ['35,00', 3500],
    ['35', 3500],
    ['35,9', 3590],
    ['35.90', 3590],
    ['0,29', 29],
    ['1,10', 110],
    ['R$ 1.234,56', 123456],
    ['1234,56', 123456],
    [' 19,99 ', 1999],
  ])('%s = %i centavos', (texto, centavos) => {
    expect(reaisParaCentavos(texto)).toBe(centavos);
  });

  it.each(['', 'abc', '35,999', '-5', '35,', '1.23,00'])(
    'recusa "%s"',
    (texto) => {
      expect(reaisParaCentavos(texto)).toBeUndefined();
    },
  );

  it('volta para o campo como 35,00', () => {
    expect(centavosParaReais(3500)).toBe('35,00');
    expect(centavosParaReais(29)).toBe('0,29');
  });
});

describe('horário semanal no editor', () => {
  it('monta a lista do PUT na ordem dos dias e lembra de onde veio cada item', () => {
    const semana = semanaDe([
      { diaDaSemana: 3, inicio: '13:00', fim: '18:00' },
      { diaDaSemana: 1, inicio: '09:00', fim: '12:00' },
      { diaDaSemana: 3, inicio: '08:00', fim: '12:00' },
    ]);
    expect(semana[3]).toEqual([
      { inicio: '08:00', fim: '12:00' },
      { inicio: '13:00', fim: '18:00' },
    ]);
    const { horarios, origem } = listaDa(semana);
    expect(horarios.map((h) => h.diaDaSemana)).toEqual([1, 3, 3]);
    expect(origem[2]).toEqual({ dia: 3, posicao: 1 });
  });

  it('copia um dia para os outros dias úteis, sem mexer no fim de semana', () => {
    const semana = semanaDe([
      { diaDaSemana: 2, inicio: '10:00', fim: '14:00' },
      { diaDaSemana: 6, inicio: '08:00', fim: '12:00' },
    ]);
    const copiada = copiarParaDiasUteis(semana, 2);
    for (const dia of [1, 2, 3, 4, 5]) {
      expect(copiada[dia]).toEqual([{ inicio: '10:00', fim: '14:00' }]);
    }
    expect(copiada[6]).toEqual([{ inicio: '08:00', fim: '12:00' }]);
    expect(copiada[0]).toEqual([]);
  });

  it('prende o erro do servidor ao intervalo e troca "posição N" pelo nome do dia', () => {
    const { origem } = listaDa(
      semanaDe([
        { diaDaSemana: 1, inicio: '09:00', fim: '12:00' },
        { diaDaSemana: 1, inicio: '11:00', fim: '14:00' },
      ]),
    );
    const { porIntervalo, geral } = errosPorIntervalo(
      [
        {
          campo: 'horarios.1',
          mensagem: 'Este intervalo se sobrepõe ao da posição 0',
        },
        { campo: 'horarios', mensagem: 'Intervalos demais' },
      ],
      origem,
    );
    expect(porIntervalo.get('1-1')).toBe(
      'Este intervalo se sobrepõe ao 1º intervalo de segunda',
    );
    expect(geral).toEqual(['Intervalos demais']);
  });
});
