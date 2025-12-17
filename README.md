# New Technology Research (NTR) – Deployment Guide

React + Vite SPA hosted on Azure Static Web Apps (Free) with an integrated Azure Functions API and Cosmos DB (free tier/shared autoscale). Optional: Azure Storage (media uploads) and Azure Communication Services (ACS) Email (campaigns).

## Repo structure
- Frontend (SPA): `/`
- Functions API: `api/` (routes exposed under `/api/*`)
- Terraform: `infra/`
- Ops scripts: `scripts/`

## Prerequisites
- Azure subscription with permissions to create resources.
- Azure CLI (`az`) and Terraform >= 1.7.
- Node >= 20.19 (Node 22+ works locally).

## What Terraform deploys
- Resource group: `<prefix>-rg`
- Static Web App: `<prefix>-swa` (Free)
- Cosmos DB account: `<prefix>-cosmos` (free tier when available)
- Cosmos SQL database: `<prefix>-db` with shared autoscale throughput (max 1000 RU) and containers:
  - `platforms` (/id)
  - `news` (/id)
  - `topics` (/id)
  - `config` (/id, id="global")
  - `subscribers` (/id)
- Storage account + container `media` for uploads.

## Configure `infra/terraform.tfvars`
Create `infra/terraform.tfvars` (example):
```hcl
prefix                = "ntechr"
location              = "westus2"
enforce_free_tier     = true
cosmos_enable_free_tier = true
cosmos_shared_database_max_throughput = 1000
subscription_id       = "<your-subscription-id>"
cosmos_use_serverless = false # uses shared autoscale 1000 RU
```

## Deploy infrastructure
```powershell
pwsh ./scripts/ezdeploy.ps1
```
Notes:
- Applies SWA app settings automatically (use `-SkipAppSettings` to skip).
- Uses shared RU at the database level (containers do not set throughput).

## Static Web App app settings
Set these in the SWA "Configuration" (Environment variables):

Cosmos:
- `COSMOS_CONNECTION_STRING` (recommended)
- or `COSMOS_ENDPOINT` + `COSMOS_KEY`
- `COSMOS_DATABASE` = `<prefix>-db`

Media uploads:
- `STORAGE_CONNECTION_STRING`
- `STORAGE_CONTAINER_NAME` = `media`

Site:
- `PUBLIC_SITE_URL` = `https://ntechr.com` (or `https://<prefix>.azurestaticapps.net`)

Email (optional, Admin > Email):
- `ACS_CONNECTION_STRING`

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
npm run lint
```

## Auth
Static Web Apps auth; only users with role `administrator` can access `/admin` and perform API writes.
