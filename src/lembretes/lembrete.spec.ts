import { momentoDoLembrete, textoDoLembrete } from './lembrete.js';

describe('momentoDoLembrete', () => {
  const inicio = new Date('2026-10-19T12:00:00Z');

  it('marca 24 h antes do início', () => {
    const agora = new Date('2026-10-12T12:00:00Z');
    expect(momentoDoLembrete(inicio, agora)).toEqual(
      new Date('2026-10-18T12:00:00Z'),
    );
  });

  it('não marca nada para quem reserva com menos de 24 h', () => {
    expect(
      momentoDoLembrete(inicio, new Date('2026-10-18T12:30:00Z')),
    ).toBeNull();
  });

  it('não marca nada quando faltam exatamente 24 h (o momento já chegou)', () => {
    expect(
      momentoDoLembrete(inicio, new Date('2026-10-18T12:00:00Z')),
    ).toBeNull();
  });

  it('marca mesmo quando falta só um instante para as 24 h', () => {
    expect(
      momentoDoLembrete(inicio, new Date('2026-10-18T11:59:59.999Z')),
    ).toEqual(new Date('2026-10-18T12:00:00Z'));
  });
});

describe('textoDoLembrete', () => {
  const dados = {
    servico: 'Corte',
    profissional: 'Ana',
    negocio: 'Barbearia Exemplo',
    inicio: new Date('2026-10-19T12:00:00Z'),
  };

  it('mostra a data e a hora no fuso do negócio', () => {
    expect(textoDoLembrete({ ...dados, fuso: 'America/Sao_Paulo' })).toBe(
      'Lembrete: Corte com Ana em Barbearia Exemplo, 19/10 às 09:00',
    );
  });

  it('troca o dia quando o fuso cruza a meia-noite', () => {
    expect(
      textoDoLembrete({
        ...dados,
        inicio: new Date('2026-10-20T01:30:00Z'),
        fuso: 'America/Sao_Paulo',
      }),
    ).toBe('Lembrete: Corte com Ana em Barbearia Exemplo, 19/10 às 22:30');
  });
});
