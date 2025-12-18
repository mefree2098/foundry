#requires -Version 7
Param(
  [string]$TerraformDir = "$(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\infra'))",
  [switch]$PlanOnly,
  [switch]$SkipAppSettings
)

Write-Host "=== Foundry ezdeploy ===" -ForegroundColor Cyan
Write-Host "Terraform dir: $TerraformDir"

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
  Write-Error "Terraform is not installed or not in PATH. Please install Terraform >= 1.7."
  exit 1
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  Write-Error "Azure CLI (az) is not installed or not in PATH."
  exit 1
}

az account show 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Azure CLI is not authenticated. Run 'az login' first."
  exit 1
}

Set-Location $TerraformDir

function Get-TfVarValue($key) {
  $tfvarsPath = Join-Path $TerraformDir "terraform.tfvars"
  if (-not (Test-Path $tfvarsPath)) { return $null }
  $escapedKey = [regex]::Escape($key)
  $quotedPattern = '^\s*' + $escapedKey + '\s*=\s*"([^"]*)"'
  $barePattern = '^\s*' + $escapedKey + '\s*=\s*([^\s#]+)'
  foreach ($line in (Get-Content $tfvarsPath)) {
    $trimmed = $line.Trim()
    if (-not $trimmed) { continue }
    if ($trimmed.StartsWith("#") -or $trimmed.StartsWith("//")) { continue }

    if ($trimmed -match $quotedPattern) {
      return $Matches[1]
    }
    if ($trimmed -match $barePattern) {
      return $Matches[1].Trim()
    }
  }
  return $null
}

$prefix = $env:TF_VAR_prefix
if (-not $prefix) { $prefix = Get-TfVarValue "prefix" }
if (-not $prefix) { $prefix = "foundry" }

$subscriptionId = $env:TF_VAR_subscription_id
if (-not $subscriptionId) { $subscriptionId = Get-TfVarValue "subscription_id" }
if (-not $subscriptionId) {
  Write-Error "subscription_id is required. Set TF_VAR_subscription_id or create infra/terraform.tfvars with subscription_id."
  exit 1
}

$location = $env:TF_VAR_location
if (-not $location) { $location = Get-TfVarValue "location" }
if (-not $location) { $location = "westus2" }

Write-Host "`nUsing prefix=$prefix, subscription_id=$subscriptionId, location=$location" -ForegroundColor Green
az account set --subscription $subscriptionId 1>$null 2>$null

function InState($resource) {
  (terraform state list 2>$null) -contains $resource
}

