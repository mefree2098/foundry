variable "prefix" {
  description = "Project/resource prefix (e.g., foundry)"
  type        = string
}

variable "enforce_free_tier" {
  description = "When true, prevent configuring paid SKUs/features by default."
  type        = bool
  default     = true
}

variable "location" {
  description = "Azure region (e.g., westus2) - must support Static Web Apps Free."
  type        = string
  default     = "westus2"
}

variable "cosmos_enable_free_tier" {
  description = "Enable Cosmos DB free tier (one per subscription)."
  type        = bool
  default     = true
  validation {
    condition     = !var.enforce_free_tier || var.cosmos_enable_free_tier
    error_message = "When enforce_free_tier=true, cosmos_enable_free_tier must be true."
  }
}

variable "cosmos_use_serverless" {
  description = "Use Cosmos DB serverless (recommended for near-zero cost when idle)."
  type        = bool
  default     = false
  validation {
    condition     = !var.enforce_free_tier || var.cosmos_use_serverless == false
    error_message = "When enforce_free_tier=true, cosmos_use_serverless must be false (Cosmos free tier is provisioned/shared throughput)."
  }
}

variable "cosmos_shared_database_max_throughput" {
  description = "Cosmos SQL database autoscale max throughput (shared across all containers). Use 1000 to stay in free tier."
  type        = number
  default     = 1000
  validation {
    condition     = var.cosmos_use_serverless || var.cosmos_shared_database_max_throughput >= 1000
    error_message = "cosmos_shared_database_max_throughput must be >= 1000 (minimum autoscale max throughput)."
  }
  validation {
    condition     = var.cosmos_use_serverless || !var.enforce_free_tier || var.cosmos_shared_database_max_throughput == 1000
    error_message = "When enforce_free_tier=true (and not serverless), cosmos_shared_database_max_throughput must be 1000."
  }
}

variable "subscription_id" {
  description = "Azure subscription ID to deploy into."
  type        = string
}

variable "static_web_app_sku" {
  description = "Static Web App SKU"
  type        = string
  default     = "Free"
  validation {
    condition     = !var.enforce_free_tier || lower(var.static_web_app_sku) == "free"
    error_message = "When enforce_free_tier=true, static_web_app_sku must be \"Free\"."
  }
}

variable "static_web_app_repo_url" {
  description = "Optional repo URL for SWA (if linking GitHub)."
  type        = string
  default     = ""
}

variable "static_web_app_branch" {
  description = "Branch for SWA build (if linking GitHub)."
  type        = string
  default     = "main"
}

variable "static_web_app_token" {
  description = "Deployment token (used only if linking repo in Terraform)."
  type        = string
  default     = ""
  sensitive   = true
}
