import { z } from "zod";

export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only");

export const urlSchema = z.string().url("Must be a valid URL");

export const topicSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  colorHint: z.string().optional(),
  icon: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Topic = z.infer<typeof topicSchema>;

export const platformSchema = z.object({
  id: slugSchema,
  name: z.string().min(1).max(100),
  tagline: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  heroImageUrl: urlSchema.optional(),
  galleryImages: urlSchema.array().optional(),
  links: z.record(z.string(), urlSchema).optional(),
  topics: slugSchema.array().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().optional(),
  theme: z
    .object({
      accentColor: z.string().optional(),
      backgroundStyle: z
        .object({
          color: z.string().optional(),
          gradient: z.string().optional(),
          imageUrl: urlSchema.optional(),
          overlayOpacity: z.number().min(0).max(1).optional(),
        })
        .optional(),
    })
    .optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Platform = z.infer<typeof platformSchema>;

export const newsSchema = z.object({
  id: slugSchema,
  title: z.string().min(1).max(200),
  type: z.enum(["Announcement", "Update", "Insight"]).optional(),
  status: z.enum(["Draft", "Published"]).optional(),
  publishDate: z.string().optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  imageUrl: urlSchema.optional(),
  imageAlt: z.string().optional(),
  links: z.record(z.string(), urlSchema).optional(),
  platformIds: slugSchema.array().optional(),
  topics: slugSchema.array().optional(),
  isFeatured: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type NewsPost = z.infer<typeof newsSchema>;

export const subscriberSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  subscribeAll: z.boolean().optional(),
  platformIds: slugSchema.array().optional(),
  status: z.enum(["active", "unsubscribed"]).optional(),
  mailerLiteId: z.string().optional(),
  unsubscribeToken: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Subscriber = z.infer<typeof subscriberSchema>;

export const emailSettingsSchema = z.object({
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  templateSubject: z.string().optional(),
  templateHtml: z.string().optional(),
  manageUrl: z.string().url().optional(),
  batchSize: z.number().int().positive().max(490).optional(),
  mailerLiteAllGroupId: z.string().optional(),
  mailerLitePlatformGroupIds: z.record(z.string(), z.string()).optional(),
  autoNotifyOnNews: z.boolean().optional(),
  mailerLiteApiKey: z.string().optional(),
  hasMailerLiteApiKey: z.boolean().optional(),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export const siteConfigSchema = z.object({
  id: z.string().default("global"),
  palette: z
    .object({
      primary: z.string(),
      secondary: z.string().optional(),
      background: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
  fonts: z
    .object({
      heading: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
  logoUrl: urlSchema.optional(),
  homeTagline: z.string().optional(),
  footerTagline: z.string().optional(),
  featuredPlatformIds: slugSchema.array().optional(),
  featuredNewsIds: slugSchema.array().optional(),
  featuredTopicIds: slugSchema.array().optional(),
  heroTitle: z.string().optional(),
  heroSubtitle: z.string().optional(),
  heroBadges: z.string().array().optional(),
  heroCtaText: z.string().optional(),
  heroCtaUrl: urlSchema.optional(),
  socialLinks: z.record(z.string(), urlSchema).optional(),
  analytics: z
    .object({
      googleAnalyticsId: z.string().optional(),
    })
    .optional(),
  emailSettings: emailSettingsSchema.optional(),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;

export const platformListSchema = platformSchema.array();
export const newsListSchema = newsSchema.array();
export const topicListSchema = topicSchema.array();
export const subscriberListSchema = subscriberSchema.array();
