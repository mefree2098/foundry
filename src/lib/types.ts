import type { z } from "zod";
import {
  newsSchema,
  platformSchema,
  topicSchema,
  siteConfigSchema,
  type NewsPost as ApiNewsPost,
  type Platform as ApiPlatform,
  type Topic as ApiTopic,
  type SiteConfig as ApiSiteConfig,
  type Subscriber as ApiSubscriber,
  type EmailSettings as ApiEmailSettings,
  type ContactSettings as ApiContactSettings,
  type CustomPage as ApiCustomPage,
} from "../types/content";

export type Platform = ApiPlatform;
export type NewsPost = ApiNewsPost;
export type Topic = ApiTopic;
export type SiteConfig = ApiSiteConfig;
export type Subscriber = ApiSubscriber;
export type EmailSettings = ApiEmailSettings;
export type ContactSettings = ApiContactSettings;
export type CustomPage = ApiCustomPage;

export type PlatformValidation = z.infer<typeof platformSchema>;
export type NewsPostValidation = z.infer<typeof newsSchema>;
export type TopicValidation = z.infer<typeof topicSchema>;
export type SiteConfigValidation = z.infer<typeof siteConfigSchema>;
