import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProvider } from "@/lib/llm";
import type { JobFitRequest, JobFitResponse } from "@/lib/types";
import { getResumeData } from "@/lib/resume";
import { rateLimit } from "@/lib/rateLimit";

const MAX_JOB_DESCRIPTION_LENGTH = 6000;
const RATE_LIMIT = { intervalMs: 60_000, limit: 10 };
const RESUME_LOAD_ERROR =
  "No resume loaded, please add a resume json file to /data directory.";

const FALLBACK_MESSAGE =
  "Sorry — I’m having trouble retrieving that right now. Please try again in a moment.";

function sanitizeText(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function parseRequestBody(body: unknown): JobFitRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid JSON body");
  }

  const jobDescription = (body as { jobDescription?: unknown }).jobDescription;

  if (typeof jobDescription !== "string") {
    throw new Error("jobDescription is required");
  }

  const sanitizedDescription = sanitizeText(jobDescription).slice(
    0,
    MAX_JOB_DESCRIPTION_LENGTH,
  );
  if (!sanitizedDescription) {
    throw new Error("jobDescription is empty");
  }

  return { jobDescription: sanitizedDescription };
}

function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rate = rateLimit(clientIp, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      {
        message:
          "Please slow down a bit — you’ve reached the request limit. Try again shortly.",
      } satisfies JobFitResponse,
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = await request.json();
    const { jobDescription } = parseRequestBody(body);

    const model = process.env.MODEL_NAME;
    if (!model) {
      throw new Error("MODEL_NAME is not configured");
    }

    const resume = getResumeData();
    const systemPrompt = [
      `You are a candid resume screening assistant for ${resume.name}.`,
      "Use only the provided resume data and bullet stories.",
      "Do not fabricate details.",
      "If a requirement is not in the resume data, say 'not found'.",
      "Be honest, direct, and professional, while keeping a positive tone.",
      "Return output in this exact format:",
      "1) Overall fit: 2-3 sentences with a clear indication of fit.",
      "2) Pros: bullet list.",
      "3) Gaps: bullet list. Report up to 3 gaps, but only include critical ones. If there are no gaps, say 'none'.",
      "4) Skills matrix: markdown table with columns",
      "5) A one to two word verdict of recommendation: 'strong hire', 'hire', 'consider', 'no hire'.",
      "Skill | Requirement evidence | Resume alignment | Resume evidence | Notes.",
      "If the job description is long, focus on the 12 most critical skills.",
    ].join(" ");

    const provider = getProvider();
    const responseText = await provider.generateResponse({
      systemPrompt,
      resumeContext: resume,
      chatHistory: [],
      userMessage: jobDescription,
      model,
    });

    return NextResponse.json({ message: responseText } satisfies JobFitResponse);
  } catch (error) {
    console.error("Job fit API error", error);
    const errorMessage =
      error instanceof Error ? error.message : FALLBACK_MESSAGE;
    if (errorMessage === RESUME_LOAD_ERROR) {
      return NextResponse.json(
        { message: errorMessage, error: "NO_RESUME" } satisfies JobFitResponse,
        { status: 500 },
      );
    }
    return NextResponse.json(
      { message: FALLBACK_MESSAGE, error: "LLM_FAILURE" } satisfies JobFitResponse,
      { status: 200 },
    );
  }
}
