"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Copy,
  FileText,
  Gauge,
  Globe,
  LoaderCircle,
  MessageSquareText,
  Send,
  UserRound,
} from "lucide-react";
import {
  apiBaseUrl,
  asString,
  formatScore,
  GENERATOR_STATE_KEY,
  getNestedValue,
} from "@/lib/app-utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FormEvent,
  ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  cover_letter_updated?: boolean;
  cover_letter_text?: string;
  suggestions?: string[];
  web_search?: WebSearch | null;
};

type WebSearch = {
  query: string;
  results: {
    title: string;
    url: string;
    snippet: string;
  }[];
  error?: string | null;
};

type ApplicationResponse = {
  status: string;
  summary: {
    overall_match_score?: number;
    required_skills_match?: number;
    total_experience_years?: number;
  };
  cover_letter_text: string | null;
  company_research_text: string | null;
  resume_rag_context: string | null;
  parsed_resume: Record<string, unknown> | null;
  parsed_job_description: Record<string, unknown> | null;
};

type JobStatusResponse = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  result: ApplicationResponse | null;
  error: string | null;
  chat_history: ChatMessage[];
  latest_cover_letter: string | null;
};

type ChatResponse = {
  reply: string;
  cover_letter_text: string | null;
  cover_letter_updated: boolean;
  suggestions: string[];
  messages: ChatMessage[];
  web_search?: WebSearch | null;
};

const initialSuggestions = [
  "How can this cover letter be more concise?",
  "Why am I a strong fit for this role?",
  "Where can we add more company-specific detail?",
];

function normalizeSuggestions(value: unknown) {
  if (!Array.isArray(value)) {
    return initialSuggestions;
  }

  const suggestions = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 3);

  return suggestions.length === 3 ? suggestions : initialSuggestions;
}

function updateStoredGeneratorCoverLetter(jobId: string, coverLetterText: string) {
  if (typeof window === "undefined" || !coverLetterText) {
    return;
  }

  try {
    const raw = window.sessionStorage.getItem(GENERATOR_STATE_KEY);
    if (!raw) {
      return;
    }

    const stored = JSON.parse(raw) as {
      jobId?: string | null;
      result?: { cover_letter_text?: string | null } | null;
    };
    if (stored.jobId !== jobId || !stored.result) {
      return;
    }

    stored.result.cover_letter_text = coverLetterText;
    window.sessionStorage.setItem(GENERATOR_STATE_KEY, JSON.stringify(stored));
  } catch {
    return;
  }
}

function ContextChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 shadow-sm">
      <span className="text-cyan-700">{icon}</span>
      <span className="text-stone-500">{label}</span>
      <span className="text-stone-950">{value}</span>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-stone-100 text-sm font-semibold text-stone-600">
          <LoaderCircle className="mr-2 animate-spin text-cyan-700" size={20} />
          Loading chat
        </main>
      }
    >
      <ChatWorkspace />
    </Suspense>
  );
}

function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  const linkClass = isUser
    ? "font-semibold text-cyan-100 underline underline-offset-2"
    : "font-semibold text-cyan-700 underline underline-offset-2 hover:text-cyan-900";
  const codeClass = isUser
    ? "rounded bg-white/15 px-1.5 py-0.5 font-mono text-[0.88em] text-white"
    : "rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.88em] text-stone-950";
  const blockquoteClass = isUser
    ? "my-3 border-l-2 border-white/40 pl-3 text-white/90"
    : "my-3 border-l-2 border-cyan-200 pl-3 text-stone-700";

  const components: Components = {
    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => (
      <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        {children}
      </a>
    ),
    code: ({ children }) => <code className={codeClass}>{children}</code>,
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-lg bg-stone-950 p-3 text-xs leading-5 text-stone-50">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className={blockquoteClass}>{children}</blockquote>
    ),
    h1: ({ children }) => (
      <h1 className="mb-2 text-lg font-semibold leading-7">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-2 text-base font-semibold leading-7">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-2 text-sm font-semibold leading-6">{children}</h3>
    ),
    table: ({ children }) => (
      <table className="my-3 w-full border-collapse text-left text-xs">{children}</table>
    ),
    th: ({ children }) => (
      <th className="border border-stone-200 bg-stone-50 px-2 py-1 font-semibold text-stone-950">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-stone-200 px-2 py-1 align-top">{children}</td>
    ),
    hr: () => <hr className="my-4 border-stone-200" />,
  };

  return (
    <div className="break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
          <Bot size={16} />
        </div>
      ) : null}
      <div
        className={`max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${isUser
          ? "bg-stone-950 text-white"
          : "border border-stone-200 bg-white text-stone-800"
          }`}
      >
        <MarkdownContent content={message.content} isUser={isUser} />
        {message.cover_letter_updated ? (
          <div className="mt-3 flex w-fit items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={14} />
            Cover letter updated
          </div>
        ) : null}
        {message.web_search ? (
          <div className="mt-3 max-w-full rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1.5 text-xs font-semibold text-cyan-800">
            <div className="flex min-w-0 items-center gap-1.5">
              <Globe className="shrink-0" size={14} />
              <span className="truncate">
                Searched: {message.web_search.query || "online"}
              </span>
            </div>
            {message.web_search.error ? (
              <div className="mt-1 break-words font-medium text-cyan-900">
                {message.web_search.error}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white ring-1 ring-stone-700">
          <UserRound size={15} />
        </div>
      ) : null}
    </div>
  );
}

