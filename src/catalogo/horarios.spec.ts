import {
  acharSobreposicao,
  fusoCanonico,
  paraHora,
  paraMinutos,
} from './horarios.js';

describe('horas e minutos', () => {
  it.each([
    ['00:00', 0],
    ['09:30', 570],
    ['23:59', 1439],
    ['24:00', 1440],
  ])('%s = %i minutos, e volta', (hora, minutos) => {
    expect(paraMinutos(hora)).toBe(minutos);
    expect(paraHora(minutos)).toBe(hora);
  });

  it.each(['9:30', '24:01', '25:00', '12:60', '12h30', ''])(
    'recusa %j',
    (hora) => {
      expect(() => paraMinutos(hora)).toThrow(/hora inválida/);
    },
  );
});

describe('acharSobreposicao', () => {
  const manha = { diaDaSemana: 1, inicioMin: 540, fimMin: 720 };

  it('aceita intervalos que só encostam (09-12 e 12-18)', () => {
    expect(
      acharSobreposicao([
        manha,
        { diaDaSemana: 1, inicioMin: 720, fimMin: 1080 },
      ]),
    ).toBeUndefined();
  });

  it('aceita o mesmo horário em dias diferentes', () => {
    expect(
      acharSobreposicao([manha, { ...manha, diaDaSemana: 2 }]),
    ).toBeUndefined();
  });

  it('acha a sobreposição mesmo fora de ordem e diz as posições', () => {
    expect(
      acharSobreposicao([
        { diaDaSemana: 3, inicioMin: 0, fimMin: 60 },
        { diaDaSemana: 1, inicioMin: 600, fimMin: 900 },
        manha,
      ]),
    ).toEqual([1, 2]);
  });

  it('acha um intervalo dentro do outro', () => {
    expect(
      acharSobreposicao([
        { diaDaSemana: 1, inicioMin: 480, fimMin: 1080 },
        { diaDaSemana: 1, inicioMin: 600, fimMin: 660 },
      ]),
    ).toEqual([0, 1]);
  });
});

describe('fusoCanonico', () => {
  it.each([
    ['America/Sao_Paulo', 'America/Sao_Paulo'],
    ['america/sao_paulo', 'America/Sao_Paulo'],
    ['EUROPE/LISBON', 'Europe/Lisbon'],
    ['UTC', 'UTC'],
    ['utc', 'UTC'],
  ])('%s -> %s', (fuso, esperado) => {
    expect(fusoCanonico(fuso)).toBe(esperado);
  });

  it.each(['Brasil/Sampa', 'GMT-3', '', 'EST'])('recusa %j', (fuso) => {
    expect(fusoCanonico(fuso)).toBeUndefined();
  });
});
