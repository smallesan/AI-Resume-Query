import { buildMessages } from "@/lib/llm/buildMessages";
import type { LLMProvider, LLMRequest } from "@/lib/llm/LLMProvider";

type ClaudeResponse = {
  content?: Array<{ type: string; text?: string }>;
};

export class ClaudeProvider implements LLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(request: LLMRequest): Promise<string> {
    const allMessages = buildMessages(request);
    const systemParts = allMessages
      .filter((m) => m.role === "system")
      .map((m) => m.content);
    const chatMessages = allMessages.filter((m) => m.role !== "system");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        system: systemParts.join("\n\n"),
        messages: chatMessages,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Claude API error: ${response.status} ${body}`);
    }

    const data = (await response.json()) as ClaudeResponse;
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    if (!text) {
      throw new Error("Claude response missing content");
    }
    return text;
  }
}