function ChatWorkspace() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [result, setResult] = useState<ApplicationResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coverLetterText, setCoverLetterText] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [copied, setCopied] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [coverLetterFlash, setCoverLetterFlash] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const displayError =
    error || (!jobId ? "Generate an application first, then continue to chat." : "");
  const displayLoading = Boolean(jobId && isLoading);

  const candidate = asString(
    getNestedValue(result?.parsed_resume ?? null, ["personal_info", "name"]),
  );
  const company = asString(
    getNestedValue(result?.parsed_job_description ?? null, ["company", "name"]),
  );
  const role = asString(
    getNestedValue(result?.parsed_job_description ?? null, ["position"]),
  );

  useEffect(() => {
    if (!jobId) {
      return;
    }
    const currentJobId = jobId;

    async function loadJob() {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/jobs/${currentJobId}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail ?? "Could not load this application.");
        }

        const payload = (await response.json()) as JobStatusResponse;
        if (payload.status !== "completed" || !payload.result) {
          throw new Error("This application is not ready for chat yet.");
        }

        setResult(payload.result);
        const latestCoverLetter =
          payload.latest_cover_letter ?? payload.result.cover_letter_text ?? "";
        setCoverLetterText(latestCoverLetter);
        updateStoredGeneratorCoverLetter(currentJobId, latestCoverLetter);
        setMessages(
          payload.chat_history.length
            ? payload.chat_history
            : [
              {
                role: "assistant",
                content:
                  "I have the resume, job description, company research, retrieved resume excerpts, skill match, and current cover letter in memory. What would you like to adjust?",
              },
            ],
        );
        const lastAssistantWithSuggestions = [...payload.chat_history]
          .reverse()
          .find((message) => message.role === "assistant" && message.suggestions);
        setSuggestions(normalizeSuggestions(lastAssistantWithSuggestions?.suggestions));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load this chat.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadJob();
  }, [jobId]);

  function handleMessageScroll() {
    const messagePane = messagesRef.current;
    if (!messagePane) {
      return;
    }
    const threshold = 120;
    const atBottom =
      messagePane.scrollHeight - messagePane.scrollTop - messagePane.clientHeight <=
      threshold;
    const nextShow = !atBottom;
    setShowScrollToLatest((current) => (current === nextShow ? current : nextShow));
  }

  function scrollToLatest() {
    const messagePane = messagesRef.current;
    if (!messagePane) {
      return;
    }
    messagePane.scrollTo({ top: messagePane.scrollHeight, behavior: "smooth" });
    setShowScrollToLatest(false);
  }

  useEffect(() => {
    const messagePane = messagesRef.current;
    if (!messagePane) {
      return;
    }
    if (showScrollToLatest) {
      return;
    }
    messagePane.scrollTo({
      top: messagePane.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending, showScrollToLatest]);

  useEffect(() => {
    if (!coverLetterText) {
      return;
    }
    const startTimeout = window.setTimeout(() => setCoverLetterFlash(true), 0);
    const endTimeout = window.setTimeout(() => setCoverLetterFlash(false), 650);

    return () => {
      window.clearTimeout(startTimeout);
      window.clearTimeout(endTimeout);
    };
  }, [coverLetterText]);

  async function sendMessage(event?: FormEvent<HTMLFormElement>, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || !jobId || isSending) {
      return;
    }

    setInput("");
    setError("");
    setIsSending(true);
    const optimisticMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: message },
    ];
    setMessages(optimisticMessages);

    try {
      const response = await fetch(`${apiBaseUrl()}/api/jobs/${jobId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          cover_letter_text: coverLetterText,
          enable_web_search: enableWebSearch,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Chat request failed.");
      }

      const payload = (await response.json()) as ChatResponse;
      setMessages(payload.messages);
      setSuggestions(normalizeSuggestions(payload.suggestions));
      if (payload.cover_letter_text) {
        setCoverLetterText(payload.cover_letter_text);
        updateStoredGeneratorCoverLetter(jobId, payload.cover_letter_text);
      }
    } catch (sendError) {
      const messageText =
        sendError instanceof Error
          ? sendError.message
          : "Unable to send this message.";
      setError(messageText);
      setMessages([
        ...optimisticMessages,
        { role: "assistant", content: messageText },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function copyLetter() {
    await navigator.clipboard.writeText(coverLetterText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-white">
              <MessageSquareText size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-normal">
                JobCopilot Chat
              </h1>
              <p className="text-sm text-stone-500">
                Ask follow-up questions and revise the current cover letter
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="flex h-10 w-fit items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:border-cyan-300 hover:text-cyan-800"
          >
            <ArrowLeft size={16} />
            Back to generator
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6 lg:px-8">
        <section className="flex h-[calc(100vh-132px)] min-h-[620px] min-h-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-50 shadow-sm">
          <div className="flex min-w-0 flex-1 min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                <Bot className="text-cyan-700" size={18} />
                Conversation
              </div>
              {isSending ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700">
                  <LoaderCircle className="animate-spin" size={15} />
                  {enableWebSearch ? "Searching web" : "Thinking"}
                </div>
              ) : null}
            </div>
            <div className="border-b border-stone-200 bg-stone-50 px-4 py-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <ContextChip
                  icon={<UserRound size={13} />}
                  label="Name"
                  value={candidate}
                />
                <ContextChip
                  icon={<BriefcaseBusiness size={13} />}
                  label="Role"
                  value={role}
                />
                <ContextChip
                  icon={<Globe size={13} />}
                  label="Company"
                  value={company}
                />
                <ContextChip
                  icon={<Gauge size={13} />}
                  label="Match"
                  value={`${formatScore(result?.summary.overall_match_score)}%`}
                />
              </div>
            </div>

            {displayLoading ? (
              <div className="flex min-h-[460px] items-center justify-center">
                <div className="flex items-center gap-3 text-sm font-semibold text-stone-600">
                  <LoaderCircle className="animate-spin text-cyan-700" size={20} />
                  Loading chat memory
                </div>
              </div>
            ) : (
              <>
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div
                    ref={messagesRef}
                    onScroll={handleMessageScroll}
                    className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-5"
                  >
                    {messages.map((message, index) => (
                      <ChatBubble key={`${message.role}-${index}`} message={message} />
                    ))}
                    {displayError ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-medium text-rose-950">
                        <div className="flex gap-2">
                          <AlertCircle className="mt-0.5 shrink-0" size={17} />
                          <span>{displayError}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {showScrollToLatest ? (
                    <button
                      type="button"
                      onClick={scrollToLatest}
                      className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:border-cyan-300 hover:text-cyan-800 active:scale-95"
                      aria-label="Scroll to latest"
                      title="Scroll to latest"
                    >
                      <ArrowDown size={14} />
                      Latest
                    </button>
                  ) : null}
                </div>

                <div className="shrink-0 border-t border-stone-200 bg-white p-3">
                  <div className="mb-3 grid gap-2 md:grid-cols-3">
                    {suggestions.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => void sendMessage(undefined, preset)}
                        disabled={isSending || displayLoading || !jobId}
                        className="min-h-12 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs font-semibold leading-5 text-stone-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900 disabled:cursor-not-allowed disabled:text-stone-400"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={sendMessage} className="flex gap-2">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Ask a question or request a cover letter change"
                      rows={2}
                      className="min-h-[52px] flex-1 resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm leading-5 text-stone-900 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                    <button
                      type="button"
                      onClick={() => setEnableWebSearch((current) => !current)}
                      disabled={isSending || !jobId}
                      aria-pressed={enableWebSearch}
                      className={`flex h-[52px] w-12 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 ${enableWebSearch
                        ? "border-cyan-500 bg-cyan-50 text-cyan-800 ring-4 ring-cyan-100"
                        : "border-stone-200 bg-white text-stone-600 hover:border-cyan-300 hover:text-cyan-800"
                        }`}
                      title={enableWebSearch ? "Online search on" : "Online search off"}
                    >
                      <Globe size={17} />
                    </button>
                    <button
                      type="submit"
                      disabled={isSending || !input.trim() || !jobId}
                      className="flex h-[52px] w-12 shrink-0 items-center justify-center rounded-lg bg-stone-950 text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                      title="Send message"
                    >
                      {isSending ? (
                        <LoaderCircle className="animate-spin" size={17} />
                      ) : (
                        <Send size={17} />
                      )}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </section>

        <aside
          className={`flex h-[calc(100vh-132px)] min-h-[620px] flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm ${coverLetterFlash ? "cover-letter-flash" : ""
            }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-950">
              <FileText className="text-cyan-700" size={18} />
              Live Cover Letter
            </div>
            <button
              type="button"
              onClick={copyLetter}
              disabled={!coverLetterText}
              className="flex h-9 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:border-cyan-300 hover:text-cyan-800 disabled:cursor-not-allowed disabled:text-stone-400"
            >
              <Copy size={15} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <article className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm leading-7 text-stone-800">
            {coverLetterText || "No cover letter is available yet."}
          </article>
        </aside>
      </div>
    </main>
  );
}
