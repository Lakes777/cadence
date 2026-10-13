import { useEffect } from 'react';

/** O título da aba ("Minhas reservas · Cadence"): é o que o leitor de tela lê ao trocar de página */
export function useTitulo(titulo: string | null | undefined): void {
  useEffect(() => {
    document.title = titulo ? `${titulo} · Cadence` : 'Cadence';
  }, [titulo]);
}
