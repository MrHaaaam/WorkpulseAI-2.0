export const ADDITION_MAX: number;
export const HOURLY_RATE_MAX: number;
export const GRACE_MINUTES_MAX: number;
export function identifierLengths(type: string): number[] | null;
export function identifierInput(type: string, value: string): string;
export function validNumberInput(value: string, maximum: number, decimals?: number): boolean;
export function validBoundedNumber(value: unknown, minimum: number, maximum: number, decimals?: number): boolean;
export function identifiersValidationError(identifiers: unknown): string | null;
export function settingsNumbersValidationError(settings: unknown): string | null;
