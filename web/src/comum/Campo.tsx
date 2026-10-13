import { useId, type InputHTMLAttributes } from 'react';

/** Rótulo + campo + erro do servidor (ligado por aria-describedby) */
export function Campo({
  rotulo,
  erro,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string }) {
  const id = useId();
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <input
        {...resto}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
      />
      {erro && (
        <small className="erro" id={`${id}-erro`}>
          {erro}
        </small>
      )}
    </label>
  );
}
