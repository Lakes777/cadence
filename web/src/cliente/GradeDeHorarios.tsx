import type { ItemDaGrade } from './dados';

/**
 * Os horários do dia em duas colunas, cada um com o furo do cartão de ponto: vazio = livre,
 * cheio com o carimbo "OCUPADO" = ocupado, invertido = escolhido. São radios de verdade (as
 * setas do teclado andam entre os livres), com nomes como "09:30, livre".
 */
export function GradeDeHorarios({
  itens,
  escolhido,
  tomados,
  rotulo,
  aoEscolher,
}: {
  itens: ItemDaGrade[];
  escolhido: string | null;
  /** Horas que alguém acabou de pegar (contorno vermelho por ~1 s) */
  tomados: string[];
  rotulo: string;
  aoEscolher: (hora: string) => void;
}) {
  return (
    <fieldset className="grade">
      <legend className="so-leitor">{rotulo}</legend>
      <div className="grade__colunas">
        {itens.map((item) => {
          const livre = item.tipo === 'livre';
          const marcado = livre && item.hora === escolhido;
          const classes = [
            'horario',
            livre ? 'horario--livre' : 'horario--ocupado',
            marcado && 'horario--escolhido',
            tomados.includes(item.hora) && 'horario--tomado',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <label key={item.inicio} className={classes}>
              <input
                type="radio"
                name="horario"
                className="so-leitor"
                value={item.hora}
                checked={marcado}
                disabled={!livre}
                aria-label={`${item.hora}, ${livre ? 'livre' : 'ocupado'}`}
                onChange={() => aoEscolher(item.hora)}
              />
              <span className="horario__furo" aria-hidden="true" />
              <span className="horario__hora" aria-hidden="true">
                {item.hora}
              </span>
              {!livre && (
                <span className="carimbo horario__carimbo" aria-hidden="true">
                  Ocupado
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
