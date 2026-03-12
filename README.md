# Foundry

Foundry is the reusable platform/starter in this repo. The concrete site currently built from it is NTechR (New Technology Research).

This codebase deploys a React/Vite SPA plus an Azure Functions API to Azure Static Web Apps, backed by Cosmos DB and Azure Blob Storage. It includes a public content site, an admin CMS, a business module, and an OpenAI/Codex-backed admin assistant.

## Naming note

- The repo, package names, scripts, and some default config still use the name `Foundry`.
- The current site/content implementation in this repo is NTechR.
- If you fork this for another project, update the branding plus the `ntechr`-specific Codex home paths called out below.

## Current scope

- Public site routes for Home, Platforms, News, Topics, About, and Subscribe.
- Admin CMS at `/admin` for platforms, topics, news, site config, theme, media, and email settings.
- Business module under `/admin/business/*` for invoices, customers, vendors, banking, imports, ledger, reconciliation, reports, tax, settings, and a business assistant.
- Azure Static Web Apps auth with `administrator` role required for `/admin/*`.
- Media uploads backed by Azure Blob Storage.
- Contact submissions plus optional Azure Communication Services email sending.
- OpenAI image generation.
- Admin AI assistant with either OpenAI API key auth or Codex subscription auth.

## Repo structure

- Frontend SPA: `/`
- Azure Functions API: `api/`
- Terraform: `infra/`
- PowerShell deploy scripts: `scripts/`
- Codex integration notes: `docs/codexpath.md`
- Business module notes: `docs/business.md`
- NTechR retrofit/buildout notes: `buildout.md`

## Prerequisites

- Azure subscription with permission to create resources.
- Azure CLI (`az`).
- Terraform `>= 1.7`.
- PowerShell 7 (`pwsh`) for the deployment scripts.
- Node `>= 20.19.0`.
- A GitHub repo for the Azure Static Web Apps workflow.

Optional but useful:

- GitHub CLI (`gh`) if you want the bootstrap script to set `AZURE_STATIC_WEB_APPS_API_TOKEN` automatically.
- A custom domain for production.
- Azure Communication Services if you want email sending from the app.

For Codex subscription mode:

- The backend host must be able to spawn child processes.
- `api/package.json` already includes `@openai/codex`, so a separate global install is not required unless you deliberately point `CODEX_PATH` somewhere else.
- `CODEX_HOME` must be writable.
- For hosted deployments, `CODEX_HOME` should be persistent if you want login state to survive restarts.

Install Azure CLI: <https://learn.microsoft.com/cli/azure/install-azure-cli>  
Install Terraform: <https://developer.hashicorp.com/terraform/downloads>

## One-command deploy

From the repo root:

```powershell
pwsh ./scripts/foundry.ps1
```

Useful options:

```powershell
pwsh ./scripts/foundry.ps1 -Prefix mysite -AutoLocation
pwsh ./scripts/foundry.ps1 -PlanOnly
pwsh ./scripts/foundry.ps1 -SkipGitHubSecret
pwsh ./scripts/foundry.ps1 -GitHubAdminUsername your-github-handle
```

What `scripts/foundry.ps1` does:

- Ensures Azure CLI login.
- Installs the `staticwebapp` Azure CLI extension if needed.
- Selects a subscription.
- Picks a supported Static Web Apps region.
- Writes `infra/terraform.tfvars`.
- Runs `pwsh ./scripts/ezdeploy.ps1`.
- Tries to fetch the SWA deployment token.
- Optionally writes the GitHub Actions secret with `gh`.
- Optionally creates an admin invite for a GitHub user.

## Manual deploy

Copy the example tfvars file:

```powershell
Copy-Item infra/terraform.tfvars.example infra/terraform.tfvars
```

Then deploy:

```powershell
pwsh ./scripts/ezdeploy.ps1
```

If you only want the plan:

```powershell
pwsh ./scripts/ezdeploy.ps1 -PlanOnly
```

## App settings

`scripts/ezdeploy.ps1` will try to set the common Static Web App settings automatically from Terraform outputs.

If you need to set or update them manually, use:

```powershell
pwsh ./scripts/set-swa-settings.ps1 `
  -ResourceGroup <prefix-rg> `
  -StaticWebAppName <prefix-swa> `
  -CosmosEndpoint <cosmos-endpoint> `
  -CosmosKey <cosmos-key> `
  -CosmosDatabase <prefix-db> `
  -StorageConnectionString <storage-connection-string> `
  -PublicSiteUrl https://<your-site> `
  -CodexPath codex `
  -CodexHome /home/site/.codex/ntechr
```

Important settings:

- `COSMOS_DATABASE`
- `COSMOS_ENDPOINT` and `COSMOS_KEY`, or `COSMOS_CONNECTION_STRING`
- `STORAGE_CONNECTION_STRING`
- `STORAGE_CONTAINER_NAME` (defaults to `media`)
- `PUBLIC_SITE_URL`
- `CODEX_PATH` (optional; defaults to `codex` or the bundled `@openai/codex` runtime)
- `CODEX_HOME` (recommended for hosted Codex auth persistence)

