# AI Resume Agent
Welcome to the AI Resume Agent project. This project is based on a substack project from Nate B Jones and a conversation with Emma Dennis. Nate's project used loveable and I just couldn't bring myself to spend more money on yet another "vibe code it with AI" serivce, and I already pay for cursor. So what is this? This project is a combination of Artificial Intelegence and Meat Sack Intelegence working in partnership to bring you a full-stack containerized Next.js app that answers natural-language questions about a resume and job history. Responses are grounded in structured resume data with optional bullet-story context. 

## Features
- Chat UI with message history, typing indicator, and suggested questions
- Per-bullet “story” interaction (stored in resume JSON and sent to the LLM)
- Provider abstraction with Ollama (dev) and external LLMs (prod)
- Input validation, size limits, rate limiting, and safe fallback responses

## How it works
1. **Resume data source**: Structured resume data lives in `data/<RESUME_ID>.json`. Each experience has role dates and bullets with optional `story` text.
2. **UI**: `src/components/ChatApp.tsx` renders the chat, job-fit tool, and resume. Clicking a resume bullet expands its story inline.
3. **Chat API**: `src/app/api/chat/route.ts` validates the request, looks up bullet context (if provided), and calls the LLM provider with the resume data + history.
4. **Job Fit API**: `src/app/api/job-fit/route.ts` sends the resume + job description to the LLM and expects a structured response. The UI parses the Markdown table into an HTML table.
5. **LLM providers**: `src/lib/llm/providers` abstracts the provider so local Ollama and external OpenAI‑compatible endpoints can be swapped via env vars.
NOTE: If you want to change rate limits or update the system prompts. Those are hard coded in /src/app/api/chat/route.ts and job-fit/route.ts. feel free to play aroud with them if you want to change the "personality" of your resume bot.

## Why these languages and technologies
- **TypeScript**: Strong typing for resume data, API contracts, and UI props reduces runtime errors and makes refactors safer.
- **React + Next.js App Router**: Co-locates UI and API routes in one codebase, supports serverless/edge‑friendly APIs, and simplifies deployment to containers.
- **Tailwind CSS**: Utility‑first styling keeps styles close to components and avoids custom CSS bloat for a small, focused UI.
- **Ollama (local)**: Enables fast, private, and inexpensive local development with no external API dependency.
- **OpenAI‑compatible external APIs (prod)**: Allows switching providers without rewriting the app and supports managed, scalable inference.

## Resume data
Resume data lives in `data/<RESUME_ID>.json`. Each bullet includes an `id` and optional `story` field used for inline expansion. Suggested questions live in a `suggestedQuestions` array on the resume JSON. Just have a look at the resume.json example.

## OK let's kick the tires!
1. **Install dependencies**:
   - Docker, ollama, npm 
2. **Create your resume JSON** under `data/`:
   - Copy `data/resume.json` to `data/<your-id>.json`.
   - Update `name`, `title`, `summary`, and `contact`.
   - Add your experience entries with `company`, `role`, `start`, `end`, and `bullets`.
   - Give each bullet a stable `id` and add a `story` if you want inline expansion.
   - Update `suggestedQuestions` to match your experience.
3. **Set your LLM provider** in `.env.local`:
   - Local: `LLM_PROVIDER=ollama` + `OLLAMA_BASE_URL`
   - External: `LLM_PROVIDER=external` + `EXTERNAL_LLM_API_KEY` + `MODEL_NAME`
4. Create a local env file:
   ```bash
   cp .env.example .env.local
   ```
5. Update `.env.local`:
   - `RESUME_ID=<your-id>` (matches the JSON filename without `.json`)
   - `LLM_PROVIDER=ollama`
   - `OLLAMA_BASE_URL=http://localhost:11434`
   - `MODEL_NAME=llama3.1` (or another local model)

   ### or if you are using an external LLM locally
   Set:
   - `RESUME_ID=resume`
   - `LLM_PROVIDER=external`
   - `EXTERNAL_LLM_API_KEY=...` (this is the api key from the vendor of your choice.)
   - `MODEL_NAME=...` (check your case... openai model names are case sensitive. `MODEL_NAME=gpt-4.1` will work but `MODEL_NAME=GPT-4.1` will not)
   - `EXTERNAL_LLM_BASE_URL` (optional, defaults to OpenAI-compatible `EXTERNAL_LLM_BASE_URL=https://api.openai.com/v1`)

6. Run a local dev npm server or run a container:
   ```bash
   npm run dev
   ```
   ```bash
   docker build -t ai-resume-test:local .
   docker run -p 3000:3000 --env-file .env.local ai-resume-test:local
   ```

7. Open `http://localhost:3000`


**Deploy** using the Azure Container Apps steps below (or your preferred host).

## Azure Container Apps 
This project is designed for Azure Container Apps with ACR. The principle is the same if you want to run it in GCP or AWS.

### Prerequisites 
- Azure CLI: `az`
- Resource group and Azure Container Registry (ACR) created in a subscription
- Docker not required if using `az acr build`

### Build and push image
```bash
az login
az account set --subscription "<your-subscription-id>"

az acr login --name "<container-registry>"
az acr build --registry <container-registry> --image ai-resume-query:latest .
```

### Create environment and app
```bash
az containerapp env create \
  --name ai-resume-env \
  --resource-group <resource-group> \
  --location <region>

az containerapp create \
  --name ai-resume-query \
  --resource-group <resource-group> \
  --environment ai-resume-env \
  --image <container-registry>.azurecr.io/ai-resume-query:latest \
  --target-port 3000 \
  --ingress external \
  --registry-server <container-registry> .azurecr.io \
  --env-vars \
    LLM_PROVIDER=external \
    MODEL_NAME=... \
    RESUME_ID=resume
```

### Add your secrets for LLM API KEY
```bash
az containerapp secret set \
  --name ai-resume-query \
  --resource-group <resource-group> \
  --secrets llm-api-key=<EXTERNAL_LLM_API_KEY>

az containerapp update \
  --name ai-resume-query \
  --resource-group <resource-group> \
  --set-env-vars EXTERNAL_LLM_API_KEY=secretref:llm-api-key
```

### NOTE: Ollama in production
If you use Ollama in production, keep it private and only allow calls from the backend (e.g., private VNet or internal endpoint).
But honestly, for $10 you can get enough monthly tokens on openAI you won't need to host your own ollama container and pay for GPU time.
