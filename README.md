# Manufacturing Operations Dashboard

A full-stack manufacturing operations application built with React, Vite, Express, PostgreSQL, and optional local AI through Ollama.

The application includes live shift dashboards, machine maintenance, production orders, materials, workforce, quality and NCR tracking, calibrations, certifications, suppliers, CAPA, anomaly detection, reports, alerts, AI feedback, and AI gap proposals.

## Runtime architecture

`npm run dev` starts three processes:

- Vite development server at `http://localhost:5173`
- Express API at `http://localhost:3001`
- History worker, which records changed shift and domain data every 60 seconds

Vite proxies `/api` requests to the Express server. Express also serves the compiled React application from `dist/` after a production build.

## Software to install

Install these tools before setting up the application:

| Package | Required | Purpose |
| --- | --- | --- |
| Node.js 20 or newer | Yes | Runs the API, worker, build scripts, and Vite |
| npm | Yes | Installs JavaScript packages; included with Node.js |
| PostgreSQL 16 recommended | Yes for persistent data | Stores operational data, history, reports, AI feedback, failures, and gap proposals |
| Ollama | Optional | Runs the AI chat and reasoning models locally |
| Docker Desktop | Optional | Runs the production-style app and PostgreSQL containers |

Download links:

- [Node.js](https://nodejs.org/en/download)
- [PostgreSQL](https://www.postgresql.org/download/)
- [Ollama](https://ollama.com/download)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

The JavaScript dependencies are declared in `package.json`. Install the exact versions from `package-lock.json` with:

```powershell
npm ci
```

This installs React, Vite, Express, PostgreSQL client libraries, Recharts, CORS, and dotenv. Do not install those packages individually.

## Recommended local setup

### 1. Configure the environment

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Update `.env` for your PostgreSQL installation:

```dotenv
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sumex_demo

AI_PROVIDER=auto
OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_CHAT_MODEL=gemma3
AI_REASONING_MODEL=deepseek-r1
OLLAMA_REASONING_MODEL=deepseek-r1

HISTORY_WORKER_INTERVAL_MS=60000
HISTORY_DAYS=210
AI_GAP_LOOKBACK_DAYS=30
AI_GAP_MIN_COUNT=2
```

Environment variable notes:

- `AI_PROVIDER=auto` uses Ollama when it is available and falls back to built-in deterministic responses when it is not.
- `AI_PROVIDER=deterministic` disables calls to Ollama.
- `AI_CHAT_MODEL` controls the normal assistant model.
- `AI_REASONING_MODEL` controls reasoning-heavy requests.
- `OLLAMA_REASONING_MODEL` optionally overrides the model used by the retrieval and SQL reasoning layer.
- Use `AI_CHAT_MODEL`, not `OLLAMA_CHAT_MODEL`, when changing the chat model.
- `HISTORY_DAYS` controls how much generated history `npm run db:setup` and `npm run db:backfill` create.

### 2. Create the PostgreSQL database

Start PostgreSQL, then create the database with pgAdmin or `psql`:

```powershell
psql -U postgres -c "CREATE DATABASE sumex_demo;"
```

If the database already exists, continue to the next step.

### 3. Install packages and initialize data

```powershell
npm ci
npm run db:setup
```

`db:setup` creates or updates the schema, loads seed data, resets the current operational domain data, and generates historical data. It requires a valid `DATABASE_URL`.

Warning: the setup process reseeds application data. Do not run it against a database containing information that must be preserved.

### 4. Start the application

```powershell
npm run dev
```

Open `http://localhost:5173`.

Check the API independently at `http://localhost:3001/api/health`. A healthy server returns:

```json
{
  "ok": true
}
```

## Ollama setup

Ollama is optional, but it is required for model-generated Ask AI answers and reasoning. Without it, the application continues to run using deterministic responses.

### 1. Install and start Ollama

Download and install [Ollama](https://ollama.com/download) for your operating system. On Windows, the installed application normally starts the Ollama service automatically.

Verify the service:

```powershell
ollama --version
Invoke-RestMethod http://127.0.0.1:11434/api/version
```

If the API request fails, start Ollama:

```powershell
ollama serve
```

Run `ollama serve` in a separate terminal and leave it open.

### 2. Download the required models

The default application configuration expects these models:

```powershell
ollama pull gemma3
ollama pull deepseek-r1
```

Confirm that both models are available:

```powershell
ollama list
```

Model downloads can be several gigabytes. If the machine has limited memory, choose smaller Ollama model tags and set the corresponding names in `.env`.

Restart `npm run dev` after changing any AI environment variable. The server checks Ollama availability when it first handles an AI request.

## Database and persistence

PostgreSQL is strongly recommended for the current application. Without `DATABASE_URL`, parts of the dashboard can use in-memory demo data, but the following capabilities require the database:

- Persistent edits to machines, orders, materials, workforce, quality, calibrations, and suppliers
- Historical reports and background history synchronization
- Generated report history
- AI interactions and user feedback
- AI failures, retrieval gaps, and proposals
- Cross-process live update notifications

Database definitions and seed data are in:

- `database/schema.sql`
- `database/seed.sql`

Useful database commands:

```powershell
npm run db:setup
npm run db:backfill
```

`db:backfill` replaces generated historical metrics and domain history using the current `HISTORY_DAYS` value.

## AI feedback and gap proposals

Ask AI feedback is stored in PostgreSQL:

- `ai_interactions` stores AI request metadata and outcomes.
- `ai_feedback` stores ratings, comments, and corrected answers.
- `ai_failures` receives feedback rated `2` or lower, along with other captured AI failures.
- `retrieval_gaps` stores grouped failure patterns.
- `retrieval_proposals` stores proposed fixes and tests.

Gap proposals are not created merely by opening Settings. To test the workflow:

1. Ask AI a question and submit a rating of `1` or `2`.
2. Repeat enough related failures to meet `AI_GAP_MIN_COUNT`, which defaults to `2`.
3. Open **Settings > AI Gap Proposals**.
4. Select **Analyze Failures**, then refresh the proposal list if needed.
5. Select a gap to generate or approve its proposal.

Failures are grouped over the last 30 days by default. Unrelated questions can form different groups and may not individually meet the minimum count.

The same analysis can be run from the terminal:

```powershell
npm run ai:analyze
```

Optional overrides for one PowerShell session:

```powershell
$env:AI_GAP_LOOKBACK_DAYS = "30"
$env:AI_GAP_MIN_COUNT = "2"
npm run ai:analyze
```

## Available npm commands

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the API, history worker, and Vite development server |
| `npm run client` | Starts only Vite on port 5173 |
| `npm run server` | Starts only Express on port 3001 |
| `npm run worker` | Starts only the history worker |
| `npm run build` | Builds the React application into `dist/` |
| `npm run preview` | Previews the Vite production build |
| `npm run db:setup` | Creates schema, seeds current data, and backfills history |
| `npm run db:backfill` | Regenerates historical data |
| `npm run ai:analyze` | Groups recent AI failures into retrieval gaps |

## Production build

```powershell
npm ci
npm run build
npm run server
```

Open `http://localhost:3001`. Run `npm run worker` in a second process when continuous history synchronization is required.

## Docker Compose

Docker Compose provides PostgreSQL and a production build of the application. It does not currently start Ollama or the history worker.

Set a secure `POSTGRES_PASSWORD` in `.env`, then run:

```powershell
docker compose build
docker compose up -d postgres
docker compose run --rm app npm run db:setup
docker compose up -d
```

Open `http://localhost:3002/shopfloor/`.

For AI access from the app container, Ollama must run separately and the app service must be configured with:

```yaml
environment:
  - OLLAMA_BASE_URL=http://host.docker.internal:11434
  - AI_CHAT_MODEL=gemma3
  - AI_REASONING_MODEL=deepseek-r1
```

Ollama must also accept connections from Docker. Native development is the simpler setup when testing AI features.

Stop the containers with:

```powershell
docker compose down
```

The PostgreSQL named volume is preserved by this command.

## Key API routes

The UI uses these route groups:

- `/api/dashboard`, `/api/presses`, `/api/alerts`, and `/api/shifts`
- `/api/domain/current`, `/api/orders`, `/api/materials`, `/api/suppliers`, and `/api/workforce`
- `/api/ncr`, `/api/capa`, and `/api/calibrations`
- `/api/history/*` and `/api/reports/*`
- `/api/ai/*` for assistant, analysis, reports, and feedback
- `/api/admin/data-health` and `/api/admin/ai-gaps/*`
- `/api/retrieval/*` for structured operational retrieval

Use `GET /api/events?shift=Shift%20A` for the live server-sent event stream.

## Troubleshooting

### Port 3001 is already in use

`EADDRINUSE :::3001` means another API process is already listening on port 3001, often because `npm run dev` was started twice.

Find the process:

```powershell
$connection = Get-NetTCPConnection -LocalPort 3001 -State Listen
Get-Process -Id $connection.OwningProcess
```

Stop it only after confirming it is the old Node process:

```powershell
Stop-Process -Id $connection.OwningProcess
```

Then run `npm run dev` once. Changing only `PORT` is not sufficient for development because the Vite proxy currently targets port 3001.

### PostgreSQL authentication fails

Confirm that the username, password, host, port, and database in `DATABASE_URL` match PostgreSQL. Then verify the connection:

```powershell
psql "postgresql://postgres:postgres@localhost:5432/sumex_demo" -c "select now();"
```

### AI answers use fallback behavior

Check all three conditions:

```powershell
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/version
Get-Content .env
```

The configured model names must appear in `ollama list`, `AI_PROVIDER` must not be `deterministic`, and the API server must be restarted after `.env` changes.

### AI feedback exists but no gap is shown

Run:

```powershell
npm run ai:analyze
```

Then open Settings and refresh **AI Gap Proposals**. A rating above `2` is recorded as feedback but does not create an `ai_failures` row, and a group below `AI_GAP_MIN_COUNT` does not create a proposal.
