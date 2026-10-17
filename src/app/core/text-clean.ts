/**
 * Text hygiene for every form in the app.
 *
 * While typing / pasting (installTypingRules):
 *   - no leading spaces, never two spaces in a row
 *   - email fields: no spaces at all
 *   - textareas: same per line, at most one blank line in a row
 *   - passwords and fields marked data-raw are left alone
 *
 * Before saving (clean): strings are trimmed and inner runs of spaces collapsed,
 * recursively through objects/arrays.
 */

const SKIP_TYPES = new Set(['password', 'number', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'range', 'file', 'checkbox', 'radio', 'hidden']);

function normalizeLine(s: string): string {
  return s.replace(/[ \t ]+/g, ' ');
}

export function normalizeTyping(value: string, kind: 'line' | 'email' | 'multi'): string {
  if (kind === 'email') return value.replace(/\s+/g, '');
  if (kind === 'line') return normalizeLine(value.replace(/[\r\n]+/g, ' ')).replace(/^ +/, '');
  return value
    .split('\n')
    .map(normalizeLine)
    .join('\n')
    .replace(/^[ \n]+/, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** Clean a value for saving: trim + collapse spaces (keeps single line breaks in multi-line text). */
export function cleanText(s: string): string {
  return s
    .split('\n')
    .map((l) => normalizeLine(l).trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Deep-clean every string in a payload before it goes to the database. */
export function clean<T>(value: T): T {
  if (typeof value === 'string') return cleanText(value) as T;
  if (Array.isArray(value)) return value.map((v) => clean(v)) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = clean(v);
    return out as T;
  }
  return value;
}

/** Registers one capture-phase listener so the rules apply to every input in the app. */
export function installTypingRules(doc: Document): void {
  doc.addEventListener(
    'input',
    (ev) => {
      const el = ev.target;
      let kind: 'line' | 'email' | 'multi';
      if (el instanceof HTMLTextAreaElement) kind = 'multi';
      else if (el instanceof HTMLInputElement && !SKIP_TYPES.has(el.type)) kind = el.type === 'email' ? 'email' : 'line';
      else return;
      if (el.hasAttribute('data-raw')) return;

      const before = el.value;
      const after = normalizeTyping(before, kind);
      if (after === before) return;

      // Keep the caret where the user expects it
      let caret: number | null = null;
      try {
        if (el.selectionStart != null) caret = normalizeTyping(before.slice(0, el.selectionStart), kind).length;
      } catch {
        /* some input types don't support selection */
      }
      el.value = after;
      if (caret != null) {
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          /* ignore */
        }
      }
    },
    true, // capture: runs before Angular's ngModel reads the value
  );
}
