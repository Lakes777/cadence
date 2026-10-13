import type { CSSProperties } from 'react';

/** As linhas do cartão: a 09:30 é a que recebe o carimbo na animação */
const LINHAS = [
  { hora: '09:00', estado: 'livre' },
  { hora: '09:30', estado: 'reservado' },
  { hora: '10:00', estado: 'ocupado' },
  { hora: '10:30', estado: 'livre' },
  { hora: '11:00', estado: 'livre' },
] as const;

/**
 * A peça da tela de início: um cartão de ponto que vai sendo "perfurado" linha por linha e
 * termina com o carimbo RESERVADO caindo num horário. Só enfeite (aria-hidden); o texto ao
 * lado diz o mesmo. Com prefers-reduced-motion, aparece pronto.
 */
export function CartaoDoInicio() {
  return (
    <div className="cartao-inicio" aria-hidden="true">
      <div className="cartao-inicio__topo">
        <span>Cartão de ponto</span>
        <span>Hoje</span>
      </div>
      <ol className="cartao-inicio__linhas">
        {LINHAS.map((linha, i) => (
          <li
            key={linha.hora}
            className={`cartao-inicio__linha cartao-inicio__linha--${linha.estado}`}
            style={{ '--ordem': i } as CSSProperties}
          >
            <span className="cartao-inicio__furo" />
            <span className="cartao-inicio__hora">{linha.hora}</span>
            {linha.estado === 'reservado' ? (
              <span className="cartao-inicio__carimbo">Reservado</span>
            ) : (
              <span className="cartao-inicio__estado">{linha.estado}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
