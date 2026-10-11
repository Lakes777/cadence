import {
  dataLocal,
  deslocamento,
  diaDaSemana,
  diasEntre,
  horaLocal,
  lerData,
  localParaUtc,
  localParaUtcOuDepois,
  textoDaData,
} from './fuso.js';

const iso = (d: Date | undefined) => d?.toISOString();

describe('localParaUtc', () => {
  it('São Paulo (UTC-3, sem horário de verão desde 2019)', () => {
    const data = lerData('2026-10-12')!;
    expect(iso(localParaUtc(data, 9 * 60, 'America/Sao_Paulo'))).toBe(
      '2026-10-12T12:00:00.000Z',
    );
    // 24:00 é a meia-noite do dia seguinte
    expect(iso(localParaUtc(data, 1440, 'America/Sao_Paulo'))).toBe(
      '2026-10-13T03:00:00.000Z',
    );
  });

  it('Lisboa no verão (UTC+1) e no inverno (UTC+0)', () => {
    expect(
      iso(localParaUtc(lerData('2026-07-01')!, 600, 'Europe/Lisbon')),
    ).toBe('2026-07-01T09:00:00.000Z');
    expect(
      iso(localParaUtc(lerData('2026-12-01')!, 600, 'Europe/Lisbon')),
    ).toBe('2026-12-01T10:00:00.000Z');
  });

  it('hora que não existe (Lisboa, 29/03/2026: 01:00 pula para 02:00) volta undefined', () => {
    const data = lerData('2026-03-29')!;
    expect(localParaUtc(data, 60, 'Europe/Lisbon')).toBeUndefined();
    expect(localParaUtc(data, 90, 'Europe/Lisbon')).toBeUndefined();
    expect(iso(localParaUtc(data, 59, 'Europe/Lisbon'))).toBe(
      '2026-03-29T00:59:00.000Z',
    );
    expect(iso(localParaUtc(data, 120, 'Europe/Lisbon'))).toBe(
      '2026-03-29T01:00:00.000Z',
    );
  });

  it('hora que acontece duas vezes (Lisboa, 25/10/2026: 02:00 volta para 01:00) usa a primeira', () => {
    expect(iso(localParaUtc(lerData('2026-10-25')!, 90, 'Europe/Lisbon'))).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it('Nova York na mudança de março (02:30 não existe)', () => {
    const data = lerData('2026-03-08')!;
    expect(localParaUtc(data, 150, 'America/New_York')).toBeUndefined();
    expect(iso(localParaUtc(data, 180, 'America/New_York'))).toBe(
      '2026-03-08T07:00:00.000Z',
    );
  });

  it('Nova York na mudança de novembro (01:30 acontece duas vezes: vale a primeira, UTC-4)', () => {
    expect(
      iso(localParaUtc(lerData('2026-11-01')!, 90, 'America/New_York')),
    ).toBe('2026-11-01T05:30:00.000Z');
  });

  it('volta para a mesma hora local', () => {
    const instante = localParaUtc(lerData('2026-10-12')!, 570, 'Asia/Kolkata')!;
    expect(horaLocal(instante, 'Asia/Kolkata')).toBe('09:30');
    expect(textoDaData(dataLocal(instante, 'Asia/Kolkata'))).toBe('2026-10-12');
  });
});

describe('datas', () => {
  it.each(['2026-02-30', '2026-13-01', '26-10-12', '2026-10-1', 'hoje'])(
    'recusa %j',
    (texto) => {
      expect(lerData(texto)).toBeUndefined();
    },
  );

  it('dia da semana e distância em dias', () => {
    expect(diaDaSemana(lerData('2026-10-11')!)).toBe(0); // domingo
    expect(diaDaSemana(lerData('2026-10-17')!)).toBe(6); // sábado
    expect(diasEntre(lerData('2026-10-11')!, lerData('2026-12-10')!)).toBe(60);
    expect(diasEntre(lerData('2026-10-11')!, lerData('2026-10-10')!)).toBe(-1);
  });

  it('a data local depende do fuso (23h em São Paulo já é amanhã em UTC)', () => {
    const instante = new Date('2026-10-13T02:00:00Z');
    expect(textoDaData(dataLocal(instante, 'America/Sao_Paulo'))).toBe(
      '2026-10-12',
    );
    expect(textoDaData(dataLocal(instante, 'UTC'))).toBe('2026-10-13');
  });

  it('deslocamento de São Paulo é -3 h', () => {
    expect(deslocamento(Date.UTC(2026, 9, 12), 'America/Sao_Paulo')).toBe(
      -3 * 3600_000,
    );
  });
});

describe('localParaUtcOuDepois', () => {
  it('hora que existe: igual a localParaUtc', () => {
    expect(
      iso(
        localParaUtcOuDepois(lerData('2026-10-12')!, 540, 'America/Sao_Paulo'),
      ),
    ).toBe('2026-10-12T12:00:00.000Z');
  });

  it('hora que não existe vira o instante do pulo (Nova York, 02:30 -> 03:00 EDT)', () => {
    expect(
      iso(
        localParaUtcOuDepois(lerData('2026-03-08')!, 150, 'America/New_York'),
      ),
    ).toBe('2026-03-08T07:00:00.000Z');
  });

  it('meia-noite que não existe (Santiago, 06/09/2026: 00:00 pula para 01:00)', () => {
    expect(
      localParaUtc(lerData('2026-09-06')!, 0, 'America/Santiago'),
    ).toBeUndefined();
    expect(
      iso(localParaUtcOuDepois(lerData('2026-09-06')!, 0, 'America/Santiago')),
    ).toBe('2026-09-06T04:00:00.000Z');
  });
});
