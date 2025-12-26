# Foundry

Foundry is a simple, open-source “deploy a site for free on Azure” starter:
- React + Vite SPA hosted on Azure Static Web Apps (Free)
- Azure Functions API (under `/api/*`)
- Cosmos DB (free tier + shared database autoscale max 1000 RU)
- Azure Storage (media uploads)
- Admin portal with an AI assistant that can apply actions (themes, navigation, homepage sections, content, media generation)

## Repo structure
- Frontend (SPA): `/`
- Functions API: `api/`
- Terraform: `infra/`
- Ops scripts: `scripts/`

## Prerequisites
- Azure subscription with permissions to create resources.
- Azure CLI (`az`) and Terraform >= 1.7.
- Node >= 20.19 if you want to build locally.
- A GitHub repo (for Azure Static Web Apps CI/CD).

Install Azure CLI: `https://learn.microsoft.com/cli/azure/install-azure-cli`  
Install Terraform: `https://developer.hashicorp.com/terraform/downloads`

If `az staticwebapp` commands aren’t available, install the Azure CLI extension:
```powershell
az extension add --name staticwebapp
```

If you belong to multiple tenants or subscriptions:
```powershell
az login
az account list -o table
az account set --subscription <subscription-id>
```

## One-command deploy (recommended on Windows)
From the repo root:
```powershell
pwsh ./scripts/foundry.ps1
```

What it automates:
- `az login` if needed
- subscription selection
- region selection (or `-AutoLocation` to guess)
- writes `infra/terraform.tfvars`
- runs Terraform deploy via `pwsh ./scripts/ezdeploy.ps1`
- tries to retrieve the SWA deployment token and (optionally) set the GitHub secret if you have GitHub CLI (`gh`) installed and authenticated
- optionally invites an admin GitHub user (`-GitHubAdminUsername`)

Useful options:
```powershell
pwsh ./scripts/foundry.ps1 -Prefix mysite -AutoLocation
pwsh ./scripts/foundry.ps1 -PlanOnly
pwsh ./scripts/foundry.ps1 -SkipGitHubSecret
pwsh ./scripts/foundry.ps1 -GitHubAdminUsername your-github-handle
```

## Manual Terraform config
Copy the example file:
```powershell
Copy-Item infra/terraform.tfvars.example infra/terraform.tfvars
```

Then deploy:
```powershell
pwsh ./scripts/ezdeploy.ps1
```

To find your subscription ID:
```powershell
az account show --query id -o tsv
```

## CI/CD: Azure Static Web Apps (GitHub Actions)
Workflow: `.github/workflows/azure-static-web-apps.yml`

Create a GitHub secret:
- Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Value: Azure Portal → your Static Web App → Overview → Manage deployment token

Push to `main` to deploy.

## Admin auth (GitHub)
Only users with role `administrator` can access `/admin` and perform API writes.

Invite an admin user (GitHub):
```powershell
az staticwebapp users invite -n <prefix>-swa -g <prefix>-rg --role administrator --provider github --user-details <github-username>
```
The invited user must open the returned invite URL and accept it.

## Custom domain (Azure Static Web Apps)
High-level steps:
1) Azure Portal → your Static Web App → Custom domains → Add
2) Add the required DNS validation records (often TXT)
3) Point traffic to your SWA default hostname (CNAME for subdomains; ALIAS/A for apex depending on DNS provider)

Reference: `https://learn.microsoft.com/azure/static-web-apps/custom-domain`

Tip: for “zero downtime” cutovers, you can validate ownership via TXT first, then switch your CNAME/ALIAS/A record to point at the SWA default hostname.

Common DNS patterns (external DNS provider):
- `www.<domain>`: CNAME → `<default-hostname>.azurestaticapps.net`
- apex/root `<domain>`: use ALIAS/ANAME if your provider supports it; otherwise follow the provider-specific instructions in the docs.

Validation TXT records are often named like:
- `_dnsauth.www.<domain>` (for `www`)
- `_dnsauth.<domain>` or `_dnsauth.<subdomain>.<domain>` (depending on what you’re validating)

## Local build
Frontend:
```bash
npm install
npm run build
```

API:
```bash
cd api
npm install
npm run build
```

## Platform features
- Modular homepage sections with 3D embed blocks (custom HTML or Three.js scripts).
- 3D embeds on platform, news, and topic detail pages via `custom.embedHtml` + `custom.embedHeight`.
- Media library backed by Azure Blob Storage (upload, browse, reuse).
- OpenAI image generation (`gpt-image-1.5`) with automatic Blob upload.
- Contact form module (stores submissions in Cosmos DB and emails them via ACS).
- Custom code pages (HTML/CSS/JS) that run inside sandboxed iframes and can be linked from navigation.
- AI usage tracking (chat + image tokens) with all-time + last-30-days rollups.
- Pricing overrides for cost estimation (manual or import from pricing text).

## AI Assistant capabilities
The Admin AI Assistant can:
- Create/update/delete platforms, news, topics, and homepage sections.
- Update navigation, theming, and content schema fields.
- Create or edit custom code pages (HTML/CSS/JS) that run on the site inside sandboxed iframes.
- Generate images (with confirmation) and attach them to content.
- Suggest or insert 3D embed code for homepage sections or content items.

It sends a system training doc with every request, so it already knows the supported actions and data schema.

## OpenAI pricing import (when auto-refresh fails)
OpenAI uses Cloudflare on the pricing page, which can block server-side scraping. If the “Refresh from OpenAI” button fails:
1) Open `https://openai.com/api/pricing/`
2) Copy the full pricing text
3) In Admin > AI usage & pricing, paste into **Import pricing from text** and click **Import**

This sets `config.ai.pricing` so cost estimates work immediately.

## Notes on secrets (OpenAI)
The admin AI assistant can store an OpenAI API key in the site config. The key is redacted from reads, but it still exists in Cosmos DB. If you need stronger guarantees, move secrets to a managed secret store (e.g., Key Vault) and proxy requests server-side with stricter auth.
