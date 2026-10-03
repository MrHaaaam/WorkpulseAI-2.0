import { cn } from "../../lib/util";
import { PASSWORD_MAX, passwordInput } from "../../../shared/password-policy.js";
import { emailInput, phoneInput, textInput } from "../../../shared/input-format.js";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  const isPassword = props.type === "password" || props.autoComplete === "current-password" || props.autoComplete === "new-password" || /password/i.test(props.placeholder ?? "");
  const isNumeric = props.type === "number" || props.inputMode === "numeric" || props.inputMode === "decimal";
  const isText = !props.type || ["text", "search", "email", "tel", "password", "number"].includes(props.type);
  const isSearch = props.type === "search" || /search/i.test(props.placeholder ?? "");
  const isLongText = !isPassword && !isNumeric && [200, 250, 255, 500].includes(props.maxLength ?? 0) && props.type !== "email";
  const limit = isPassword ? PASSWORD_MAX : isSearch ? 100 : isLongText ? 500 : props.maxLength ?? (isText ? props.type === "email" ? 254 : props.type === "tel" ? 16 : 500 : undefined);
  const counter = isSearch || isLongText;
  const field = (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#8642ED] focus:outline-none focus:ring-2 focus:ring-[#8642ED]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
        counter && "pr-16"
      )}
      {...props}
      maxLength={limit}
      onKeyDown={event => {
        if ((props.type === "email" || isPassword || isNumeric || props.type === "tel") && event.key === " ") event.preventDefault();
        if (isNumeric && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !/[0-9]/.test(event.key) && !(event.key === "." && (props.type === "number" || props.inputMode === "decimal"))) event.preventDefault();
        props.onKeyDown?.(event);
      }}
      onChange={isText ? event => {
        if (isPassword) event.target.value = passwordInput(event.target.value);
        else if (props.type === "email") event.target.value = emailInput(event.target.value);
        else if (props.type === "tel") event.target.value = phoneInput(event.target.value);
        else if (isNumeric) {
          const pattern = props.inputMode === "numeric" ? /^\d*$/ : /^\d*(?:\.\d{0,2})?$/;
          if (!pattern.test(event.target.value)) return;
        } else event.target.value = textInput(event.target.value, limit ?? 500);
        props.onChange?.(event);
      } : props.onChange}
    />
  );
  return counter ? <div className="relative min-w-0 flex-1">{field}<span className="pointer-events-none absolute bottom-1 right-3 text-[10px] font-normal text-slate-500" aria-label={`${String(props.value ?? props.defaultValue ?? '').length} of ${limit} characters`}>{String(props.value ?? props.defaultValue ?? '').length}/{limit}</span></div> : field;
}

export function Textarea({ onChange, maxLength: _maxLength, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <div className="relative min-w-0"><textarea {...props} className={cn(className, "pb-6")} maxLength={500} onChange={event => {
    event.target.value = textInput(event.target.value, 500, true);
    onChange?.(event);
  }} /><span className="pointer-events-none absolute bottom-2 right-3 text-xs font-normal text-slate-500">{String(props.value ?? props.defaultValue ?? '').length}/500</span></div>;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}
