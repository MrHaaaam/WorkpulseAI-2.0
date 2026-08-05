import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  LineChart,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { cn } from "../lib/util";

type ModelKey = "forecast" | "risk" | "anomaly" | "verification";
type ToneKey = "violet" | "amber" | "sky" | "emerald";

type InsightModel = {
  key: ModelKey;
  name: string;
  method: string;
  summary: string;
  icon: React.ElementType;
  tone: ToneKey;
};

const models: InsightModel[] = [
  {
    key: "forecast" as const,
    name: "Forecast AI",
    method: "Holt-Winters",
    summary: "Predicts attendance using level, trend, and repeating seasonal behavior.",
    icon: LineChart,
    tone: "violet",
  },
  {
    key: "risk" as const,
    name: "Risk AI",
    method: "Bradford + Time Decay",
    summary: "Prioritizes frequent disruption while recognizing sustained improvement.",
    icon: ShieldCheck,
    tone: "amber",
  },
  {
    key: "anomaly" as const,
    name: "Anomaly AI",
    method: "Modified Z-Score",
    summary: "Detects true clock-in outliers with a baseline resistant to extreme values.",
    icon: ScanSearch,
    tone: "sky",
  },
  {
    key: "verification" as const,
    name: "Verification AI",
    method: "Rolling Health Average",
    summary: "Tracks fingerprint confidence to flag scanner degradation before failure.",
    icon: Fingerprint,
    tone: "emerald",
  },
];

const tones = {
  violet: { icon: "bg-violet-100 text-violet-600", soft: "border-violet-200 bg-violet-50/70", bar: "bg-violet-500" },
  amber: { icon: "bg-amber-100 text-amber-600", soft: "border-amber-200 bg-amber-50/70", bar: "bg-amber-500" },
  sky: { icon: "bg-sky-100 text-sky-600", soft: "border-sky-200 bg-sky-50/70", bar: "bg-sky-500" },
  emerald: { icon: "bg-emerald-100 text-emerald-600", soft: "border-emerald-200 bg-emerald-50/70", bar: "bg-emerald-500" },
};

const riskTiers = [
  { range: "0–50", signal: "Normal attendance", action: "No action", color: "bg-emerald-500" },
  { range: "51–124", signal: "Mild concern", action: "Monitor closely", color: "bg-sky-500" },
  { range: "125–399", signal: "Moderate–high concern", action: "Absence review", color: "bg-amber-500" },
  { range: "400+", signal: "Severe disruption", action: "Formal intervention", color: "bg-red-500" },
];

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-center font-mono text-sm font-semibold text-violet-950">
      {children}
    </div>
  );
}

