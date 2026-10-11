import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/** `@Param('id', ID)`: recusa com 400 o que não é UUID antes de chegar no banco. */
export const ID = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('Id inválido'),
});
