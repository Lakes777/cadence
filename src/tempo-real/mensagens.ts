import { z } from 'zod';
import { FORMATO_DO_SLUG, TAMANHO_MAXIMO_DO_SLUG } from '../catalogo/slug.js';
import { dataLocal, textoDaData } from '../disponibilidade/fuso.js';
import type { AvisoResposta } from '../lembretes/lembretes.service.js';
import type { ReservaResposta } from '../reservas/respostas.js';

const slug = z
  .string()
  .max(TAMANHO_MAXIMO_DO_SLUG)
  .regex(
    FORMATO_DO_SLUG,
    'negócio inválido (use o slug, ex.: barbearia-do-ze)',
  );

/** O que o navegador pode mandar pelo WebSocket */
const mensagemDoCliente = z.discriminatedUnion('tipo', [
  // O token vai numa mensagem, não na URL: URL fica gravada em log de proxy
  z.object({ tipo: z.literal('entrar'), token: z.string().min(1).max(2000) }),
  z.object({ tipo: z.literal('sair') }),
  z.object({ tipo: z.literal('assinar'), negocio: slug }),
  z.object({ tipo: z.literal('desassinar'), negocio: slug }),
]);

export type MensagemDoCliente = z.infer<typeof mensagemDoCliente>;

/** O que o servidor manda */
export type MensagemDoServidor =
  /** Os horários livres destes dias (datas locais do negócio, inclusive) mudaram: busque de novo */
  | { tipo: 'horarios'; negocio: string; de: string; ate: string }
  /** O dono mudou horário semanal, profissional, serviço ou o negócio: qualquer dia pode ter mudado */
  | {
      tipo: 'catalogo';
      negocio: string;
      /** Quando o dono trocou o endereço: o slug novo (o antigo passa a dar 404) */
      novoEndereco?: string;
    }
  /** Uma reserva sua foi criada (em outra aba) ou cancelada (por você ou pelo estabelecimento) */
  | { tipo: 'reserva'; reserva: ReservaResposta }
  /** Um aviso novo (o lembrete de 24 h antes) */
  | { tipo: 'aviso'; aviso: AvisoResposta }
  | { tipo: 'entrou'; expiraEm: number }
  | { tipo: 'saiu' }
  /** O token venceu: mande `entrar` com um novo para voltar a receber os avisos */
  | { tipo: 'sessaoVencida' }
  | { tipo: 'assinado'; negocio: string }
  | { tipo: 'desassinado'; negocio: string }
  | { tipo: 'erro'; mensagem: string };

/** Lê uma mensagem do navegador; texto que não é JSON ou não segue o formato vira um erro legível */
export function lerMensagem(
  texto: string,
): { ok: true; mensagem: MensagemDoCliente } | { ok: false; erro: string } {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'Mensagem não é JSON' };
  }
  const resultado = mensagemDoCliente.safeParse(dados);
  if (!resultado.success) {
    const problema = resultado.error.issues[0];
    const campo = problema?.path.join('.');
    return {
      ok: false,
      erro:
        campo && campo !== 'tipo'
          ? `${campo}: ${problema?.message}`
          : 'Mensagem inválida: use tipo entrar, sair, assinar ou desassinar',
    };
  }
  return { ok: true, mensagem: resultado.data };
}

/**
 * Os dias (no fuso do negócio) em que os horários livres mudam quando o período
 * [inicio, fim) é ocupado ou liberado: do dia do início ao dia do último instante.
 */
export function diasAfetados(
  inicio: Date,
  fim: Date,
  fuso: string,
): { de: string; ate: string } {
  const ultimo = new Date(Math.max(inicio.getTime(), fim.getTime() - 1));
  return {
    de: textoDaData(dataLocal(inicio, fuso)),
    ate: textoDaData(dataLocal(ultimo, fuso)),
  };
}
