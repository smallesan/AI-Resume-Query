import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProvider } from "@/lib/llm";
import type { ChatMessage, ChatRequest, ChatResponse } from "@/lib/types";
import { findBulletById, getResumeData } from "@/lib/resume";
import { rateLimit } from "@/lib/rateLimit";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_ITEM_LENGTH = 1000;
const RATE_LIMIT = { intervalMs: 60_000, limit: 20 };
const RESUME_LOAD_ERROR =
  "No resume loaded, please add a resume json file to /data directory.";

const FALLBACK_MESSAGE =
  "Sorry — I’m having trouble retrieving that right now. Please try again in a moment.";

function sanitizeText(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function parseHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: ChatMessage[] = [];
  for (const item of value) {
    if (
      typeof item === "object" &&
      item !== null &&
      "role" in item &&
      "content" in item
    ) {
      const role = (item as { role: string }).role;
      const content = (item as { content: string }).content;
      if (
        (role === "user" || role === "assistant") &&
        typeof content === "string"
      ) {
        parsed.push({
          role,
          content: sanitizeText(content).slice(0, MAX_HISTORY_ITEM_LENGTH),
        });
      }
    }
  }
  return parsed.slice(-MAX_HISTORY_MESSAGES);
}

function parseRequestBody(body: unknown): ChatRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid JSON body");
  }

  const message = (body as { message?: unknown }).message;
  const history = (body as { history?: unknown }).history;
  const bulletId = (body as { bulletId?: unknown }).bulletId;

  if (typeof message !== "string") {
    throw new Error("message is required");
  }

  const sanitizedMessage = sanitizeText(message).slice(0, MAX_MESSAGE_LENGTH);
  if (!sanitizedMessage) {
    throw new Error("message is empty");
  }

  return {
    message: sanitizedMessage,
    history: parseHistory(history),
    bulletId: typeof bulletId === "string" ? sanitizeText(bulletId) : null,
  };
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
      } satisfies ChatResponse,
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = await request.json();
    const { message, history, bulletId } = parseRequestBody(body);

    const model = process.env.MODEL_NAME;
    if (!model) {
      throw new Error("MODEL_NAME is not configured");
    }

    const resume = getResumeData();
    const bulletContext = bulletId ? findBulletById(resume, bulletId) : null;

    const systemPrompt = [
      `You are an AI assistant answering questions about ${resume.name}'s resume and job history.`,
      "Use only the provided resume data and bullet story context.",
      "Do not fabricate details.",
      "If the answer is not in the data, say you do not know.",
      "Keep responses concise and professional, while keeping a positive tone."
    ].join(" ");

    const provider = getProvider();
    const responseText = await provider.generateResponse({
      systemPrompt,
      resumeContext: resume,
      chatHistory: history ?? [],
      userMessage: message,
      bulletContext,
      model,
    });

    return NextResponse.json({ message: responseText } satisfies ChatResponse);
  } catch (error) {
    console.error("Chat API error", error);
    const errorMessage =
      error instanceof Error ? error.message : FALLBACK_MESSAGE;
    if (errorMessage === RESUME_LOAD_ERROR) {
      return NextResponse.json(
        { message: errorMessage, error: "NO_RESUME" } satisfies ChatResponse,
        { status: 500 },
      );
    }
    return NextResponse.json(
      { message: FALLBACK_MESSAGE, error: "LLM_FAILURE" } satisfies ChatResponse,
      { status: 200 },
    );
  }
}
