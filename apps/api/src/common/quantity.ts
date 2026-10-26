import { ValidateBy, type ValidationOptions } from 'class-validator';

/** A plain decimal as the forms send it: "12", "12.5", ".5". No sign, no exponent. */
const PLAIN = /^(\d+\.?\d*|\.\d+)$/;

/**
 * A quantity field (finding 4 of the October review): a plain decimal above zero, or zero or more with `zero`. A minus
 * sign is refused here, before any service sees it; a signed figure (a stock adjustment, a variation) keeps
 * `IsNumberString`.
 */
export function IsQuantity(opts: ValidationOptions & { zero?: boolean } = {}) {
  const { zero, ...options } = opts;
  return ValidateBy(
    {
      name: 'isQuantity',
      validator: {
        validate: (v: unknown) => typeof v === 'string' && PLAIN.test(v) && (zero ? Number(v) >= 0 : Number(v) > 0),
        defaultMessage: () => (zero ? '$property must be zero or more' : '$property must be more than zero'),
      },
    },
    options,
  );
}
