export type AiProvider = {
  id: string;
  label: string;
  icon?: string; // SimpleIcons slug or URL
};

// SimpleIcons CDN: https://cdn.simpleicons.org/<slug>
export const AI_PROVIDERS: AiProvider[] = [
  { id: "openai", label: "OpenAI", icon: "https://cdn.simpleicons.org/openai" },
  { id: "anthropic", label: "Anthropic", icon: "https://cdn.simpleicons.org/anthropic" },
  { id: "googlegemini", label: "Google Gemini", icon: "https://cdn.simpleicons.org/googlegemini" },
  { id: "microsoftazure", label: "Azure", icon: "https://cdn.simpleicons.org/microsoftazure" },
  { id: "amazonaws", label: "AWS", icon: "https://cdn.simpleicons.org/amazonaws" },
  { id: "mistralai", label: "Mistral", icon: "https://cdn.simpleicons.org/mistralai" },
  { id: "cohere", label: "Cohere", icon: "https://cdn.simpleicons.org/cohere" },
];
