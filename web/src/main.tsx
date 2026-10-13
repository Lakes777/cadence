import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { iniciarSessao } from './api/sessao';
import { App } from './App';
import './estilos/tema.css';

void iniciarSessao();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
