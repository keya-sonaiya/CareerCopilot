"use client";

import {
  AlertCircle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Copy,
  Database,
  FileSearch,
  FileText,
  Gauge,
  Globe,
  Lightbulb,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  apiBaseUrl,
  asString,
  formatScore,
  GENERATOR_STATE_KEY,
  getNestedValue,
} from "@/lib/app-utils";
import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";

type Summary = {
  status?: string;
  errors_count?: number;
  has_cover_letter?: boolean;
  recruiter_questions_answered?: number;
  overall_match_score?: number;
  required_skills_match?: number;
  is_good_match?: boolean;
  total_experience_years?: number;
  skills_count?: number;
  work_experiences_count?: number;
};

type RecruiterAnswer = {
  question: string;
  category: string;
  answer: string;
  confidence: number;
};

type SkillRequirement = {
  skill: string;
  importance: string;
  category: string;
  years_required?: number | null;
};

type MatchedRequirement = {
  requirement: SkillRequirement;
  resume_skill?: {
    name: string;
    category: string;
    proficiency_level: string;
    years_experience?: number | null;
  } | null;
  match_strength: number;
  gap_description?: string | null;
};

type SkillMatchAnalysis = {
  overall_match_score: number;
  required_skills_match_score: number;
  matched_requirements: MatchedRequirement[];
  unmatched_requirements: SkillRequirement[];
  skill_gaps: SkillRequirement[];
  transferable_skills: Array<{ name: string; proficiency_level?: string }>;
  recommendations: string[];
};

type CompanyResearch = {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  error?: string | null;
};

type ApplicationResponse = {
  status: string;
  processing_time_seconds: number | null;
  errors: string[];
  summary: Summary;
  cover_letter: Record<string, unknown> | null;
  cover_letter_text: string | null;
  recruiter_answers: RecruiterAnswer[];
  company_research: CompanyResearch | null;
  company_research_text: string | null;
  resume_rag_context: string | null;
  skill_match_analysis: SkillMatchAnalysis | null;
  parsed_resume: Record<string, unknown> | null;
  parsed_job_description: Record<string, unknown> | null;
};

type JobStep = {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  message: string;
  updated_at: string | null;
};

type JobStatusResponse = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  steps: JobStep[];
  result: ApplicationResponse | null;
  error: string | null;
  resume_file: Record<string, unknown> | null;
};

const TAB_KEYS = ["cover", "match", "company"] as const;

type TabKey = (typeof TAB_KEYS)[number];

const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "cover", label: "Cover Letter", icon: <FileText size={16} /> },
  { key: "match", label: "Skill Match", icon: <Gauge size={16} /> },
  { key: "company", label: "Company", icon: <Globe size={16} /> },
];

function normalizeTab(value?: string): TabKey {
  return TAB_KEYS.includes(value as TabKey) ? (value as TabKey) : "cover";
}

const GENERATOR_RUNTIME_ID = createGeneratorRuntimeId();

type StoredGeneratorState = {
  runtimeId?: string;
  jobDescriptionText?: string;
  enableCompanySearch?: boolean;
  jobSteps?: JobStep[];
  jobStatus?: JobStatusResponse["status"] | "idle";
  jobId?: string | null;
  result?: ApplicationResponse | null;
  activeTab?: string;
  resumeFileName?: string;
};

function readStoredGeneratorState(): StoredGeneratorState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(GENERATOR_STATE_KEY);
    return raw ? (JSON.parse(raw) as StoredGeneratorState) : {};
  } catch {
    return {};
  }
}

