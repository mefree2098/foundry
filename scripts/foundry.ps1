#requires -Version 7
Param(
  [string]$Prefix = "foundry",
  [string]$Location,
  [string]$SubscriptionId,
  [switch]$AutoLocation,
  [switch]$PlanOnly,
  [switch]$SkipAppSettings,
  [switch]$SkipGitHubSecret,
  [string]$GitHubAdminUsername
)

$ErrorActionPreference = "Stop"

Write-Host "=== Foundry bootstrap ===" -ForegroundColor Cyan

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Require-Command([string]$name, [string]$installHint) {
  if (Get-Command $name -ErrorAction SilentlyContinue) { return }
  throw "$name is not installed or not in PATH. $installHint"
}

function Ensure-AzLogin {
  az account show 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { return }
  Write-Host "Azure CLI not authenticated; launching 'az login'..." -ForegroundColor Yellow
  az login | Out-Null
}

function Ensure-StaticWebAppExtension {
  az extension show --name staticwebapp 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { return }
  Write-Host "Installing Azure CLI extension: staticwebapp" -ForegroundColor Yellow
  az extension add --name staticwebapp | Out-Null
}

function Select-SubscriptionIfNeeded([string]$subId) {
  if ($subId) {
    az account set --subscription $subId 1>$null 2>$null
    return $subId
  }

  $subs = az account list --query "[].{name:name, id:id, isDefault:isDefault}" -o json | ConvertFrom-Json
  if (-not $subs -or $subs.Count -eq 0) { throw "No Azure subscriptions found for this account." }
  $default = $subs | Where-Object { $_.isDefault } | Select-Object -First 1
  if ($subs.Count -eq 1 -and $subs[0].id) {
    $subId = $subs[0].id
  } elseif ($default -and $default.id) {
    $subId = $default.id
  } else {
    Write-Host "Available Azure subscriptions:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $subs.Count; $i++) {
      Write-Host ("[{0}] {1} ({2})" -f ($i + 1), $subs[$i].name, $subs[$i].id)
    }
    $choice = Read-Host "Select subscription number"
    $idx = [int]$choice - 1
    if ($idx -lt 0 -or $idx -ge $subs.Count) { throw "Invalid selection." }
    $subId = $subs[$idx].id
  }

  az account set --subscription $subId 1>$null 2>$null
  return $subId
}

function Detect-Location {
  $supported = @("westus2", "centralus", "eastus2", "westeurope", "eastasia")
  if ($Location -and $supported -contains $Location) { return $Location }

  if ($AutoLocation) {
    try {
      $geo = Invoke-RestMethod -Uri "https://ipapi.co/json/" -TimeoutSec 10
      $country = ($geo.country_code ?? "").ToString().ToUpperInvariant()
      $continent = ($geo.continent_code ?? "").ToString().ToUpperInvariant()
      if ($continent -eq "EU") { return "westeurope" }
      if ($continent -eq "AS") { return "eastasia" }
      if ($continent -eq "NA") { return "centralus" }
      if ($country -eq "US") { return "centralus" }
    } catch {
      # fall back to prompt
    }
  }

  Write-Host "Choose an Azure region for Static Web Apps (Free):" -ForegroundColor Cyan
  for ($i = 0; $i -lt $supported.Count; $i++) {
    Write-Host ("[{0}] {1}" -f ($i + 1), $supported[$i])
  }
  $choice = Read-Host "Select region number (default 1)"
  if (-not $choice) { return $supported[0] }
  $idx = [int]$choice - 1
  if ($idx -lt 0 -or $idx -ge $supported.Count) { throw "Invalid selection." }
  return $supported[$idx]
}

function Write-TfVars([string]$path, [string]$prefix, [string]$location, [string]$subscriptionId) {
  $content = @"
prefix            = `"$prefix`"
location          = `"$location`" # must support Static Web Apps (Free): westus2, centralus, eastus2, westeurope, eastasia
enforce_free_tier = true
cosmos_enable_free_tier = true
cosmos_use_serverless = false
cosmos_shared_database_max_throughput = 1000 # shared RU across containers (DB-level autoscale max)
subscription_id   = `"$subscriptionId`"
"@
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Set-Content -Path $path -Value $content -Encoding UTF8
}

