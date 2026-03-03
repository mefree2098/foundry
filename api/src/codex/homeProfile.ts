export const CODEX_HOME_PROFILES = ["auto", "azure", "aws", "local", "custom"] as const;
export type CodexHomeProfile = (typeof CODEX_HOME_PROFILES)[number];

function normalizeAwsRoot(input?: string) {
  const trimmed = (input || "").trim();
  const withDefault = trimmed || "/mnt/efs";
  const normalized = withDefault.endsWith("/") ? withDefault.slice(0, -1) : withDefault;
  return normalized || "/mnt/efs";
}

function looksLikeAwsRuntime() {
  return Boolean(
    (process.env.AWS_EXECUTION_ENV || "").trim() ||
      (process.env.ECS_CONTAINER_METADATA_URI || "").trim() ||
      (process.env.ECS_CONTAINER_METADATA_URI_V4 || "").trim() ||
      (process.env.EKS_CLUSTER_NAME || "").trim(),
  );
}

function looksLikeAzureRuntime() {
  return Boolean((process.env.WEBSITE_SITE_NAME || "").trim() || (process.env.WEBSITE_INSTANCE_ID || "").trim());
}

export function deriveCodexHomeFromProfile(profileRaw?: string, awsVolumeRootRaw?: string) {
  const profile = (profileRaw || "").trim().toLowerCase() as CodexHomeProfile | "";
  const awsRoot = normalizeAwsRoot(awsVolumeRootRaw);

  if (profile === "custom") return undefined;
  if (profile === "azure") return "/home/site/.codex/ntechr";
  if (profile === "aws") return `${awsRoot}/.codex/ntechr`;
  if (profile === "local") return ".codex-home";

  if (looksLikeAzureRuntime()) return "/home/site/.codex/ntechr";
  if (looksLikeAwsRuntime()) return `${awsRoot}/.codex/ntechr`;
  return ".codex-home";
}