export function AIInsightsView() {
  const [activeModel, setActiveModel] = useState<ModelKey>("forecast");
  const selected = models.find((model) => model.key === activeModel)!;
  const SelectedIcon = selected.icon;
  const tone = tones[selected.tone];

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8642ED]">
            <Sparkles className="h-4 w-4" /> Model intelligence center
          </div>
          <h2 className="text-2xl font-bold text-slate-900">AI Insights</h2>
          <p className="max-w-2xl text-sm text-slate-500">Transparent workforce intelligence built on explainable statistical models.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> 4 intelligence models active
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {models.map((model) => {
          const Icon = model.icon;
          const modelTone = tones[model.tone];
          const active = model.key === activeModel;
          return (
            <button key={model.key} onClick={() => setActiveModel(model.key)} className="h-full w-full min-w-0 text-left">
              <Card className={cn("h-full min-w-0 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md", active && "border-[#8642ED] ring-2 ring-[#8642ED]/10")}>
                <CardContent className="p-5 !pt-5">
                  <div className="flex items-start justify-between">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", modelTone.icon)}><Icon className="h-5 w-5" /></div>
                    {active ? <Badge>Selected</Badge> : <ChevronRight className="h-4 w-4 text-slate-300" />}
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900">{model.name}</h3>
                  <p className="mt-0.5 text-xs font-medium text-[#8642ED]">{model.method}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{model.summary}</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden animate-fade-in" key={activeModel}>
        <div className={cn("h-1", tone.bar)} />
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tone.icon)}><SelectedIcon className="h-5 w-5" /></div>
              <div><CardTitle>{selected.name}</CardTitle><CardDescription>{selected.method} methodology</CardDescription></div>
            </div>
            <Badge variant="success"><CheckCircle2 className="h-3.5 w-3.5" /> Explainable model</Badge>
          </div>
        </CardHeader>

        {activeModel === "forecast" && (
          <CardContent className="grid min-w-0 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-5">
              <Section title="Why this model" icon={BrainCircuit}>Weighted averages can show a broad direction, but miss recurring patterns. Holt-Winters responds to recent behavior while learning effects such as Friday call-outs or rainy-season absence spikes.</Section>
              <Formula>ŷ<sub>t+h|t</sub> = ℓ<sub>t</sub> + hb<sub>t</sub> + s<sub>t+h−m(k+1)</sub></Formula>
              <div className="grid gap-3 sm:grid-cols-3">
                <Definition label="Level (ℓₜ)" text="Current attendance baseline" />
                <Definition label="Trend (bₜ)" text="Improving or declining behavior" />
                <Definition label="Seasonality (sₜ)" text="Repeating attendance patterns" />
              </div>
            </div>
            <ValuePanel className={tone.soft} title="What HR receives" items={["Forward-looking attendance estimates", "Recurring day and seasonal patterns", "Predictions that adapt as new clock-ins arrive"]} note="Recent events receive more weight; older history fades exponentially." />
          </CardContent>
        )}

        {activeModel === "risk" && (
          <CardContent className="min-w-0 space-y-6 p-4 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <Section title="Risk scoring foundation" icon={AlertTriangle}>The Bradford Factor emphasizes frequent, separate absence spells because they create more unexpected disruption than one continuous absence of the same length.</Section>
                <Formula>B = S² × D</Formula>
                <div className="grid grid-cols-2 gap-3">
                  <Definition label="Sam · 1 spell, 7 days" text="Score 7 · low risk" />
                  <Definition label="Robin · 7 spells, 7 days" text="Score 343 · high risk" />
                </div>
              </div>
              <div className="space-y-4">
                <Section title="Fairness upgrade: time decay" icon={TrendingUp}>Older infractions gradually lose influence, allowing the score to recognize corrected behavior and keep HR focused on current problems.</Section>
                <Formula>Score<sub>today</sub> = Σ(value × e<sup>−λΔt</sup>)</Formula>
                <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-800">Example configuration: a penalty loses 50% of its weight every 30 days.</p>
              </div>
            </div>
            <div className="scrollbar-thin overflow-x-auto rounded-xl border border-slate-200 [&>*]:min-w-[560px]">
              <div className="grid grid-cols-[90px_1fr_1fr] bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span>Score</span><span>Signal</span><span>Recommended action</span></div>
              {riskTiers.map((tier) => <div key={tier.range} className="grid grid-cols-[90px_1fr_1fr] items-center border-t border-slate-100 px-4 py-3 text-xs"><span className="flex items-center gap-2 font-semibold text-slate-900"><i className={cn("h-2 w-2 rounded-full", tier.color)} />{tier.range}</span><span className="text-slate-600">{tier.signal}</span><span className="font-medium text-slate-700">{tier.action}</span></div>)}
            </div>
          </CardContent>
        )}

        {activeModel === "anomaly" && (
          <CardContent className="grid min-w-0 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-5">
              <Section title="A baseline that resists outliers" icon={ScanSearch}>A mean clock-in time can be distorted by one extremely late scan. The median and Median Absolute Deviation (MAD) preserve the team’s true center and typical spread.</Section>
              <Formula>Modified Z = 0.6745(xᵢ − x̃) / MAD</Formula>
              <div className="grid gap-3 sm:grid-cols-2"><Definition label="Median (x̃)" text="The middle scan time, resistant to extremes" /><Definition label="MAD" text="Median distance of scans from the median" /></div>
            </div>
            <ValuePanel className={tone.soft} title="Decision rule" items={["Score below −3.5: confirmed anomaly", "Score above +3.5: confirmed anomaly", "Values inside the band remain unflagged"]} note="A 3:00 AM scan against a 9:00 AM team pattern triggers an immediate management alert." />
          </CardContent>
        )}

        {activeModel === "verification" && (
          <CardContent className="grid min-w-0 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-5">
              <Section title="Verify the machine, not only the person" icon={Fingerprint}>Each fingerprint match produces a confidence score. A rolling average across the latest 500 scans or 3 days reveals gradual dirt, wear, or optical sensor failure.</Section>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between text-xs"><span className="font-medium text-slate-700">Scanner 1 confidence health</span><span className="font-semibold text-amber-600">75% · needs attention</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-3/4 rounded-full bg-amber-500" /></div>
                <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>Current rolling average</span><span>Baseline 95%</span></div>
              </div>
            </div>
            <ValuePanel className={tone.soft} title="Predictive maintenance alert" items={["Confidence average dropped by 20%", "Clean Scanner 1 sensor glass", "Inspect hardware if confidence remains low"]} note="Proactive maintenance prevents a degraded reader from blocking employee clock-ins." />
          </CardContent>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500 shadow-sm">
        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#8642ED]" />
        <p><span className="font-semibold text-slate-700">Responsible use:</span> AI scores are decision-support signals, not automatic disciplinary decisions. HR should review context, approved leave, accessibility needs, and company policy before acting.</p>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return <div><h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon className="h-4 w-4 text-[#8642ED]" />{title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{children}</p></div>;
}

function Definition({ label, text }: { label: string; text: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><p className="text-xs font-semibold text-slate-800">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>;
}

function ValuePanel({ className, title, items, note }: { className: string; title: string; items: string[]; note: string }) {
  return <div className={cn("rounded-xl border p-5", className)}><p className="text-sm font-semibold text-slate-900">{title}</p><div className="mt-4 space-y-3">{items.map((item) => <div key={item} className="flex gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{item}</span></div>)}</div><p className="mt-5 border-t border-current/10 pt-4 text-xs leading-5 text-slate-600">{note}</p></div>;
}
