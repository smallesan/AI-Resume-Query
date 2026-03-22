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
   docker run -p 3000:3000 --env-file .env.local -v ./data:/app/data:ro ai-resume-test:local
   ```

7. Open `http://localhost:3000`


**Deploy** using the AWS EC2 steps below.

## AWS EC2 Deployment

The production stack is: **ECR** (image registry) → **EC2** (host) → **Docker Compose** (app + Nginx).
Nginx handles all public traffic on port 80 and proxies to the Next.js container on the internal
Docker network. Port 3000 is never exposed directly to the internet.

### EC2 Security Group
Configure inbound rules on the instance's security group before deploying:

| Port | Source | Purpose |
|------|--------|---------|
| 22 | Your IP only | SSH access |
| 80 | 0.0.0.0/0 | HTTP (Nginx) |
| 443 | 0.0.0.0/0 | HTTPS (for future SSL) |

**Do not open port 3000** — Nginx proxies to it over the internal Docker network only.

### IAM Instance Profile (one-time)
Attach an IAM role with the `AmazonEC2ContainerRegistryReadOnly` managed policy to the EC2
instance. This lets the instance pull from ECR using temporary credentials — no AWS keys are
stored on disk.

```bash
# Via console: EC2 → Instance → Actions → Security → Modify IAM role
# Or via CLI:
aws ec2 associate-iam-instance-profile \
  --instance-id <instance-id> \
  --iam-instance-profile Name=<role-with-ecr-readonly>
```

### Step 1 — Create ECR repository (one-time, local machine)
```bash
aws ecr create-repository \
  --repository-name ai-resume-query \
  --region <region>
# Note the repositoryUri from the output:
# <account-id>.dkr.ecr.<region>.amazonaws.com/ai-resume-query
```

### Step 2 — Build and push image (local machine)
```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region <region> | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.<region>.amazonaws.com

# Build, tag, push
docker build -t ai-resume-query:latest .

docker tag ai-resume-query:latest \
  <account-id>.dkr.ecr.<region>.amazonaws.com/ai-resume-query:latest

docker push \
  <account-id>.dkr.ecr.<region>.amazonaws.com/ai-resume-query:latest
```

### Step 3 — EC2 one-time setup
```bash
ssh -i <key.pem> ec2-user@<ec2-public-ip>

# Install Docker (Amazon Linux 2023)
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# Log out and back in for the group change to take effect

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Create app directory
sudo mkdir -p /opt/ai-resume-query/nginx
sudo chown ec2-user:ec2-user /opt/ai-resume-query
```

### Step 4 — Copy config files to EC2
```bash
# Edit docker-compose.yml and replace the image placeholder with your ECR URI first, then:
scp -i <key.pem> docker-compose.yml   ec2-user@<ec2-ip>:/opt/ai-resume-query/
scp -i <key.pem> nginx/nginx.conf     ec2-user@<ec2-ip>:/opt/ai-resume-query/nginx/

# Create your secrets file from the example template (fill in your real API key), then copy:
cp .env.production.example .env.production
# edit .env.production with your CLAUDE_API_KEY
scp -i <key.pem> .env.production      ec2-user@<ec2-ip>:/opt/ai-resume-query/

# Lock down the secrets file on the instance
ssh -i <key.pem> ec2-user@<ec2-ip> "chmod 600 /opt/ai-resume-query/.env.production"

# Copy the resume data directory (mounted at runtime — not baked into the image)
ssh -i <key.pem> ec2-user@<ec2-ip> "mkdir -p /opt/ai-resume-query/data"
scp -i <key.pem> data/<your-id>.json  ec2-user@<ec2-ip>:/opt/ai-resume-query/data/
```

### Step 5 — Pull image and start the stack
```bash
ssh -i <key.pem> ec2-user@<ec2-ip>

# Authenticate EC2 to ECR (uses IAM instance role — no credentials needed)
aws ecr get-login-password --region <region> | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.<region>.amazonaws.com

cd /opt/ai-resume-query
docker compose pull
docker compose up -d

# Confirm healthy
docker ps
```

The app is now live at `http://<ec2-public-ip>`.

### Subsequent deployments
```bash
# 1. Build and push new image (local machine)
aws ecr get-login-password --region <region> | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.<region>.amazonaws.com

docker build --platform linux/amd64 -t <account-id>.dkr.ecr.<region>.amazonaws.com/ai-resume-query:latest . && \
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/ai-resume-query:latest

# 2. Pull and restart on EC2
ssh -i <key.pem> ec2-user@<ec2-ip> "
  aws ecr get-login-password --region <region> | \
    docker login --username AWS --password-stdin \
    <account-id>.dkr.ecr.<region>.amazonaws.com && \
  cd /opt/ai-resume-query && \
  docker compose pull && \
  docker compose up -d
"
```

### Updating resume.json without redeploying

The `data/` directory is bind-mounted from the host into the container — it is **not** baked into the image. To update your resume:

```bash
# 1. Copy the updated file to the EC2 host
scp -i <key.pem> data/<your-id>.json ec2-user@<ec2-ip>:/opt/ai-resume-query/data/

# 2. Restart the app container to pick up the change
ssh -i <key.pem> ec2-user@<ec2-ip> "cd /opt/ai-resume-query && docker compose restart app"
```

No image rebuild or push required.

### Optional: SSL with Let's Encrypt
Once you have a domain pointed at an Elastic IP on the instance, add a certbot container to
`docker-compose.yml` and update `nginx/nginx.conf` to handle HTTPS (port 443) with an
HTTP → HTTPS redirect.

### NOTE: Ollama in production
If you use Ollama in production, keep it private and only allow calls from the backend.
But honestly, for $10 you can get enough monthly tokens on OpenAI you won't need to host
your own Ollama container and pay for GPU time.
