import {
  newsListSchema,
  newsSchema,
  platformListSchema,
  platformSchema,
  topicListSchema,
  topicSchema,
  siteConfigSchema,
} from "../types/content";

export function validatePlatform(input: unknown) {
  return platformSchema.safeParse(input);
}

export function validatePlatforms(input: unknown) {
  return platformListSchema.safeParse(input);
}

export function validateNews(input: unknown) {
  return newsSchema.safeParse(input);
}

export function validateNewsList(input: unknown) {
  return newsListSchema.safeParse(input);
}

export function validateTopic(input: unknown) {
  return topicSchema.safeParse(input);
}

export function validateTopics(input: unknown) {
  return topicListSchema.safeParse(input);
}

export function validateSiteConfig(input: unknown) {
  return siteConfigSchema.safeParse(input);
}
