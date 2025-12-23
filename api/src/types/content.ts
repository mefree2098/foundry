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
  custom: z.record(z.string(), z.any()).optional(),
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
  custom: z.record(z.string(), z.any()).optional(),
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
  custom: z.record(z.string(), z.any()).optional(),
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

export const contactSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  recipientEmail: z.string().email().optional(),
  subjectTemplate: z.string().optional(),
  successMessage: z.string().optional(),
});
export type ContactSettings = z.infer<typeof contactSettingsSchema>;

export const customPageSchema = z.object({
  id: slugSchema,
  title: z.string().min(1),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  html: z.string().optional(),
  css: z.string().optional(),
  script: z.string().optional(),
  externalScripts: z.array(urlSchema).optional(),
  height: z.number().int().positive().max(2000).optional(),
});
export type CustomPage = z.infer<typeof customPageSchema>;

const cssVarMapSchema = z.record(z.string(), z.string());

const navLinkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  href: z.string().min(1),
  enabled: z.boolean().optional(),
  newTab: z.boolean().optional(),
});

const homeSectionSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    enabled: z.boolean().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    maxItems: z.number().int().positive().max(24).optional(),
    markdown: z.string().optional(),
    cta: z
      .object({
        primaryText: z.string().optional(),
        primaryHref: z.string().optional(),
        secondaryText: z.string().optional(),
        secondaryHref: z.string().optional(),
      })
      .optional(),
    embed: z
      .object({
        mode: z.enum(["html", "threejs"]).optional(),
        html: z.string().optional(),
        script: z.string().optional(),
        height: z.number().int().positive().max(2000).optional(),
      })
      .optional(),
  })
  .passthrough();

export const siteConfigSchema = z.object({
  id: z.string().default("global"),
  siteName: z.string().optional(),
  palette: z
    .object({
      primary: z.string(),
      secondary: z.string().optional(),
      background: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
  theme: z
    .object({
      active: z.string().optional(),
      themes: z
        .array(
          z.object({
            id: z.string().min(1),
            name: z.string().min(1),
            vars: cssVarMapSchema,
          }),
        )
        .optional(),
      overrides: z.record(z.string(), cssVarMapSchema).optional(),
    })
    .optional(),
  fonts: z
    .object({
      heading: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
  logoUrl: urlSchema.optional(),
  nav: z
    .object({
      links: navLinkSchema.array().optional(),
    })
    .optional(),
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
  home: z
    .object({
      sections: homeSectionSchema.array().optional(),
      trustSection: z
        .object({
          title: z.string().optional(),
          cards: z
            .array(
              z.object({
                id: z.string().min(1),
                title: z.string().min(1),
                body: z.string().min(1),
                icon: z.string().optional(),
                iconColor: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
      aiSection: z
        .object({
          title: z.string().optional(),
          subtitle: z.string().optional(),
          footnote: z.string().optional(),
          providers: z
            .array(
              z.object({
                id: z.string().min(1),
                label: z.string().min(1),
                icon: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
  emailSettings: emailSettingsSchema.optional(),
  contact: contactSettingsSchema.optional(),
  pages: customPageSchema.array().optional(),
  ai: z
    .object({
      adminAssistant: z
        .object({
          openai: z
            .object({
              model: z.string().optional(),
              imageModel: z.string().optional(),
              imageSize: z.string().optional(),
              imageQuality: z.string().optional(),
              imageBackground: z.string().optional(),
              imageOutputFormat: z.string().optional(),
              apiKey: z.string().optional(),
              hasApiKey: z.boolean().optional(),
              clearApiKey: z.boolean().optional(),
            })
            .optional(),
          activePersonalityId: z.string().optional(),
          personalities: z
            .array(
              z.object({
                id: z.string().min(1),
                name: z.string().min(1),
                prompt: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
      pricing: z
        .object({
          source: z.string().optional(),
          updatedAt: z.string().optional(),
          models: z
            .record(
              z.string(),
              z.object({
                inputUsdPerMillion: z.number().nonnegative(),
                outputUsdPerMillion: z.number().nonnegative(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
  content: z
    .object({
      schemas: z
        .object({
          platforms: z
            .array(
              z.object({
                id: z.string().min(1),
                label: z.string().min(1),
                type: z.string().min(1),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                help: z.string().optional(),
              }),
            )
            .optional(),
          news: z
            .array(
              z.object({
                id: z.string().min(1),
                label: z.string().min(1),
                type: z.string().min(1),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                help: z.string().optional(),
              }),
            )
            .optional(),
          topics: z
            .array(
              z.object({
                id: z.string().min(1),
                label: z.string().min(1),
                type: z.string().min(1),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                help: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});
export type SiteConfig = z.infer<typeof siteConfigSchema>;

export const platformListSchema = platformSchema.array();
export const newsListSchema = newsSchema.array();
export const topicListSchema = topicSchema.array();
export const subscriberListSchema = subscriberSchema.array();
