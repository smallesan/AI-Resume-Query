"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatMessage,
  ChatResponse,
  JobFitResponse,
  ResumeExperience,
  ResumePatent,
} from "@/lib/types";

type ChatAppProps = {
  experiences: ResumeExperience[];
  patents: ResumePatent[];
  suggestedQuestions: string[];
  resumeName: string;
  linkedInUrl?: string;
};

type UiMessage = ChatMessage & { id: string };

const FALLBACK_MESSAGE =
  "Sorry — I’m having trouble retrieving that right now. Please try again in a moment.";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatResumeDate(value: string) {
  if (!value) {
    return "";
  }
  if (value.toLowerCase() === "present") {
    return "Present";
  }
  const [year, month] = value.split("-");
  const monthIndex = Number(month) - 1;
  if (!year || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return value;
  }
  return `${MONTHS[monthIndex]} ${year}`;
}

function formatResumeRange(start: string, end: string) {
  const startLabel = formatResumeDate(start);
  const endLabel = formatResumeDate(end);
  if (!startLabel && !endLabel) {
    return "";
  }
  if (!endLabel) {
    return startLabel;
  }
  if (!startLabel) {
    return endLabel;
  }
  return `${startLabel} - ${endLabel}`;
}

function buildPatentUrl(number: string): string {
  const clean = number.replace(/^US\s*/i, "").replace(/[,\s]/g, "");
  return `https://patents.google.com/patent/US${clean}/en`;
}

const DEFAULT_VISIBLE_ROLES = 3;

function limitRoles(
  groups: Array<{ company: string; roles: ResumeExperience[] }>,
  maxRoles: number,
) {
  if (maxRoles <= 0) {
    return [];
  }
  let remaining = maxRoles;
  return groups.reduce<Array<{ company: string; roles: ResumeExperience[] }>>(
    (acc, group) => {
      if (remaining <= 0) {
        return acc;
      }
      const roles = group.roles.slice(0, remaining);
      if (roles.length > 0) {
        acc.push({ company: group.company, roles });
        remaining -= roles.length;
      }
      return acc;
    },
    [],
  );
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-slate-700 px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded bg-slate-700 p-3 font-mono text-xs">{children}</pre>
  ),
  h1: ({ children }) => <h1 className="mb-2 text-base font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-sm font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} className="underline" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs text-slate-100">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-900/70 text-slate-200">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="border border-slate-800 px-3 py-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-800 px-3 py-2 align-top">{children}</td>
  ),
};

