import type { LLMProvider } from "@/lib/llm/LLMProvider";
import { ClaudeProvider } from "@/lib/llm/providers/claude";
import { ExternalProvider } from "@/lib/llm/providers/external";
import { OllamaProvider } from "@/lib/llm/providers/ollama";

export function getProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "ollama";

  if (provider === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    return new OllamaProvider(baseUrl);
  }

  if (provider === "external") {
    const apiKey = process.env.EXTERNAL_LLM_API_KEY;
    if (!apiKey) {
      throw new Error("EXTERNAL_LLM_API_KEY is required for external provider");
    }
    const baseUrl = process.env.EXTERNAL_LLM_BASE_URL;
    return new ExternalProvider(apiKey, baseUrl);
  }

  if (provider === "claude") {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error("CLAUDE_API_KEY is required for claude provider");
    }
    return new ClaudeProvider(apiKey);
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}
