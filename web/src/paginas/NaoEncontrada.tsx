import { Link } from 'react-router';

export function NaoEncontrada() {
  return (
    <section className="cartao">
      <h1>Página não encontrada</h1>
      <p>Este endereço não existe (ou mudou).</p>
      <Link className="botao" to="/">
        Voltar ao início
      </Link>
    </section>
  );
}
