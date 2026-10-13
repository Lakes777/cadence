import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Começos de rota da API: nunca caem nas telas (ver web/src/App.tsx, que evita os mesmos) */
const ROTAS_DA_API = [
  '/auth',
  '/negocios',
  '/reservas',
  '/avisos',
  '/saude',
  '/demo',
  '/tempo-real',
];

function eDaApi(caminho: string): boolean {
  return ROTAS_DA_API.some(
    (prefixo) => caminho === prefixo || caminho.startsWith(`${prefixo}/`),
  );
}

/**
 * Serve o build das telas pelo mesmo endereço da API. Os arquivos com hash no nome (/assets) ficam
 * em cache para sempre; o index.html nunca, para uma versão nova chegar logo. Qualquer outro GET
 * de navegador (/b/..., /painel/...) recebe o index.html e o react-router decide a tela. Pedido que
 * não pede HTML (fetch, curl) segue para a API e recebe o 404 em JSON.
 */
export function servirTelas(app: NestExpressApplication, pasta: string): void {
  const raiz = resolve(pasta);
  const indice = join(raiz, 'index.html');
  if (!existsSync(indice)) {
    throw new Error(`PASTA_DAS_TELAS: não achei ${indice}`);
  }
  app.useStaticAssets(raiz, {
    index: false,
    setHeaders: (resposta, arquivo) => {
      resposta.setHeader(
        'Cache-Control',
        arquivo.startsWith(join(raiz, 'assets'))
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });
  app.use((pedido: Request, resposta: Response, seguir: NextFunction) => {
    const navegador = pedido.headers.accept?.includes('text/html') ?? false;
    if (
      (pedido.method !== 'GET' && pedido.method !== 'HEAD') ||
      !navegador ||
      eDaApi(pedido.path)
    ) {
      seguir();
      return;
    }
    resposta.setHeader('Cache-Control', 'no-cache');
    resposta.sendFile(indice);
  });
}
