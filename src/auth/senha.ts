import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/** Custo do scrypt (N = 2^15, r = 8, p = 1): ~50 ms por senha, recomendação da OWASP. */
export const CUSTO_PADRAO = { N: 2 ** 15, r: 8, p: 1 } as const;

type Custo = { N: number; r: number; p: number };

const TAMANHO_DO_HASH = 32;

function derivar(
  senha: string,
  sal: Buffer,
  { N, r, p }: Custo,
): Promise<Buffer> {
  // O scrypt usa 128 * N * r bytes (32 MiB no padrão), justo o teto padrão do Node: dobra o teto
  const opcoes: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((resolver, rejeitar) => {
    scrypt(
      senha.normalize('NFKC'),
      sal,
      TAMANHO_DO_HASH,
      opcoes,
      (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)),
    );
  });
}

/** Devolve `scrypt$N$r$p$sal$hash` (base64url): o custo vai junto, para poder subir no futuro. */
export async function gerarHashDeSenha(
  senha: string,
  custo: Custo = CUSTO_PADRAO,
): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal, custo);
  return [
    'scrypt',
    custo.N,
    custo.r,
    custo.p,
    sal.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

/** Compara em tempo constante. Um hash mal formado conta como senha errada. */
export async function conferirSenha(
  senha: string,
  guardado: string,
): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [N, r, p] = partes.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return false;
  const sal = Buffer.from(partes[4], 'base64url');
  const esperado = Buffer.from(partes[5], 'base64url');
  if (esperado.length !== TAMANHO_DO_HASH) return false;
  const obtido = await derivar(senha, sal, { N, r, p });
  return timingSafeEqual(obtido, esperado);
}