## CI/CD

Workflow file: `.github/workflows/azure-static-web-apps.yml`

The workflow deploys on pushes to `main`.

Required GitHub secret:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`

If you do not use `gh secret set`, create it manually from Azure:

1. Open your Static Web App in Azure Portal.
2. Open Overview.
3. Open Manage deployment token.
4. Copy that token into the GitHub repo secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.

## Admin auth

`/admin/*` is locked to the Azure Static Web Apps `administrator` role.

Invite an admin GitHub user:

```powershell
az staticwebapp users invite -n <prefix>-swa -g <prefix>-rg --role administrator --provider github --user-details <github-username>
```

The invited user must open the returned URL and accept the invite.

## Custom domain

High-level steps:

1. Azure Portal -> your Static Web App -> Custom domains -> Add
2. Add the required DNS validation records
3. Point traffic at the SWA default hostname

Reference: <https://learn.microsoft.com/azure/static-web-apps/custom-domain>

## OpenAI and Codex auth

The admin assistant supports two auth modes:

1. `apiKey`
2. `codexPath`

### `apiKey` mode

- Uses a standard OpenAI API key for chat and image generation.
- Best fit for server-side automation and unattended workflows.
- Image generation in this repo always uses the API key path, even if chat uses Codex subscription auth.

### `codexPath` mode

- The backend launches `codex app-server` itself.
- The frontend can list available Codex models.
- The admin UI can start login, check auth persistence, and complete hosted callback flows.
- This is for interactive Codex subscription usage from the admin UI, not for public/untrusted execution.

### Current OpenAI guidance

Per the current OpenAI Codex docs:

- Codex supports two OpenAI sign-in methods: ChatGPT sign-in for subscription access, or API key sign-in for usage-based access.
- For the Codex CLI, ChatGPT sign-in is the default path when no valid session is available.
- API key auth is still the recommended option for programmatic CLI workflows such as CI/CD jobs.
- User-level Codex config lives in `~/.codex/config.toml`.
- Trusted project-level overrides can live in `.codex/config.toml`.

Official references:

- Codex auth: <https://developers.openai.com/codex/auth/>
- Codex config reference: <https://developers.openai.com/codex/config-reference/>
- Code generation guide: <https://developers.openai.com/api/docs/guides/code-generation/>

### Repo-specific Codex behavior

- `api/package.json` includes `@openai/codex`.
- If `CODEX_PATH` is empty, `codex`, or `@openai/codex`, the backend first tries the bundled `@openai/codex/bin/codex.js` runtime and then falls back to `codex` on `PATH`.
- The admin UI exposes:
  - `Auth mode: OpenAI API key`
  - `Auth mode: Codex subscription`
  - Codex home profiles: `auto`, `azure`, `aws`, `local`, `custom`
  - Sign-in, refresh model list, and auth-health checks
- If hosted login lands on a `http://localhost:...` callback page, the UI lets the user paste that callback URL back into the app to complete login.

Current Codex home profile mapping in this repo:

- `azure` -> `/home/site/.codex/ntechr`
- `aws` -> `<aws-volume-root>/.codex/ntechr` (default root `/mnt/efs`)
- `local` -> `.codex-home`
- `custom` -> user-supplied path

Important persistence note:

- This implementation forces file-backed Codex auth under `CODEX_HOME`.
- That avoids reliance on a desktop keychain in hosted environments.
- For multi-worker or containerized deployments, Codex auth is most reliable when `CODEX_HOME` is on shared persistent storage.

### Model note

- The backend compatibility fallback for `codexPath` currently defaults to `gpt-5.1-codex`.
- The admin UI loads the actual model list from the installed Codex runtime and lets you choose from what is available.
- OpenAI's current guidance is to prefer the latest GPT-5 family models for most coding tasks when available, so if newer models show up in the picker, prefer those over hardcoding older defaults.

## Local development

Frontend:

```bash
npm install
npm run dev
npm run build
```

API:

```bash
cd api
npm install
npm run build
npm run lint
```

The local Codex home profile resolves to:

```text
.codex-home
```

## Cosmos containers

Core site containers:

- `platforms`
- `news`
- `topics`
- `config`
- `subscribers`
- `contact-submissions`

Business module containers:

- `business-config`
- `business-customers`
- `business-vendors`
- `business-invoices`
- `business-payments`
- `business-bank-accounts`
- `business-bank-transactions`
- `business-journal-entries`
- `business-import-sources`
- `business-import-jobs`
- `business-integrations`
- `business-import-artifacts`
- `business-reconcile-runs`
- `business-audit-events`

## Extra docs

- Codex integration playbook: `docs/codexpath.md`
- Business module blueprint: `docs/business.md`
- NTechR buildout status: `buildout.md`

## Notes on secrets

- OpenAI API keys saved through the admin UI are redacted from reads, but they still exist server-side in stored config.
- If you need stronger secret isolation, move secrets to a managed secret store such as Azure Key Vault and proxy requests server-side.