export default function ChatApp({
  experiences,
  patents,
  suggestedQuestions,
  linkedInUrl,
  resumeName,
}: ChatAppProps) {
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      content:
        `Hi! Ask me anything about ${resumeName}'s resume, experience, or skills.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [jobFitResult, setJobFitResult] = useState<string | null>(null);
  const [jobFitError, setJobFitError] = useState<string | null>(null);
  const [jobFitLoading, setJobFitLoading] = useState(false);
  const [expandedBulletId, setExpandedBulletId] = useState<string | null>(null);
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [showAllPatents, setShowAllPatents] = useState(false);
  const [expandedPatentNumbers, setExpandedPatentNumbers] = useState<Set<string>>(new Set());

  const history = useMemo(
    () =>
      messages
        .filter((message) => message.role !== "system")
        .map(({ role, content }) => ({ role, content }))
        .slice(-10),
    [messages],
  );

  async function sendMessage(message: string, bulletId?: string) {
    const trimmed = message.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const nextUserMessage: UiMessage = {
      id: makeId(),
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, nextUserMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          bulletId: bulletId ?? null,
        }),
      });

      const data = (await response.json()) as ChatResponse;
      const content = data.message?.trim() || FALLBACK_MESSAGE;
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content },
      ]);
    } catch (error) {
      console.error("Chat request failed", error);
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: FALLBACK_MESSAGE },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
    setInput("");
  }

  function handleSuggested(question: string) {
    void sendMessage(question);
  }

  async function handleJobFitSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = jobDescription.trim();
    if (!trimmed || jobFitLoading) {
      return;
    }

    setJobFitLoading(true);
    setJobFitError(null);
    setJobFitResult(null);

    try {
      const response = await fetch("/api/job-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: trimmed }),
      });

      const data = (await response.json()) as JobFitResponse;
      const content = data.message?.trim();
      if (!content) {
        throw new Error("Job fit response missing content");
      }
      setJobFitResult(content);
    } catch (error) {
      console.error("Job fit request failed", error);
      setJobFitError(
        "Sorry — I’m having trouble retrieving that right now. Please try again in a moment.",
      );
    } finally {
      setJobFitLoading(false);
    }
  }

  const groupedExperiences = useMemo(() => {
    const grouped = new Map<string, ResumeExperience[]>();
    experiences.forEach((experience) => {
      const current = grouped.get(experience.company) ?? [];
      current.push(experience);
      grouped.set(experience.company, current);
    });
    return Array.from(grouped, ([company, roles]) => ({ company, roles }));
  }, [experiences]);

  const visibleGroups = useMemo(() => {
    if (showAllRoles) {
      return groupedExperiences;
    }
    return limitRoles(groupedExperiences, DEFAULT_VISIBLE_ROLES);
  }, [groupedExperiences, showAllRoles]);

  const DEFAULT_VISIBLE_PATENTS = 5;

  const visiblePatents = useMemo(() => {
    if (showAllPatents) return patents;
    return patents.slice(0, DEFAULT_VISIBLE_PATENTS);
  }, [patents, showAllPatents]);

  function togglePatentDescription(number: string) {
    setExpandedPatentNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
          <h1 className="text-2xl font-semibold">Resume Agent</h1>
          <p className="text-sm text-slate-300">
            Ask about {resumeName}&apos;s experience and get grounded, concise responses from an AI agent.
          </p>
          {linkedInUrl && (
            <a
              href={linkedInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1.5 text-xs text-blue-400 transition hover:text-blue-300"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
              LinkedIn Profile
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6">
        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold">Job Fit Analysis</h2>
            <p className="mt-1 text-xs text-slate-400">
              Paste a job description to see a honest fit feedback and a skills matrix, based on my job history.
            </p>
            <form onSubmit={handleJobFitSubmit} className="mt-4 space-y-3">
              <textarea
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the full job description here..."
                className="h-40 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                maxLength={6000}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-70"
                  disabled={jobFitLoading}
                >
                  {jobFitLoading && (
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  )}
                  {jobFitLoading ? "Analyzing..." : "Analyze Job Fit"}
                </button>
                <span className="text-xs text-slate-500">
                  {jobDescription.length}/6000
                </span>
              </div>
            </form>
            {jobFitError && (
              <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {jobFitError}
              </div>
            )}
            {jobFitResult && (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {jobFitResult}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </section>

        <section className="flex h-[480px] flex-col rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 px-6 py-4">
            <h2 className="text-lg font-semibold">Ask more about Santosh</h2>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-slate-800 text-slate-100"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-slate-200">
                  Thinking
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                  </span>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-800 px-6 py-4"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about roles, achievements, or skills..."
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                maxLength={1000}
              />
              <button
                type="submit"
                className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-400"
                disabled={isLoading}
              >
                Send
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => handleSuggested(question)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-blue-400 hover:text-white"
                >
                  {question}
                </button>
              ))}
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Resume</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Roles are grouped by employer. Click a bullet to see the story.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllRoles((prev) => !prev)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-blue-400 hover:text-white"
              >
                {showAllRoles ? "Show fewer roles" : "Show full history"}
              </button>
            </div>
          </div>
          <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            {visibleGroups.map((group) => (
              <div key={group.company} className="space-y-4">
                <h3 className="text-base font-semibold text-slate-100">
                  {group.company}
                </h3>
                {group.roles.map((role) => (
                  <div key={`${group.company}-${role.role}`} className="space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2 text-sm font-medium text-slate-300">
                      <span>{role.role}</span>
                      <span className="text-xs font-normal text-slate-400">
                        {formatResumeRange(role.start, role.end)}
                      </span>
                    </div>
                    <ul className="space-y-2 text-sm text-slate-200">
                      {role.bullets.map((bullet) => (
                        <li
                          key={bullet.id}
                          className="flex items-start gap-3 pl-3"
                        >
                          <span className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-slate-500" />
                          <div className="flex-1">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedBulletId((prev) =>
                                  prev === bullet.id ? null : bullet.id,
                                )
                              }
                              className="text-left underline decoration-slate-500/60 underline-offset-4 transition hover:text-blue-200"
                            >
                              {bullet.text}
                            </button>
                            {expandedBulletId === bullet.id && bullet.story && (
                              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300 whitespace-pre-wrap">
                                {bullet.story}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* Patents section — hidden until ready; set SHOW_PATENTS=true to enable */}
        {false && <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Patents</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {patents.length} granted patents. Click a title to read the abstract.
                </p>
              </div>
              {patents.length > DEFAULT_VISIBLE_PATENTS && (
                <button
                  type="button"
                  onClick={() => setShowAllPatents((prev) => !prev)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-blue-400 hover:text-white"
                >
                  {showAllPatents ? "Show fewer patents" : `Show all ${patents.length} patents`}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            {visiblePatents.map((patent) => {
              const isExpanded = expandedPatentNumbers.has(patent.number);
              return (
                <div
                  key={patent.number}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <a
                      href={buildPatentUrl(patent.number)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-blue-500/15 px-2 py-0.5 font-mono text-xs text-blue-400 ring-1 ring-blue-500/30 transition hover:bg-blue-500/25 hover:text-blue-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{patent.number}
                    </a>
                    {patent.year && patent.year !== "TODO" && (
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                        {patent.year}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePatentDescription(patent.number)}
                    className="w-full text-left text-sm font-medium text-slate-100 transition hover:text-blue-300"
                  >
                    <span className="flex items-start gap-2">
                      <svg
                        className={`mt-0.5 h-4 w-4 flex-none text-slate-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      {patent.title}
                    </span>
                  </button>
                  {isExpanded && patent.description && (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs leading-relaxed text-slate-300">
                      {patent.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>}
      </main>
    </div>
  );
}
