import { destinoDepoisDeEntrar } from './volta';
import {
  dataNoFuso,
  diaDaSemana,
  formatarDia,
  formatarDinheiro,
  formatarHora,
  somarDias,
} from './formatos';

describe('para onde voltar depois de entrar', () => {
  it('aceita caminho deste site', () => {
    expect(
      destinoDepoisDeEntrar('/b/barbearia?dia=2026-10-19', 'cliente'),
    ).toBe('/b/barbearia?dia=2026-10-19');
  });

  it.each([
    '//golpe.com',
    'https://golpe.com',
    '/\\golpe.com',
    'javascript:alert(1)',
  ])('recusa %s (redirecionamento aberto)', (volta) => {
    expect(destinoDepoisDeEntrar(volta, 'cliente')).toBe('/');
    expect(destinoDepoisDeEntrar(volta, 'dono')).toBe('/painel');
  });
});

describe('formatos', () => {
  it('dinheiro em reais', () => {
    expect(formatarDinheiro(3500)).toBe('R$ 35,00');
  });

  it('hora e data no fuso do negócio, não no do navegador', () => {
    const iso = '2026-10-19T02:30:00.000Z';
    expect(formatarHora(iso, 'America/Sao_Paulo')).toBe('23:30');
    expect(dataNoFuso(iso, 'America/Sao_Paulo')).toBe('2026-10-18');
    expect(dataNoFuso(iso, 'Europe/Lisbon')).toBe('2026-10-19');
  });

  it('dia por extenso e dia da semana', () => {
    expect(formatarDia('2026-10-19')).toBe('segunda, 19 de outubro');
    expect(diaDaSemana('2026-10-19')).toBe(1);
  });

  it('somar dias atravessa o mês', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
  });
});
