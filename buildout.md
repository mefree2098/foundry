# New Technology Research (NTR) – buildout plan

This tracks the retrofit from the “perpetualrecords” template into the NTR site at `ntechr.com`. Every section has a status (`pending`, `in progress`, `complete`).

- Stack currency check (2025-12-17 via `npm view`): React 19.2.3, React DOM 19.2.3, Vite 7.3.0, @vitejs/plugin-react 5.1.2, Tailwind CSS 4.1.18 (+ @tailwindcss/vite 4.1.18), lucide-react 0.561.0, react-router-dom 7.11.0, zod 4.2.1, @tanstack/react-query 5.90.12, @tanstack/react-query-persist-client 5.90.14, @azure/functions 4.10.0, @azure/cosmos 4.9.0. Local Node: v22.14.0.
- Cost constraint: target $0/month (SWA Free + Cosmos free tier/shared autoscale max 1000 RU; storage/ACS optional).
- Product concept: “Bring your own AI” (client supplies their own API keys for their chosen AI provider).

## 1) Branding & design system [complete]
- Rebranded UI and copy to New Technology Research; emerald palette; logo in `public/img/ntr-logo.png`.
- Public routes: Home, Platforms, News, Topics, About, Subscribe.

## 2) Content model [complete]
- Replaced Artist/Release/Genre with Platforms, News, and Topics (shared Zod schemas in `src/types/content.ts` and `api/src/types/content.ts`).
- Cosmos containers: `platforms`, `news`, `topics`, `config`, `subscribers`.

## 3) API (Azure Functions) [complete]
- CRUD: `GET/POST/PUT/DELETE` for `/platforms`, `/news`, `/topics`.
- Site config: `GET/PUT /config`.
- Subscriptions: `POST /subscriptions` (stores subscribers in `subscribers`).
- Email: `POST /email/send` and `GET /email/stats` (ACS email; optional MailerLite sync).
- Media upload: `GET /media/sas` (Azure Blob SAS).

## 4) Admin CMS [complete]
- `/admin` for managing Platforms, Topics, News, site config, and email campaigns.
- Server-side admin enforcement via SWA client principal `administrator` role.

## 5) Infra & deployment [in progress]
- Terraform provisions RG/SWA/Cosmos/Storage under `infra/`.
- Next steps:
  - Configure SWA app settings (Cosmos + storage + `PUBLIC_SITE_URL`).
  - Point `ntechr.com` DNS to the Static Web App custom domain.
  - Add initial Platforms/Topics/News content in `/admin`.

## 6) Launch polish [pending]
- Add SEO metadata/OpenGraph, and a clear contact CTA.
- Do an accessibility pass (contrast/focus) and an image sizing/perf pass.
