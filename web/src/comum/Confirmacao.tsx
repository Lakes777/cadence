import { useEffect, useId, useRef } from 'react';

/**
 * Pergunta "tem certeza?" ali mesmo (cliente e painel), sem janela por cima: role="alertdialog" e o foco vai para
 * "Voltar" (a saída segura), então o leitor de tela lê a pergunta. Esc também volta.
 */
export function Confirmacao({
  pergunta,
  confirmar,
  enviando,
  voltar = 'Voltar',
  aoConfirmar,
  aoVoltar,
}: {
  pergunta: string;
  confirmar: string;
  /** O texto da saída segura (padrão "Voltar") */
  voltar?: string;
  enviando: boolean;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  const id = useId();
  const saida = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    saida.current?.focus();
  }, []);

  return (
    <div
      className="confirmacao"
      role="alertdialog"
      aria-labelledby={`${id}-pergunta`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !enviando) aoVoltar();
      }}
    >
      <p id={`${id}-pergunta`}>{pergunta}</p>
      <div className="acoes">
        <button
          type="button"
          className="botao botao--perigo botao--pequeno"
          disabled={enviando}
          onClick={aoConfirmar}
        >
          {enviando ? 'Enviando…' : confirmar}
        </button>
        <button
          ref={saida}
          type="button"
          className="botao botao--contorno botao--pequeno"
          disabled={enviando}
          onClick={aoVoltar}
        >
          {voltar}
        </button>
      </div>
    </div>
  );
}
