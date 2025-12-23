import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import SectionCard from "../components/SectionCard";
import { fetchConfig } from "../lib/api";
import type { CustomPage as CustomPageConfig } from "../lib/types";
import NotFound from "./NotFound";

function buildSrcDoc(page: CustomPageConfig) {
  const html = page.html || "";
  const css = page.css || "";
  const script = page.script || "";
  const externalScripts = (page.externalScripts || []).map((src) => `<script src="${src}"></script>`).join("\n");
  const inlineScript = script ? `<script>${script}</script>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body { margin: 0; padding: 0; background: #050a0a; color: #e2e8f0; font-family: system-ui, sans-serif; }
      ${css}
    </style>
    ${externalScripts}
  </head>
  <body>
    ${html}
    ${inlineScript}
  </body>
</html>`;
}

function CustomPage() {
  const { pageId } = useParams();
  const queryClient = useQueryClient();
  const cachedConfig = queryClient.getQueryData(["config"]) as Awaited<ReturnType<typeof fetchConfig>> | undefined;
  const { data: config, isLoading } = useQuery({ queryKey: ["config"], queryFn: fetchConfig, placeholderData: cachedConfig });

  if (!pageId) return <NotFound />;

  const pages = (config?.pages || []).filter((p) => p && p.id);
  const page = pages.find((p) => p.id === pageId && (p.enabled ?? true));

  if (isLoading && !config) {
    return (
      <SectionCard title="Loading...">
        <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
      </SectionCard>
    );
  }

  if (!page) return <NotFound />;

  const srcDoc = buildSrcDoc(page);
  const height = page.height ?? 560;

  return (
    <div className="space-y-6">
      <SectionCard title={page.title || page.id}>
        {page.description ? <p className="mb-4 text-sm text-slate-300">{page.description}</p> : null}
        <iframe
          title={page.title || page.id}
          className="w-full rounded-2xl border border-white/10 bg-black"
          style={{ height }}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-forms allow-modals"
          loading="lazy"
        />
      </SectionCard>
    </div>
  );
}

export default CustomPage;
