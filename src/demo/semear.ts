/**
 * `npm run semear-demo`: repõe a Barbearia Exemplo (ver semeadura.ts). Roda contra o build,
 * sem subir a API, então funciona dentro do contêiner:
 * `docker compose exec -T api npm run semear-demo`.
 */
import { executar } from './semeadura.js';

process.exitCode = await executar(process.env, (linha) => console.log(linha));
