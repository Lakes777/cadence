import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ValidacaoZod } from './validacao-zod.pipe.js';

describe('ValidacaoZod', () => {
  const pipe = new ValidacaoZod(
    z.object({ nome: z.string().trim().min(1, 'Informe o nome') }),
  );

  it('devolve o valor já normalizado', () => {
    expect(pipe.transform({ nome: '  Ana ' })).toEqual({ nome: 'Ana' });
  });

  it('responde 400 com a lista de campos e mensagens', () => {
    try {
      pipe.transform({ nome: ' ' });
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(BadRequestException);
      expect((erro as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        message: 'Dados inválidos',
        erros: [{ campo: 'nome', mensagem: 'Informe o nome' }],
      });
    }
  });

  it('recusa corpo que não é objeto', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
