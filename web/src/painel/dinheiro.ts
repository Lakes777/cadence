/**
 * Preço digitado em reais ("35,00", "35", "1.234,5", "R$ 35,90") -> centavos, só com texto:
 * nada passa por número de ponto flutuante (0,29 * 100 daria 28,999...).
 * Devolve undefined se não for um valor em reais.
 */
export function reaisParaCentavos(texto: string): number | undefined {
  const limpo = texto
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '');
  // Milhar com ponto (1.234,50) ou sem (1234,50); vírgula ou ponto como decimal (35.9)
  const partes =
    /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpo) ??
    /^(\d+)(?:\.(\d{1,2}))?$/.exec(limpo);
  if (!partes) return undefined;
  const inteiros = partes[1].replace(/\./g, '');
  const decimais = (partes[2] ?? '').padEnd(2, '0');
  const centavos = Number(inteiros) * 100 + Number(decimais);
  return Number.isSafeInteger(centavos) ? centavos : undefined;
}

/** 3500 -> "35,00" (para preencher o campo ao editar) */
export function centavosParaReais(centavos: number): string {
  const inteiros = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, '0');
  return `${inteiros},${resto}`;
}
