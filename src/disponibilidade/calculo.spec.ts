import { calcularDia, calcularHorarios, type Entrada } from './calculo.js';
import { lerData } from './fuso.js';

const SP = 'America/Sao_Paulo';
/** "09:00" de 12/10/2026 em São Paulo, como instante */
const em = (hora: string, data = '2026-10-12') =>
  new Date(`${data}T${hora}:00-03:00`);

function entrada(mudanca: Partial<Entrada> = {}): Entrada {
  return {
    data: lerData('2026-10-12')!,
    fuso: SP,
    duracaoMin: 30,
    profissionais: [
      { id: 'ana', intervalos: [{ inicioMin: 540, fimMin: 660 }] },
    ], // 09-11
    bloqueios: [],
    ocupados: [],
    aPartirDe: em('00:00'),
    ...mudanca,
  };
}

const horas = (e: Entrada) => calcularHorarios(e).map((h) => h.hora);

describe('calcularHorarios', () => {
  it('oferece a cada 15 min, e o último cabe inteiro no expediente', () => {
    expect(horas(entrada())).toEqual([
      '09:00',
      '09:15',
      '09:30',
      '09:45',
      '10:00',
      '10:15',
      '10:30',
    ]);
    const [primeiro] = calcularHorarios(entrada());
    expect(primeiro.inicio.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    expect(primeiro.fim.toISOString()).toBe('2026-10-12T12:30:00.000Z');
  });

  it('serviço maior que o expediente não tem horário', () => {
    expect(horas(entrada({ duracaoMin: 125 }))).toEqual([]);
  });

  it('respeita o intervalo de almoço (dois intervalos no dia)', () => {
    const e = entrada({
      duracaoMin: 60,
      profissionais: [
        {
          id: 'ana',
          intervalos: [
            { inicioMin: 540, fimMin: 720 }, // 09-12
            { inicioMin: 780, fimMin: 840 }, // 13-14
          ],
        },
      ],
    });
    expect(horas(e)).toEqual([
      '09:00',
      '09:15',
      '09:30',
      '09:45',
      '10:00',
      '10:15',
      '10:30',
      '10:45',
      '11:00',
      '13:00',
    ]);
  });

  it('junta os profissionais que podem atender no mesmo horário', () => {
    const e = entrada({
      duracaoMin: 60,
      profissionais: [
        { id: 'ana', intervalos: [{ inicioMin: 540, fimMin: 660 }] }, // 09-11
        { id: 'bia', intervalos: [{ inicioMin: 600, fimMin: 720 }] }, // 10-12
      ],
    });
    expect(
      calcularHorarios(e).map((h) => [h.hora, h.profissionalIds.join('+')]),
    ).toEqual([
      ['09:00', 'ana'],
      ['09:15', 'ana'],
      ['09:30', 'ana'],
      ['09:45', 'ana'],
      ['10:00', 'ana+bia'],
      ['10:15', 'bia'],
      ['10:30', 'bia'],
      ['10:45', 'bia'],
      ['11:00', 'bia'],
    ]);
  });

  it('bloqueio do profissional tira só os horários que ele toca (encostar pode)', () => {
    const e = entrada({
      bloqueios: [
        { profissionalId: 'ana', inicio: em('09:30'), fim: em('10:00') },
      ],
    });
    expect(horas(e)).toEqual(['09:00', '10:00', '10:15', '10:30']);
  });

  it('bloqueio do negócio todo vale para todos; o de outro profissional não', () => {
    expect(
      horas(
        entrada({
          bloqueios: [
            { profissionalId: null, inicio: em('00:00'), fim: em('10:00') },
          ],
        }),
      ),
    ).toEqual(['10:00', '10:15', '10:30']);
    expect(
      horas(
        entrada({
          bloqueios: [
            { profissionalId: 'bia', inicio: em('00:00'), fim: em('23:00') },
          ],
        }),
      ),
    ).toHaveLength(7);
  });

  it('bloqueio que começa no dia anterior e termina no meio da manhã', () => {
    const e = entrada({
      bloqueios: [
        {
          profissionalId: null,
          inicio: em('20:00', '2026-10-11'),
          fim: em('09:40'),
        },
      ],
    });
    expect(horas(e)[0]).toBe('09:45');
  });

  it('reserva existente ocupa o profissional', () => {
    const e = entrada({
      ocupados: [
        { profissionalId: 'ana', inicio: em('09:00'), fim: em('09:30') },
      ],
    });
    expect(horas(e)[0]).toBe('09:30');
  });

  it('não oferece o que já passou (nem o que começa antes da antecedência)', () => {
    expect(horas(entrada({ aPartirDe: em('10:05') }))).toEqual([
      '10:15',
      '10:30',
    ]);
    expect(horas(entrada({ aPartirDe: em('10:15') }))).toEqual([
      '10:15',
      '10:30',
    ]);
    expect(horas(entrada({ aPartirDe: em('12:00') }))).toEqual([]);
  });

  it('expediente até 24:00', () => {
    const e = entrada({
      profissionais: [
        { id: 'ana', intervalos: [{ inicioMin: 1380, fimMin: 1440 }] },
      ],
    });
    const lista = calcularHorarios(e);
    expect(lista.map((h) => h.hora)).toEqual(['23:00', '23:15', '23:30']);
    expect(lista.at(-1)!.fim.toISOString()).toBe('2026-10-13T03:00:00.000Z');
  });

  it('dia sem expediente não tem horário', () => {
    expect(
      horas(entrada({ profissionais: [{ id: 'ana', intervalos: [] }] })),
    ).toEqual([]);
    expect(horas(entrada({ profissionais: [] }))).toEqual([]);
  });

  describe('horário de verão (Lisboa)', () => {
    const lisboa = (
      data: string,
      inicioMin: number,
      fimMin: number,
      duracaoMin = 60,
    ) =>
      entrada({
        data: lerData(data)!,
        fuso: 'Europe/Lisbon',
        duracaoMin,
        aPartirDe: new Date('2026-01-01T00:00:00Z'),
        profissionais: [{ id: 'ana', intervalos: [{ inicioMin, fimMin }] }],
      });

    it('no dia em que o relógio pula (29/03), a hora que não existe some', () => {
      // Expediente 00:00-03:00 local; 01:00-02:00 não existe
      const lista = calcularHorarios(lisboa('2026-03-29', 0, 180, 30));
      expect(lista.map((h) => h.hora)).toEqual([
        '00:00',
        '00:15',
        '00:30',
        // 00:45 + 30 min reais = 02:15 local: passa do fim? não, o fim é 03:00
        '00:45',
        '02:00',
        '02:15',
        '02:30',
      ]);
      // Duração real: sempre 30 min
      for (const h of lista)
        expect(h.fim.getTime() - h.inicio.getTime()).toBe(30 * 60_000);
    });

    it('no dia em que o relógio volta (25/10), o expediente tem uma hora a mais de verdade', () => {
      // 00:00-03:00 local dura 4 h reais; a hora repetida aparece uma vez (a primeira)
      const lista = calcularHorarios(lisboa('2026-10-25', 0, 180, 60));
      expect(lista.map((h) => h.inicio.toISOString())).toEqual([
        '2026-10-24T23:00:00.000Z', // 00:00 (UTC+1)
        '2026-10-24T23:15:00.000Z',
        '2026-10-24T23:30:00.000Z',
        '2026-10-24T23:45:00.000Z',
        '2026-10-25T00:00:00.000Z', // 01:00, primeira vez
        '2026-10-25T00:15:00.000Z',
        '2026-10-25T00:30:00.000Z',
        '2026-10-25T00:45:00.000Z',
        '2026-10-25T02:00:00.000Z', // 02:00 (UTC+0)
      ]);
    });

    it('no dia em que o relógio volta, serviço longo usa a hora a mais de verdade', () => {
      // 00:00-03:00 local são 4 h reais; um serviço de 2 h pode começar até 01:45 (primeira vez)
      const lista = calcularHorarios(lisboa('2026-10-25', 0, 180, 120));
      expect(lista.map((h) => h.inicio.toISOString()).at(-1)).toBe(
        '2026-10-25T00:45:00.000Z',
      );
      expect(lista).toHaveLength(8);
    });
  });

  describe('horário de verão (Nova York)', () => {
    it('expediente que termina na hora que não existe acaba no pulo', () => {
      // 08/03/2026: 02:00 pula para 03:00; expediente "até 02:30" acaba às 07:00Z
      const lista = calcularHorarios(
        entrada({
          data: lerData('2026-03-08')!,
          fuso: 'America/New_York',
          duracaoMin: 90,
          aPartirDe: new Date('2026-01-01T00:00:00Z'),
          profissionais: [
            { id: 'ana', intervalos: [{ inicioMin: 0, fimMin: 150 }] },
          ],
        }),
      );
      expect(lista.map((h) => h.hora)).toEqual(['00:00', '00:15', '00:30']);
      expect(lista.at(-1)!.fim.toISOString()).toBe('2026-03-08T07:00:00.000Z');
    });
  });
});

describe('calcularDia (livres e ocupados)', () => {
  const doisProfissionais = {
    profissionais: [
      { id: 'ana', intervalos: [{ inicioMin: 540, fimMin: 600 }] }, // 09-10
      { id: 'bia', intervalos: [{ inicioMin: 540, fimMin: 600 }] }, // 09-10
    ],
  };
  const reservaDe = (profissionalId: string, de: string, ate: string) => ({
    profissionalId,
    inicio: em(de),
    fim: em(ate),
  });

  it('sem reservas não há ocupados', () => {
    const { livres, ocupados } = calcularDia(entrada());
    expect(livres).toHaveLength(7);
    expect(ocupados).toEqual([]);
  });

  it('o horário tomado por uma reserva vira ocupado, sem dizer quem atende', () => {
    const { livres, ocupados } = calcularDia(
      entrada({ ocupados: [reservaDe('ana', '09:30', '10:00')] }),
    );
    // 09:15 (até 09:45), 09:30 e 09:45 (começa antes de 10:00) encostam na reserva
    expect(ocupados.map((h) => h.hora)).toEqual(['09:15', '09:30', '09:45']);
    expect(ocupados[1]).toEqual({
      inicio: em('09:30'),
      fim: em('10:00'),
      hora: '09:30',
    });
    expect(livres.map((h) => h.hora)).toEqual([
      '09:00',
      '10:00',
      '10:15',
      '10:30',
    ]);
  });

  it('com dois profissionais, só é ocupado quando nenhum dos dois pode', () => {
    const umaSo = calcularDia(
      entrada({
        ...doisProfissionais,
        ocupados: [reservaDe('ana', '09:00', '09:30')],
      }),
    );
    expect(umaSo.ocupados).toEqual([]);
    expect(
      umaSo.livres.find((h) => h.hora === '09:00')?.profissionalIds,
    ).toEqual(['bia']);

    const asDuas = calcularDia(
      entrada({
        ...doisProfissionais,
        ocupados: [
          reservaDe('ana', '09:00', '09:30'),
          reservaDe('bia', '09:00', '09:30'),
        ],
      }),
    );
    expect(asDuas.ocupados.map((h) => h.hora)).toEqual(['09:00', '09:15']);
  });

  it('bloqueio não vira ocupado: o horário só deixa de aparecer', () => {
    const { livres, ocupados } = calcularDia(
      entrada({
        bloqueios: [
          { profissionalId: null, inicio: em('09:00'), fim: em('10:00') },
        ],
        ocupados: [reservaDe('ana', '10:00', '10:30')],
      }),
    );
    expect(ocupados.map((h) => h.hora)).toEqual(['10:00', '10:15']);
    expect(livres.map((h) => h.hora)).toEqual(['10:30']);
  });

  it('o que começa cedo demais não aparece em nenhuma das listas', () => {
    const { livres, ocupados } = calcularDia(
      entrada({
        aPartirDe: em('10:00'),
        ocupados: [reservaDe('ana', '09:00', '10:30')],
      }),
    );
    expect(ocupados.map((h) => h.hora)).toEqual(['10:00', '10:15']);
    expect(livres.map((h) => h.hora)).toEqual(['10:30']);
  });
});