function createGeneratorRuntimeId() {
  if (typeof window === "undefined") {
    return "server";
  }

  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "amber" | "rose";
}) {
  const toneClass = {
    neutral: "border-stone-200 bg-white text-stone-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    rose: "border-rose-200 bg-rose-50 text-rose-950",
  }[tone];
  const barClass = {
    neutral: "bg-stone-300",
    green: "bg-emerald-500",
    amber: "bg-amber-400",
    rose: "bg-rose-500",
  }[tone];

  return (
    <div
      className={`relative overflow-hidden rounded-lg border px-3 py-2.5 pt-3 ${toneClass}`}
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${barClass}`} />
      <div className="text-[11px] font-medium uppercase tracking-normal text-stone-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-normal">{value}</div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-l-2 border-stone-200 border-l-stone-200 bg-white shadow-sm transition-colors focus-within:border-l-cyan-600">
      <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-950">
        <span className="text-cyan-700">{icon}</span>
        {title}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TextAreaField({
  label,
  icon,
  value,
  onChange,
  placeholder,
  required = false,
  minHeight = "min-h-[220px]",
}: {
  label: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  minHeight?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-950">
        <span className="text-cyan-700">{icon}</span>
        {label}
        {required ? <span className="text-rose-600">*</span> : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${minHeight} w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100`}
      />
    </label>
  );
}

