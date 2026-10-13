/** Mensagem de erro de uma tela (anunciada pelo leitor de tela) */
export function Erro({ mensagem }: { mensagem: string | null | undefined }) {
  if (!mensagem) return null;
  return (
    <p className="alerta" role="alert">
      {mensagem}
    </p>
  );
}
