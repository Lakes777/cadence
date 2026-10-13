import { Component, type ReactNode } from 'react';

/**
 * Um erro de programação numa tela não pode deixar a página em branco: mostra o aviso e um
 * jeito de sair. O Layout troca a `key` a cada endereço, então navegar já tenta de novo.
 */
export class ErroInesperado extends Component<
  { children: ReactNode },
  { quebrou: boolean }
> {
  state = { quebrou: false };

  static getDerivedStateFromError(): { quebrou: boolean } {
    return { quebrou: true };
  }

  render() {
    if (!this.state.quebrou) return this.props.children;
    return (
      <div className="cartao" role="alert">
        <h1>Algo deu errado nesta tela</h1>
        <p>Recarregue a página ou volte ao início.</p>
        <div className="acoes">
          <button
            type="button"
            className="botao"
            onClick={() => location.reload()}
          >
            Recarregar
          </button>
          <a className="botao botao--contorno" href="/">
            Início
          </a>
        </div>
      </div>
    );
  }
}
