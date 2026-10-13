import { Route, Routes } from 'react-router';
import { Inicio } from './cliente/Inicio';
import { MinhasReservas } from './cliente/MinhasReservas';
import { Reservar } from './cliente/Reservar';
import { Exige } from './comum/Exige';
import { Layout } from './comum/Layout';
import { Painel } from './painel/Painel';
import { Cadastro } from './paginas/Cadastro';
import { Entrar } from './paginas/Entrar';
import { NaoEncontrada } from './paginas/NaoEncontrada';

/**
 * As rotas das telas não usam nenhum prefixo da API (/auth, /negocios, /reservas, /avisos,
 * /saude, /demo, /tempo-real): no deploy, o mesmo endereço serve as duas coisas.
 */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="b/:slug" element={<Reservar />} />
        <Route
          path="minhas"
          element={
            <Exige papel="cliente">
              <MinhasReservas />
            </Exige>
          }
        />
        <Route
          path="painel/*"
          element={
            <Exige papel="dono">
              <Painel />
            </Exige>
          }
        />
        <Route path="entrar" element={<Entrar />} />
        <Route path="cadastro" element={<Cadastro />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
