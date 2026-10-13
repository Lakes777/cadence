import { useId, useState } from 'react';

/** Os fusos mais comuns de quem usa o Cadence (Brasil e Portugal); o resto vai em "Outro" */
export const FUSOS_COMUNS = [
  {
    valor: 'America/Sao_Paulo',
    nome: 'Brasília (São Paulo, Rio, Sul, Nordeste)',
  },
  { valor: 'America/Manaus', nome: 'Amazonas (Manaus)' },
  { valor: 'America/Cuiaba', nome: 'Mato Grosso (Cuiabá)' },
  { valor: 'America/Rio_Branco', nome: 'Acre (Rio Branco)' },
  { valor: 'America/Noronha', nome: 'Fernando de Noronha' },
  { valor: 'Europe/Lisbon', nome: 'Portugal continental e Madeira (Lisboa)' },
  { valor: 'Atlantic/Azores', nome: 'Açores' },
] as const;

const OUTRO = 'outro';

function ehComum(fuso: string): boolean {
  return FUSOS_COMUNS.some((f) => f.valor === fuso);
}

/**
 * Lista curta + "Outro" (nome IANA digitado, ex.: Europe/Madrid). O servidor confere o nome e
 * devolve o canônico; o erro dele aparece embaixo.
 */
export function SeletorDeFuso({
  valor,
  aoMudar,
  erro,
  desabilitado,
}: {
  valor: string;
  aoMudar: (fuso: string) => void;
  erro?: string;
  desabilitado?: boolean;
}) {
  const id = useId();
  const [outro, setOutro] = useState(!ehComum(valor));
  const descricao = erro ? `${id}-erro` : undefined;

  return (
    <div className="campo">
      <label className="rotulo" htmlFor={`${id}-lista`}>
        Fuso horário
      </label>
      <select
        id={`${id}-lista`}
        value={outro ? OUTRO : valor}
        disabled={desabilitado}
        aria-invalid={erro && !outro ? true : undefined}
        aria-describedby={outro ? undefined : descricao}
        onChange={(e) => {
          if (e.target.value === OUTRO) {
            setOutro(true);
            aoMudar('');
          } else {
            setOutro(false);
            aoMudar(e.target.value);
          }
        }}
      >
        {FUSOS_COMUNS.map((f) => (
          <option key={f.valor} value={f.valor}>
            {f.nome}
          </option>
        ))}
        <option value={OUTRO}>Outro (digitar o nome)</option>
      </select>
      {outro && (
        <label className="campo">
          <span>Nome do fuso (IANA)</span>
          <input
            value={valor}
            placeholder="Europe/Madrid"
            autoCapitalize="off"
            spellCheck={false}
            required
            disabled={desabilitado}
            aria-invalid={erro ? true : undefined}
            aria-describedby={descricao}
            onChange={(e) => aoMudar(e.target.value)}
          />
        </label>
      )}
      {erro && (
        <small className="erro" id={`${id}-erro`}>
          {erro}
        </small>
      )}
    </div>
  );
}