function Import-If-Exists {
  param(
    [string]$TfResource,
    [string]$AzCommand,
    [string]$Id
  )
  if (InState $TfResource) { return }
  Invoke-Expression "$AzCommand 1>`$null 2>`$null"
  $exists = ($LASTEXITCODE -eq 0)
  if ($exists -and $Id) {
    Write-Host "Importing $TfResource" -ForegroundColor Yellow
    terraform import $TfResource $Id
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}

Write-Host "`nRunning terraform init..." -ForegroundColor Cyan
terraform init
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Import existing resources if they already exist to avoid recreate
$rgId = "/subscriptions/$subscriptionId/resourceGroups/${prefix}-rg"
Import-If-Exists "azurerm_resource_group.rg" "az group show -n ${prefix}-rg --subscription $subscriptionId" $rgId

$swaId = "/subscriptions/$subscriptionId/resourceGroups/${prefix}-rg/providers/Microsoft.Web/staticSites/${prefix}-swa"
Import-If-Exists "azurerm_static_web_app.swa" "az staticwebapp show --name ${prefix}-swa --resource-group ${prefix}-rg --subscription $subscriptionId" $swaId

$cosmosId = "/subscriptions/$subscriptionId/resourceGroups/${prefix}-rg/providers/Microsoft.DocumentDB/databaseAccounts/${prefix}-cosmos"
Import-If-Exists "azurerm_cosmosdb_account.cosmos" "az cosmosdb show --name ${prefix}-cosmos --resource-group ${prefix}-rg --subscription $subscriptionId" $cosmosId

$dbId = "/subscriptions/$subscriptionId/resourceGroups/${prefix}-rg/providers/Microsoft.DocumentDB/databaseAccounts/${prefix}-cosmos/sqlDatabases/${prefix}-db"
Import-If-Exists "azurerm_cosmosdb_sql_database.db" "az cosmosdb sql database show --account-name ${prefix}-cosmos --name ${prefix}-db --resource-group ${prefix}-rg --subscription $subscriptionId" $dbId

$containers = @(
  @{ tf="azurerm_cosmosdb_sql_container.platforms"; name="platforms" },
  @{ tf="azurerm_cosmosdb_sql_container.news"; name="news" },
  @{ tf="azurerm_cosmosdb_sql_container.topics"; name="topics" },
  @{ tf="azurerm_cosmosdb_sql_container.config"; name="config" },
  @{ tf="azurerm_cosmosdb_sql_container.subscribers"; name="subscribers" }
)
foreach ($c in $containers) {
  $cid = "/subscriptions/$subscriptionId/resourceGroups/${prefix}-rg/providers/Microsoft.DocumentDB/databaseAccounts/${prefix}-cosmos/sqlDatabases/${prefix}-db/containers/$($c.name)"
  $cmd = "az cosmosdb sql container show --account-name ${prefix}-cosmos --database-name ${prefix}-db --name $($c.name) --resource-group ${prefix}-rg --subscription $subscriptionId"
  Import-If-Exists $c.tf $cmd $cid
}

$storageAccountName = (($prefix.ToLower() -replace '[^a-z0-9]', '') + 'stor')
if ($storageAccountName.Length -gt 24) { $storageAccountName = $storageAccountName.Substring(0, 24) }

$storageAccountId = "/subscriptions/$subscriptionId/resourceGroups/${prefix}-rg/providers/Microsoft.Storage/storageAccounts/$storageAccountName"
Import-If-Exists "azurerm_storage_account.media" "az storage account show -n $storageAccountName -g ${prefix}-rg --subscription $subscriptionId" $storageAccountId

$storageContainerId = "/subscriptions/$subscriptionId/resourceGroups/${prefix}-rg/providers/Microsoft.Storage/storageAccounts/$storageAccountName/blobServices/default/containers/media"
Import-If-Exists "azurerm_storage_container.media" "az resource show --ids $storageContainerId --subscription $subscriptionId" $storageContainerId

$varArgs = @(
  "-var", "prefix=$prefix",
  "-var", "subscription_id=$subscriptionId",
  "-var", "location=$location"
)

Write-Host "`nRunning terraform plan..." -ForegroundColor Cyan
terraform plan @varArgs -out=tfplan
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($PlanOnly) {
  Write-Host "`nPlan complete (plan-only mode)." -ForegroundColor Yellow
  exit 0
}

Write-Host "`nApplying terraform..." -ForegroundColor Cyan
terraform apply -auto-approve tfplan
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Get-TfOutputRaw([string]$name) {
  $out = terraform output -raw $name 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return $out
}

if (-not $SkipAppSettings) {
  Write-Host "`nApplying Static Web App app settings from terraform outputs..." -ForegroundColor Cyan
  $swaHostname = Get-TfOutputRaw "static_web_app_default_hostname"
  $cosmosEndpoint = Get-TfOutputRaw "cosmos_endpoint"
  $cosmosKey = Get-TfOutputRaw "cosmos_primary_key"
  $storageConn = Get-TfOutputRaw "storage_account_connection_string"

  if ($swaHostname -and $cosmosEndpoint -and $cosmosKey) {
    $publicSiteUrl = "https://$swaHostname"
    & (Join-Path $PSScriptRoot "set-swa-settings.ps1") `
      -ResourceGroup "${prefix}-rg" `
      -StaticWebAppName "${prefix}-swa" `
      -CosmosEndpoint $cosmosEndpoint `
      -CosmosKey $cosmosKey `
      -CosmosDatabase "${prefix}-db" `
      -StorageConnectionString $storageConn `
      -PublicSiteUrl $publicSiteUrl
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } else {
    Write-Warning "Skipping app settings: missing terraform outputs (static_web_app_default_hostname/cosmos_endpoint/cosmos_primary_key)."
  }
}

Write-Host "`nDeployment complete." -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "1) Commit & push to trigger GitHub Actions workflow for SWA deploy."
Write-Host "2) Add a custom domain (optional) and set up admin auth." -ForegroundColor Yellow
