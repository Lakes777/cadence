import { dataLocal, diaDaSemana } from '../disponibilidade/fuso.js';
import { ehDaDemo, emailDeVisitante } from './demo.js';
import {
  apelido,
  bloqueioDeExemplo,
  DIAS_DE_RESERVAS,
  PROFISSIONAIS,
  reservasDeExemplo,
  SERVICOS,
} from './exemplo.js';

const FUSO = 'America/Sao_Paulo';
/** Segunda-feira, 12/10/2026, 10:20 em São Paulo (no meio do expediente) */
const AGORA = new Date('2026-10-12T10:20:00-03:00');

function minutosLocais(instante: Date): number {
  const [hora, minuto] = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(instante)
    .split(':')
    .map(Number);
  return hora * 60 + minuto;
}

describe('reservasDeExemplo', () => {
  const bloqueio = bloqueioDeExemplo(AGORA, FUSO);
  const reservas = reservasDeExemplo(AGORA, FUSO, bloqueio);

  it('ocupa uma parte da grade, nos próximos 7 dias, sempre depois de agora', () => {
    expect(reservas.length).toBeGreaterThan(30);
    const limite = AGORA.getTime() + DIAS_DE_RESERVAS * 24 * 60 * 60_000;
    for (const r of reservas) {
      expect(r.inicio.getTime()).toBeGreaterThan(AGORA.getTime());
      expect(r.inicio.getTime()).toBeLessThan(limite);
    }
  });

  it('cabe inteira num intervalo do expediente, com um serviço que o profissional faz', () => {
    for (const r of reservas) {
      const p = PROFISSIONAIS.find((x) => x.nome === r.profissional)!;
      const s = SERVICOS.find((x) => x.nome === r.servico)!;
      expect(p.servicos).toContain(r.servico);
      expect(r.fim.getTime() - r.inicio.getTime()).toBe(s.duracaoMin * 60_000);
      const dia = diaDaSemana(dataLocal(r.inicio, FUSO));
      const inicio = minutosLocais(r.inicio);
      expect(
        p.horarios.some(
          (h) =>
            h.diaDaSemana === dia &&
            h.inicioMin <= inicio &&
            inicio + s.duracaoMin <= h.fimMin,
        ),
      ).toBe(true);
      // Na grade de 15 min da disponibilidade
      expect(inicio % 15).toBe(0);
    }
  });

  it('nunca sobrepõe duas do mesmo profissional nem cai no bloqueio', () => {
    for (const p of PROFISSIONAIS) {
      const dele = reservas.filter((r) => r.profissional === p.nome);
      for (let i = 1; i < dele.length; i++) {
        expect(dele[i].inicio.getTime()).toBeGreaterThanOrEqual(
          dele[i - 1].fim.getTime(),
        );
      }
    }
    const noBloqueio = reservas.filter(
      (r) =>
        r.profissional === bloqueio.profissional &&
        r.inicio < bloqueio.fim &&
        r.fim > bloqueio.inicio,
    );
    expect(noBloqueio).toEqual([]);
  });

  it('dá a mesma agenda para o mesmo "agora" (a semeadura é repetível)', () => {
    expect(reservasDeExemplo(AGORA, FUSO, bloqueio)).toEqual(reservas);
  });

  it('um pouco depois, só perde as que já começaram', () => {
    const depois = new Date(AGORA.getTime() + 60 * 60_000);
    const novas = reservasDeExemplo(depois, FUSO, bloqueio);
    expect(novas).toEqual(reservas.filter((r) => r.inicio > depois));
  });
});

describe('bloqueioDeExemplo', () => {
  it('é a tarde do Diego daqui a 3 dias, na hora local', () => {
    const b = bloqueioDeExemplo(AGORA, FUSO);
    expect(b.profissional).toBe('Diego Martins');
    expect(b.inicio.toISOString()).toBe('2026-10-15T17:00:00.000Z');
    expect(b.fim.toISOString()).toBe('2026-10-15T21:00:00.000Z');
  });
});

describe('contas da demonstração', () => {
  it('monta o e-mail a partir do nome, sem acento', () => {
    expect(apelido('Pedro Henrique Lima')).toBe('pedro.henrique.lima');
    expect(apelido('João Antônio')).toBe('joao.antonio');
  });

  it('reconhece só o domínio da demonstração', () => {
    expect(ehDaDemo(emailDeVisitante('abc'))).toBe(true);
    expect(ehDaDemo('Dono@DEMO.cadence.invalid')).toBe(true);
    expect(ehDaDemo('alguem@exemplo.com')).toBe(false);
    // Termina parecido, mas é outro domínio
    expect(ehDaDemo('x@outrodemo.cadence.invalid')).toBe(false);
  });
});
