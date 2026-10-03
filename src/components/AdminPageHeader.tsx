import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface AdminPageHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: ReactNode;
  actions?: ReactNode;
  "data-guide"?: string;
}

export function AdminPageHeader({ title, description, icon: Icon, badge, actions, "data-guide": guide }: AdminPageHeaderProps) {
  const [stage, setStage] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState<number>();
  const headerRef = useRef<HTMLElement>(null);
  const hasActions = Boolean(actions);

  useLayoutEffect(() => {
    if (!hasActions || stage !== 0 || !headerRef.current) return;
    const measure = () => setExpandedHeight(headerRef.current?.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, [hasActions, stage]);

  useEffect(() => {
    if (!hasActions) return;
    const update = () => {
      const scroll = window.scrollY;
      setStage(scroll > 200 ? 3 : scroll > 130 ? 2 : scroll > 60 ? 1 : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [hasActions]);

  useEffect(() => {
    if (stage === 0) return;
    headerRef.current?.querySelectorAll("button").forEach((button) => {
      if (!button.title) button.title = button.getAttribute("aria-label") || button.textContent?.trim() || "";
    });
  }, [actions, stage]);

  return (
    <div className={hasActions ? "sticky top-20 z-20" : "relative"} style={hasActions && expandedHeight ? { height: expandedHeight } : undefined}>
    <section ref={headerRef} data-guide={guide} data-compact={stage >= 1} aria-label={title} className={`admin-page-header relative isolate ml-auto max-w-full rounded-3xl border border-violet-200 bg-gradient-to-br from-white via-violet-50 to-purple-100 text-slate-900 shadow-sm transition-[width,padding] duration-300 ease-out ${stage === 0 ? "w-full p-5 sm:px-8 sm:py-7" : stage === 1 ? "w-fit p-3" : stage === 2 ? "w-fit p-2" : "w-fit p-1.5"}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#8642ED]/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-24 w-40 bg-fuchsia-300/10 blur-3xl" />
      </div>
      <div className={`flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between ${stage > 0 ? "!gap-0" : ""}`}>
        <div className={`min-w-0 items-start gap-3 sm:gap-4 ${stage >= 1 ? "hidden" : "flex"}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#8642ED] text-white shadow-lg shadow-violet-200 sm:h-12 sm:w-12 sm:rounded-2xl">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h2>
              {badge}
            </div>
            {stage === 0 && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
          </div>
        </div>
        {actions && <div className={`admin-header-actions flex min-w-0 items-center gap-2 sm:gap-3 ${stage >= 1 ? "w-auto max-w-full flex-nowrap [&>*]:shrink-0" : "w-full flex-wrap [&>button]:flex-1 sm:w-auto sm:[&>button]:flex-none xl:max-w-[50%] xl:justify-end"}`}>{actions}</div>}
      </div>
    </section>
    </div>
  );
}
