import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/util";
import { useAdminPasswordRetry } from "../../lib/adminPasswordRetry";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const retrySeconds = useAdminPasswordRetry();
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    setHasPassword(Boolean(open && contentRef.current?.querySelector('input[type="password"], input[autocomplete="current-password"]')));
  }, [open, children]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        ref={contentRef}
        onSubmitCapture={(event) => {
          if (retrySeconds > 0 && contentRef.current?.querySelector('input[type="password"], input[autocomplete="current-password"]')) event.preventDefault();
        }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "scrollbar-thin relative z-10 max-h-[94svh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl animate-scale-in sm:max-h-[90vh] sm:rounded-2xl",
          className
        )}
      >
        {hasPassword && retrySeconds > 0 && <p role="status" className="mx-4 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 sm:mx-6">Incorrect admin password. Try again in {retrySeconds} seconds.</p>}
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 items-start justify-between gap-3 p-4 pb-2 sm:p-6 sm:pb-2">{children}</div>;
}

export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close dialog"
      onClick={onClose}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
    >
      <X className="h-5 w-5" />
    </button>
  );
}
