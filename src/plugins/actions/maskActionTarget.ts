// Mask sensitive parts of a composite target before logging.
// Targets that follow the "selector||value" syntax frequently carry
// passwords, tokens, payment details or expected texts — only the
// selector half is safe to log.

const ACTION_TYPE_SEPARATOR = '||';

export function maskActionTarget(target: string): string {
    if (typeof target !== 'string' || target.length === 0) return target;
    const sepIndex = target.indexOf(ACTION_TYPE_SEPARATOR);
    if (sepIndex === -1) return target;
    return `${target.slice(0, sepIndex)}${ACTION_TYPE_SEPARATOR}***`;
}
