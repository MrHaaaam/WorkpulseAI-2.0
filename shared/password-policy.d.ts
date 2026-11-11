export const PASSWORD_MIN: number;
export const PASSWORD_MAX: number;
export const LOGIN_PASSWORD_MAX: number;
export const PASSWORD_SPECIAL_MAX: number;
export const PASSWORD_RULES: string;
export function countSpecialCharacters(value: string): number;
export function passwordValidationError(value: unknown): string | null;

export function passwordInput(value: string): string;
export function validPasswordCharacters(value: unknown): boolean;