function ScoreBar({ label, value }: { label: string; value?: number }) {
  const normalized = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="font-semibold text-stone-950">
          {formatScore(normalized)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-stone-100">
        <div
          className="h-2 rounded-full bg-cyan-600 transition-all"
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

function StepDot({ status }: { status: JobStep["status"] }) {
  const className = {
    pending: "border-stone-300 bg-white",
    running: "border-cyan-600 bg-cyan-50",
    completed: "border-emerald-600 bg-emerald-50",
    failed: "border-rose-600 bg-rose-50",
    skipped: "border-amber-500 bg-amber-50",
  }[status];

  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${className}`}
    >
      {status === "running" ? (
        <LoaderCircle className="animate-spin text-cyan-700" size={15} />
      ) : status === "completed" ? (
        <CheckCircle2 className="text-emerald-700" size={15} />
      ) : status === "failed" ? (
        <AlertCircle className="text-rose-700" size={15} />
      ) : (
        <span className="h-2 w-2 rounded-full bg-stone-300" />
      )}
    </span>
  );
}

function matchStrengthDotClass(value: number) {
  const score = value * 100;

  if (score > 80) {
    return "bg-emerald-500";
  }

  if (score >= 50) {
    return "bg-amber-400";
  }

  return "bg-rose-500";
}

function ProgressTimeline({
  steps,
  status,
  isExpanded,
  onToggle,
}: {
  steps: JobStep[];
  status: JobStatusResponse["status"] | "idle";
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!steps.length) {
    return null;
  }

  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const statusText =
    status === "completed"
      ? "Finished"
      : status === "failed"
        ? "Stopped"
        : "Working through the pipeline";
  const ToggleIcon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <section className="rounded-lg border border-l-2 border-stone-200 border-l-stone-200 bg-white shadow-sm transition-colors focus-within:border-l-cyan-600">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
            <span className="text-cyan-700">
              <FileSearch size={18} />
            </span>
            Run Steps
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {statusText} · {completedSteps}/{steps.length} completed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-normal text-stone-600">
            {status}
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:border-cyan-300 hover:text-cyan-800"
            aria-expanded={isExpanded}
          >
            <ToggleIcon size={14} />
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {isExpanded ? (
        <div className="p-5">
          {steps.map((step, index) => (
            <div key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
              {index < steps.length - 1 ? (
                <span className="absolute left-[13px] top-7 bottom-[-1px] w-px bg-stone-200" />
              ) : null}
              <div className="relative z-10">
                <StepDot status={step.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm font-semibold ${step.status === "completed"
                      ? "text-stone-500"
                      : "text-stone-950"
                      }`}
                  >
                    {step.label}
                  </p>
                  <span className="text-xs font-medium text-stone-500">
                    {step.status}
                  </span>
                </div>
                {step.message ? (
                  <p className="mt-1 text-sm leading-5 text-stone-600">
                    {step.message}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EmptyState() {
  const features = [
    {
      label: "Extract",
      description: "Parse resume and role text.",
      icon: <FileText size={16} />,
    },
    {
      label: "Retrieve",
      description: "Find relevant resume context.",
      icon: <Database size={16} />,
    },
    {
      label: "Search",
      description: "Gather company details.",
      icon: <Search size={16} />,
    },
    {
      label: "Write",
      description: "Draft the tailored response.",
      icon: <Sparkles size={16} />,
    },
  ];

  return (
    <div className="flex min-h-[480px] flex-col justify-between rounded-lg border border-dashed border-stone-300 bg-white p-6">
      <div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
          <Bot size={22} />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-normal text-stone-950">
          Ready for a resume and role brief.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">
          Upload a PDF, DOCX, or TXT resume, paste the role, and JobCopilot
          will retrieve resume excerpts, search company details, and return the
          complete response. After it finishes, continue into chat to ask
          follow-up questions or revise the letter.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {features.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-700"
          >
            <div className="flex items-center gap-2 font-semibold text-stone-950">
              <span className="text-cyan-700">{item.icon}</span>
              {item.label}
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-border-pulse rounded-lg border border-cyan-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
          <LoaderCircle className="animate-spin" size={22} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-stone-950">
            Building your application response
          </h2>
          <p className="text-sm text-stone-600">
            The step tracker updates as FastAPI moves through extraction, RAG,
            search, and writing.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultTabs({
  result,
  jobId,
  activeTab,
  setActiveTab,
}: {
  result: ApplicationResponse;
  jobId: string | null;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
}) {
  const resumeName = asString(
    getNestedValue(result.parsed_resume, ["personal_info", "name"]),
  );
  const company = asString(
    getNestedValue(result.parsed_job_description, ["company", "name"]),
  );
  const role = asString(getNestedValue(result.parsed_job_description, ["position"]));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={21} />
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-950">
                Response complete
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {resumeName} for {role} at {company}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-lg bg-stone-100 px-3 py-2 text-sm font-medium text-stone-700">
              {result.processing_time_seconds?.toFixed(1) ?? "0.0"}s
            </div>
            {jobId ? (
              <Link
                href={`/chat?jobId=${jobId}`}
                className="flex h-10 items-center gap-2 rounded-lg bg-stone-950 px-3 text-sm font-semibold text-white transition hover:bg-cyan-800"
              >
                <MessageSquareText size={16} />
                Continue to chat
                <ArrowRight size={15} />
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Metric
            label="Overall"
            value={`${formatScore(result.summary.overall_match_score)}%`}
            tone="green"
          />
          <Metric
            label="Required"
            value={`${formatScore(result.summary.required_skills_match)}%`}
            tone="green"
          />
          <Metric
            label="Experience"
            value={`${formatScore(result.summary.total_experience_years)} yrs`}
          />
          <Metric
            label="Chat"
            value={jobId ? "Ready" : "Open"}
            tone="amber"
          />
        </div>
      </div>

      {result.errors.length ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle size={18} />
            Errors
          </div>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-stone-200 bg-white px-2 pt-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            title={tab.label}
            aria-pressed={activeTab === tab.key}
            aria-label={tab.label}
            onClick={() => setActiveTab(tab.key)}
            className={`flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${activeTab === tab.key
              ? "border-cyan-600 text-stone-950"
              : "border-transparent text-stone-600 hover:text-stone-950"
              }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "cover" ? <CoverLetter result={result} /> : null}
      {activeTab === "match" ? <SkillMatch result={result} /> : null}
      {activeTab === "company" ? <CompanyDetails result={result} /> : null}
    </div>
  );
}

function CoverLetter({ result }: { result: ApplicationResponse }) {
  const [copied, setCopied] = useState(false);
  const text = result.cover_letter_text ?? "No cover letter was generated.";

  async function copyLetter() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Section title="Cover Letter" icon={<FileText size={18} />}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={copyLetter}
          title="Copy cover letter"
          className="flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:border-cyan-300 hover:text-cyan-800"
        >
          <Copy size={15} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <article className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm leading-[1.8] text-stone-800 shadow-inner">
        {text}
      </article>
    </Section>
  );
}

function SkillMatch({ result }: { result: ApplicationResponse }) {
  const analysis = result.skill_match_analysis;

  if (!analysis) {
    return (
      <Section title="Skill Match" icon={<Gauge size={18} />}>
        <p className="text-sm text-stone-600">No skill analysis was generated.</p>
      </Section>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Scores" icon={<Gauge size={18} />}>
        <div className="space-y-5">
          <ScoreBar label="Overall match" value={analysis.overall_match_score} />
          <ScoreBar
            label="Required skills"
            value={analysis.required_skills_match_score}
          />
        </div>
      </Section>

      <Section title="Matched Requirements" icon={<CheckCircle2 size={18} />}>
        <div className="space-y-3">
          {analysis.matched_requirements.slice(0, 8).map((match) => (
            <div
              key={`${match.requirement.skill}-${match.resume_skill?.name}`}
              className="rounded-lg border border-stone-200 bg-stone-50 p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-stone-950">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle">
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${matchStrengthDotClass(
                          match.match_strength,
                        )}`}
                      />
                    </span>
                    {match.requirement.skill}
                  </div>
                  <div className="mt-1 text-sm text-stone-600">
                    Resume match: {match.resume_skill?.name ?? "Not mapped"}
                  </div>
                </div>
                <div className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-cyan-800">
                  {formatScore(match.match_strength * 100)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recommendations" icon={<Sparkles size={18} />}>
        <ul className="space-y-2">
          {analysis.recommendations.map((recommendation) => (
            <li
              key={recommendation}
              className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950"
            >
              <Lightbulb className="mt-1 shrink-0 text-amber-600" size={15} />
              <span>{recommendation}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function CompanyDetails({ result }: { result: ApplicationResponse }) {
  const research = result.company_research;

  return (
    <Section title="Company Research" icon={<Globe size={18} />}>
      {!research ? (
        <p className="text-sm text-stone-600">Company search was disabled.</p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-700">
            Query: <span className="font-semibold text-stone-950">{research.query}</span>
          </div>
          {research.error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              {research.error}
            </div>
          ) : null}
          {research.results.map((item) => (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-stone-200 bg-white p-4 transition hover:border-cyan-300 hover:shadow-sm"
            >
              <div className="font-semibold text-stone-950">{item.title}</div>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {item.snippet || item.url}
              </p>
              <p className="mt-2 truncate text-xs font-medium text-cyan-700">
                {item.url}
              </p>
            </a>
          ))}
        </div>
      )}
    </Section>
  );
}

export default function Home() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [enableCompanySearch, setEnableCompanySearch] = useState(true);
  const [jobSteps, setJobSteps] = useState<JobStep[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse["status"] | "idle">(
    "idle",
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<ApplicationResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("cover");
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [shouldScrollToResult, setShouldScrollToResult] = useState(false);
  const [areStepsExpanded, setAreStepsExpanded] = useState(false);
  const resultsRef = useRef<HTMLElement | null>(null);
  const resultContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const navigationEntry = performance
        .getEntriesByType("navigation")
        .at(0) as PerformanceNavigationTiming | undefined;
      const legacyNavigation = performance.navigation;
      const isReloadNavigation =
        navigationEntry?.type === "reload" || legacyNavigation?.type === 1;
      const storedState = readStoredGeneratorState();
      const isStaleReloadState =
        isReloadNavigation && storedState.runtimeId !== GENERATOR_RUNTIME_ID;

      if (isStaleReloadState) {
        window.sessionStorage.removeItem(GENERATOR_STATE_KEY);
        setHasHydrated(true);
        return;
      }

      setResumeFileName(storedState.resumeFileName ?? "");
      setJobDescriptionText(storedState.jobDescriptionText ?? "");
      setEnableCompanySearch(storedState.enableCompanySearch ?? true);
      setJobSteps(storedState.jobSteps ?? []);
      setJobStatus(storedState.jobStatus ?? "idle");
      setJobId(storedState.jobId ?? null);
      setResult(storedState.result ?? null);
      setActiveTab(normalizeTab(storedState.activeTab));
      setAreStepsExpanded(!storedState.result && Boolean(storedState.jobSteps?.length));
      setHasHydrated(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    const nextState: StoredGeneratorState = {
      runtimeId: GENERATOR_RUNTIME_ID,
      jobDescriptionText,
      enableCompanySearch,
      jobSteps,
      jobStatus,
      jobId,
      result,
      activeTab,
      resumeFileName,
    };
    window.sessionStorage.setItem(
      GENERATOR_STATE_KEY,
      JSON.stringify(nextState),
    );
  }, [
    hasHydrated,
    activeTab,
    enableCompanySearch,
    jobDescriptionText,
    jobId,
    jobStatus,
    jobSteps,
    result,
    resumeFileName,
  ]);

  function scrollToResult() {
    const target = resultContentRef.current ?? resultsRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (!result || !shouldScrollToResult) {
      return;
    }
    window.requestAnimationFrame(() => {
      scrollToResult();
      setShouldScrollToResult(false);
    });
  }, [result, shouldScrollToResult]);

  async function pollJob(jobId: string) {
    for (let attempt = 0; attempt < 480; attempt += 1) {
      const response = await fetch(`${apiBaseUrl()}/api/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error("Could not read job progress.");
      }

      const payload = (await response.json()) as JobStatusResponse;
      setJobSteps(payload.steps);
      setJobStatus(payload.status);

      if (payload.status === "completed" && payload.result) {
        setResult(payload.result);
        setAreStepsExpanded(false);
        return;
      }

      if (payload.status === "failed") {
        throw new Error(payload.error ?? "The application job failed.");
      }

      await delay(1200);
    }

    throw new Error("Timed out while waiting for the application response.");
  }

  function handleResumeFile(file: File | null) {
    setResumeFile(file);
    setResumeFileName(file?.name ?? "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!resumeFile) {
      setError("Upload a PDF, DOCX, or TXT resume before submitting.");
      return;
    }

    if (jobDescriptionText.trim().length < 20) {
      setError("Add the job description text before submitting.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setJobId(null);
    setJobSteps([]);
    setJobStatus("queued");
    setActiveTab("cover");
    setShouldScrollToResult(true);
    setAreStepsExpanded(true);

    try {
      const formData = new FormData();
      formData.append("job_description_text", jobDescriptionText);
      formData.append("enable_company_search", String(enableCompanySearch));
      formData.append("resume_file", resumeFile);

      const response = await fetch(`${apiBaseUrl()}/api/jobs`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Request failed.");
      }

      const { job_id: jobId } = (await response.json()) as { job_id: string };
      setJobId(jobId);
      await pollJob(jobId);
    } catch (requestError) {
      setShouldScrollToResult(false);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to process this application.",
      );
      setJobStatus("failed");
    } finally {
      setIsLoading(false);
    }
  }

  function reset() {
    setResumeFile(null);
    setResumeFileName("");
    setIsDraggingResume(false);
    setJobDescriptionText("");
    setEnableCompanySearch(true);
    setJobSteps([]);
    setJobStatus("idle");
    setJobId(null);
    setResult(null);
    setError("");
    setActiveTab("cover");
    setShouldScrollToResult(false);
    setAreStepsExpanded(false);
    window.sessionStorage.removeItem(GENERATOR_STATE_KEY);
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-white">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-normal">
                JobCopilot
              </h1>
              <p className="text-sm text-stone-500">
                Resume RAG, company search, and application writing
              </p>
            </div>
          </div>
          <div className="hidden items-center border-l border-stone-200 pl-4 md:flex">
            <div className="flex overflow-hidden rounded-lg border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-600 divide-x divide-stone-200">
              {["FastAPI", "Next.js", "Ollama", "RAG"].map((label) => (
                <span key={label} className="px-3 py-2">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)] lg:gap-6 lg:px-8">
        <form onSubmit={submit} className="space-y-4">
          <Section title="Application Brief" icon={<MessageSquareText size={18} />}>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-950">
                  <span className="text-cyan-700">
                    <Upload size={17} />
                  </span>
                  Resume document
                </span>
                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDraggingResume(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingResume(true);
                  }}
                  onDragLeave={() => setIsDraggingResume(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDraggingResume(false);
                    const file = event.dataTransfer.files?.[0] ?? null;
                    handleResumeFile(file);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition ${isDraggingResume
                    ? "border-cyan-500 bg-cyan-50 text-cyan-900"
                    : "border-stone-200 bg-stone-50 text-stone-600 hover:border-cyan-300 hover:bg-cyan-50/60"
                    }`}
                >
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      handleResumeFile(file);
                    }}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-2 font-semibold text-stone-950">
                    <Upload size={18} className="text-cyan-700" />
                    Drag and drop or click to upload
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    PDF, DOCX, or TXT.
                  </p>
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  Required. Supports PDF, DOCX, and TXT.
                  {resumeFileName && !resumeFile
                    ? ` Last used: ${resumeFileName}. Re-upload only if you want to generate again.`
                    : null}
                </p>
                {resumeFileName ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
                    <Paperclip className="shrink-0 text-cyan-700" size={15} />
                    <span className="truncate">{resumeFileName}</span>
                  </div>
                ) : null}
              </label>

              <div>
                <TextAreaField
                  label="Job Description"
                  icon={<BriefcaseBusiness size={17} />}
                  value={jobDescriptionText}
                  onChange={setJobDescriptionText}
                  required
                  placeholder="Paste the role description here"
                />
                <p className="mt-2 text-right text-xs text-stone-400">
                  {jobDescriptionText.length.toLocaleString()} characters
                </p>
              </div>
              <label className="flex cursor-pointer select-none items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                  <Search className="text-cyan-700" size={17} />
                  Online company search
                </span>
                <input
                  type="checkbox"
                  checked={enableCompanySearch}
                  onChange={(event) => setEnableCompanySearch(event.target.checked)}
                  className="h-5 w-5 accent-cyan-700"
                />
              </label>
            </div>
          </Section>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-950">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 shrink-0" size={17} />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <div className="flex w-full gap-3">
            <button
              type="submit"
              disabled={isLoading}
              title="Generate application response"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {isLoading ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <Send size={17} />
              )}
              {isLoading ? "Working" : "Generate"}
            </button>
            <button
              type="button"
              onClick={reset}
              title="Reset"
              className="flex h-11 w-12 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 transition hover:border-rose-200 hover:text-rose-700"
            >
              <RotateCcw size={17} />
            </button>
          </div>
        </form>

        <section
          ref={resultsRef}
          className="min-w-0 space-y-4 scroll-mt-24 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1"
        >
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-stone-600">
            <div className="flex items-center gap-2">
              <Bot size={17} />
              Assistant Reply
            </div>
          </div>

          {isLoading ? <LoadingState /> : null}
          {!isLoading && !result && !jobSteps.length ? <EmptyState /> : null}
          {jobSteps.length ? (
            <ProgressTimeline
              steps={jobSteps}
              status={jobStatus}
              isExpanded={areStepsExpanded}
              onToggle={() => setAreStepsExpanded((current) => !current)}
            />
          ) : null}
          {!isLoading && result ? (
            <div ref={resultContentRef} className="scroll-mt-24">
              <ResultTabs
                result={result}
                jobId={jobId}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
