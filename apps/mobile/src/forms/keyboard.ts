import { useCallback, useRef } from 'react';
import { Keyboard, type TextInput } from 'react-native';

export interface FieldProps {
  ref: (input: TextInput | null) => void;
  returnKeyType?: 'next' | 'done';
  submitBehavior?: 'submit' | 'blurAndSubmit';
  onSubmitEditing?: () => void;
}

/**
 * Next on the keyboard moves to the form's next field. Spread `field()` on each `Input`, in the order they
 * show on screen; Next jumps to the next text field still there (pickers and chips in between are skipped, and a row
 * taken out drops out of the chain). The last one gets `field({ done: true })`: its key reads Done and closes the
 * keyboard, or with `done: submit` sends the form. A multiline field (`{ multiline: true }`) is a stop on the way but
 * keeps Enter for new lines.
 *
 * Fields are told apart by the order this render asked for them, so the calls must run in the form's own render (rows
 * of a list included) and not inside a memoised child.
 */
export function useFieldChain() {
  const inputs = useRef<(TextInput | null)[]>([]);
  const refs = useRef<((input: TextInput | null) => void)[]>([]);
  const count = useRef(0);
  count.current = 0;

  const next = useCallback((from: number) => {
    for (let i = from + 1; i < inputs.current.length; i++) {
      const input = inputs.current[i];
      if (input) {
        input.focus();
        return;
      }
    }
    Keyboard.dismiss();
  }, []);

  return useCallback(
    (opts: { done?: boolean | (() => void); multiline?: boolean } = {}): FieldProps => {
      const i = count.current++;
      const ref = (refs.current[i] ??= (input) => {
        inputs.current[i] = input;
      });
      if (opts.multiline) return { ref };
      if (opts.done) {
        const done = opts.done;
        return { ref, returnKeyType: 'done', submitBehavior: 'blurAndSubmit', onSubmitEditing: typeof done === 'function' ? done : undefined };
      }
      return { ref, returnKeyType: 'next', submitBehavior: 'submit', onSubmitEditing: () => next(i) };
    },
    [next],
  );
}
