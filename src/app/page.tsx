import type { Metadata } from "next";
import ChatApp from "@/components/ChatApp";
import { getResumeData } from "@/lib/resume";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  try {
    const resume = getResumeData();
    return {
      title: `AI Resume Agent | ${resume.name}`,
      description: `Ask questions about ${resume.name}'s resume and job history.`,
    };
  } catch {
    return {
      title: "AI Resume Agent",
      description: "Ask questions about a resume and job history.",
    };
  }
}

export default function Home() {
  let resume;
  let errorMessage: string | undefined;

  try {
    resume = getResumeData();
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "No resume loaded, please add a resume json file to /data directory.";
  }

  if (!resume) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-5 text-sm">
          {errorMessage}
        </div>
      </div>
    );
  }

  const suggestedQuestions = Array.isArray(resume.suggestedQuestions)
    ? resume.suggestedQuestions
    : [];

  return (
    <ChatApp
      experiences={resume.experience}
      patents={resume.patents ?? []}
      suggestedQuestions={suggestedQuestions}
      resumeName={resume.name}
      linkedInUrl={resume.links?.find((l) => l.label === "LinkedIn")?.url}
    />
  );
}
