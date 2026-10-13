import type { ReactNode, Ref } from 'react';
import type { Reserva } from '../api/tipos';
import {
  dataNoFuso,
  formatarDia,
  formatarDinheiro,
  formatarHora,
} from '../comum/formatos';

/** "30 min", "1 h", "1 h 30 min" */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Uma reserva como cartão de ponto: o negócio e a data em destaque, a hora grande e o resto em
 * letras pequenas. Data e hora no fuso DO NEGÓCIO (quem viaja vê a hora de lá).
 */
export function CartaoDaReserva({
  reserva,
  titulo,
  selo,
  children,
  ref,
}: {
  reserva: Reserva;
  /** Para levar o foco ao cartão depois de uma ação que some com o botão (cancelar, reservar) */
  ref?: Ref<HTMLElement>;
  /** Nível do título (h2 na lista, h1 na confirmação) */
  titulo: 'h1' | 'h2';
  selo?: ReactNode;
  children?: ReactNode;
}) {
  const { fuso } = reserva.negocio;
  const Titulo = titulo;
  const cancelada = reserva.status === 'cancelada';
  return (
    <article
      ref={ref}
      tabIndex={-1}
      className={`cartao cartao-de-ponto${cancelada ? ' cartao-de-ponto--cancelada' : ''}`}
    >
      <header className="cartao-de-ponto__topo">
        <Titulo className="cartao-de-ponto__negocio">
          {reserva.negocio.nome}
        </Titulo>
        <p className="cartao-de-ponto__data">
          {formatarDia(dataNoFuso(reserva.inicio, fuso))}
        </p>
        {selo}
        {cancelada && (
          <span className="carimbo cartao-de-ponto__carimbo" aria-hidden="true">
            Cancelada
          </span>
        )}
      </header>
      <div className="cartao-de-ponto__corpo">
        <p className="cartao-de-ponto__hora">
          {formatarHora(reserva.inicio, fuso)}
          <span className="miudo"> até {formatarHora(reserva.fim, fuso)}</span>
        </p>
        <dl className="ficha">
          <div>
            <dt>Serviço</dt>
            <dd>{reserva.servico.nome}</dd>
          </div>
          <div>
            <dt>Profissional</dt>
            <dd>{reserva.profissional.nome}</dd>
          </div>
          <div>
            <dt>Preço</dt>
            <dd>{formatarDinheiro(reserva.precoCentavos)}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>{cancelada ? 'Cancelada' : 'Confirmada'}</dd>
          </div>
        </dl>
      </div>
      {children}
    </article>
  );
}
