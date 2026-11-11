export function nameInput(value: string): string;
export function emailInput(value: string): string;
export function validEmail(value: unknown): boolean;

export function textInput(value: string, maximum?: number, multiline?: boolean): string;
export function phoneInput(value: string): string;
export function validPhone(value: unknown): boolean;
export function validText(value: unknown, maximum?: number): boolean;