function Try-Get-SwaDeploymentToken([string]$subscriptionId, [string]$resourceGroup, [string]$swaName) {
  try {
    $existing = az staticwebapp secrets list -n $swaName -g $resourceGroup --query "properties.apiKey" -o tsv 2>$null
    if ($LASTEXITCODE -eq 0 -and $existing) { return $existing.Trim() }
  } catch {
    # ignore
  }
  try {
    $uri = "https://management.azure.com/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Web/staticSites/$swaName/listSecrets?api-version=2022-03-01"
    $res = az rest --method post --uri $uri -o json | ConvertFrom-Json
    if ($res.properties.apiKey) { return $res.properties.apiKey.Trim() }
  } catch {
    return $null
  }
  return $null
}

function Try-SetGitHubSecret([string]$token) {
  if ($SkipGitHubSecret) { return }
  if (-not $token) {
    Write-Warning "No SWA deployment token available; cannot configure GitHub secret automatically."
    return
  }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Warning "GitHub CLI (gh) not found. Set GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN manually."
    return
  }
  if (-not (Test-Path (Join-Path (Get-Location) ".git"))) {
    Write-Warning "No .git directory found in the current folder. Run this script from your repo root, or set the GitHub secret manually."
    return
  }
  try {
    gh auth status 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "GitHub CLI is not authenticated. Run 'gh auth login' and re-run, or set the secret manually."
      return
    }
    gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body $token 1>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN configured." -ForegroundColor Green
    } else {
      Write-Warning "Failed to set GitHub secret via gh. Set it manually in your repo settings."
    }
  } catch {
    Write-Warning "Failed to set GitHub secret via gh. Set it manually in your repo settings."
  }
}

function Try-InviteAdmin([string]$resourceGroup, [string]$swaName, [string]$githubUsername) {
  if (-not $githubUsername) { return }
  try {
    $out = az staticwebapp users invite -n $swaName -g $resourceGroup --role administrator --provider github --user-details $githubUsername -o json 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Failed to create admin invite via Azure CLI. You can invite manually in the Azure Portal or via 'az staticwebapp users invite'."
      return
    }
    $obj = $out | ConvertFrom-Json
    $url = $obj.invitationUrl ?? $obj.inviteUrl ?? $obj.url
    if ($url) {
      Write-Host "Admin invite created. Ask the user to open this URL and accept:" -ForegroundColor Green
      Write-Host $url
    } else {
      Write-Host "Admin invite created (no URL returned by CLI output)." -ForegroundColor Green
    }
  } catch {
    Write-Warning "Failed to create admin invite via Azure CLI."
  }
}

Require-Command "az" "Install Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli"
Require-Command "terraform" "Install Terraform: https://developer.hashicorp.com/terraform/downloads"

Ensure-AzLogin
Ensure-StaticWebAppExtension

$Prefix = ($Prefix || "").Trim().ToLower()
if (-not $Prefix) { $Prefix = "foundry" }

$SubscriptionId = Select-SubscriptionIfNeeded $SubscriptionId
$Location = Detect-Location

$tfvarsPath = Join-Path (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\\infra")) "terraform.tfvars"
Write-Host "Writing $tfvarsPath" -ForegroundColor Cyan
Write-TfVars $tfvarsPath $Prefix $Location $SubscriptionId

Write-Host "Deploying Azure resources via Terraform..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "ezdeploy.ps1") -PlanOnly:$PlanOnly -SkipAppSettings:$SkipAppSettings
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $PlanOnly) {
  $rg = "${Prefix}-rg"
  $swa = "${Prefix}-swa"
  $token = Try-Get-SwaDeploymentToken $SubscriptionId $rg $swa
  if ($token) {
    Write-Host "SWA deployment token retrieved." -ForegroundColor Green
  } else {
    Write-Warning "Could not automatically retrieve the SWA deployment token."
  }

  Try-SetGitHubSecret $token
  Try-InviteAdmin $rg $swa $GitHubAdminUsername
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "- Push to GitHub to trigger the SWA GitHub Actions deploy."
Write-Host "- (Optional) Add a custom domain in Azure Static Web Apps (see README)."
