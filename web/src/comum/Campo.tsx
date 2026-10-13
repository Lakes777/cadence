import { useId, type InputHTMLAttributes } from 'react';

/**
 * Rótulo + campo + erro do servidor. O erro fica fora do <label> e entra só pelo
 * aria-describedby: dentro do label, o leitor de tela o leria duas vezes, junto com o nome.
 */
export function Campo({
  rotulo,
  erro,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string }) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>
        <span>{rotulo}</span>
      </label>
      <input
        {...resto}
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
      />
      {erro && (
        <small className="erro" id={`${id}-erro`}>
          {erro}
        </small>
      )}
    </div>
  );
}
