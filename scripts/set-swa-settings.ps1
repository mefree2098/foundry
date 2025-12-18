#requires -Version 7
Param(
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [Parameter(Mandatory = $true)][string]$StaticWebAppName,
  [string]$CosmosEndpoint,
  [string]$CosmosKey,
  [string]$CosmosConnectionString,
  [string]$CosmosDatabase,
  [string]$StorageConnectionString,
  [string]$StorageContainerName = "media",
  [string]$PublicSiteUrl
)

Write-Host "Setting SWA app settings..." -ForegroundColor Cyan

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  Write-Error "Azure CLI is not installed or not in PATH."
  exit 1
}

if (-not $CosmosConnectionString -and (-not $CosmosEndpoint -or -not $CosmosKey)) {
  Write-Error "Provide either -CosmosConnectionString or both -CosmosEndpoint and -CosmosKey."
  exit 1
}

$settings = @{
  COSMOS_DATABASE = $CosmosDatabase
}

if ($CosmosConnectionString) {
  $settings.COSMOS_CONNECTION_STRING = $CosmosConnectionString
}

if ($CosmosEndpoint) {
  $settings.COSMOS_ENDPOINT = $CosmosEndpoint
}

if ($CosmosKey) {
  $settings.COSMOS_KEY = $CosmosKey
}

if ($StorageConnectionString) {
  $settings.STORAGE_CONNECTION_STRING = $StorageConnectionString
  if ($StorageContainerName) {
    $settings.STORAGE_CONTAINER_NAME = $StorageContainerName
  }
} else {
  Write-Warning "STORAGE_CONNECTION_STRING not provided; media uploads will fail until it is set."
}

if ($PublicSiteUrl) {
  $settings.PUBLIC_SITE_URL = $PublicSiteUrl
}

$settingNames = @(
  $settings.GetEnumerator()
  | Sort-Object Key
  | ForEach-Object { "$($_.Key)=$($_.Value)" }
)

az staticwebapp appsettings set `
  --name $StaticWebAppName `
  --resource-group $ResourceGroup `
  --setting-names $settingNames

if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to set app settings."
  exit $LASTEXITCODE
}

Write-Host "App settings applied." -ForegroundColor Green
