/**
 * Parse currency-like strings into plain numbers.
 * Handles: "18.99", "0", "840.99", "5,960", "5,960.50"
 */
export function parseMoney(value: string): number {
    return parseFloat(value.trim().replace(/,/g, '')) || 0;
}
