import { Prisma } from '@prisma/client';

/** `expr` with ё and Ё read as е and Е, the SQL side of `foldYo`. */
export function foldYoSql(expr: Prisma.Sql): Prisma.Sql {
	return Prisma.sql`translate(${expr}, 'ёЁ', 'еЕ')`;
}
