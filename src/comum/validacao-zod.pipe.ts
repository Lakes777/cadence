import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Valida (e normaliza) o corpo com um esquema zod: `@Body(new ValidacaoZod(esquema))`. */
export class ValidacaoZod<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.infer<T>
> {
  constructor(private readonly esquema: T) {}

  transform(valor: unknown): z.infer<T> {
    const resultado = this.esquema.safeParse(valor);
    if (!resultado.success) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Dados inválidos',
        erros: resultado.error.issues.map((p) => ({
          campo: p.path.join('.'),
          mensagem: p.message,
        })),
      });
    }
    return resultado.data;
  }
}
