/**
 * Conta eventos por chave (o IP) numa janela fixa de tempo: até `maximo` por janela; a janela
 * começa no primeiro evento e, passado o prazo, a próxima conta do zero. `agora` é injetável
 * para os testes não precisarem esperar a janela passar de verdade.
 */
export class LimitePorJanela {
  private readonly janelas = new Map<
    string,
    { inicio: number; quantos: number }
  >();

  constructor(
    private readonly maximo: number,
    private readonly duracaoMs: number,
    private readonly agora: () => number = Date.now,
  ) {}

  /** Ainda cabe mais um nesta janela? (só olha; quem conta é `registrar`) */
  cabe(chave: string): boolean {
    const janela = this.janelas.get(chave);
    if (!janela || this.agora() - janela.inicio >= this.duracaoMs) return true;
    return janela.quantos < this.maximo;
  }

  registrar(chave: string): void {
    const agora = this.agora();
    const janela = this.janelas.get(chave);
    if (!janela || agora - janela.inicio >= this.duracaoMs) {
      this.janelas.set(chave, { inicio: agora, quantos: 1 });
    } else {
      janela.quantos++;
    }
  }

  /** Esquece as janelas que já passaram: sem isso, cada IP que já conectou ficaria na memória */
  limpar(): void {
    const agora = this.agora();
    for (const [chave, janela] of this.janelas) {
      if (agora - janela.inicio >= this.duracaoMs) this.janelas.delete(chave);
    }
  }

  /** Quantas chaves estão guardadas (para os testes) */
  get tamanho(): number {
    return this.janelas.size;
  }
}
