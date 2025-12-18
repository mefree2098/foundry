import type { CSSProperties } from "react";

type EmbedMode = "html" | "threejs";

type EmbedConfig = {
  mode?: EmbedMode;
  html?: string;
  script?: string;
  height?: number;
};

const DEFAULT_HEIGHT = 360;

function buildThreeTemplate(script: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
      canvas { width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <canvas id="three-canvas"></canvas>
    <script src="https://unpkg.com/three@0.164.1/build/three.min.js"></script>
    <script>
      const canvas = document.getElementById('three-canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(0, 0, 3);

      function resize() {
        const { width, height } = canvas.getBoundingClientRect();
        renderer.setSize(width, height, false);
        camera.aspect = width / height || 1;
        camera.updateProjectionMatrix();
      }

      window.addEventListener('resize', resize);
      resize();

      window.__three = { THREE, scene, camera, renderer, canvas, resize };
    </script>
    <script>
${script}
    </script>
  </body>
</html>`;
}

function normalizeHtml(html: string) {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().includes("<html")) return trimmed;
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body>${trimmed}</body></html>`;
}

export function EmbedBlock({ embed, className }: { embed?: EmbedConfig; className?: string }) {
  if (!embed) return null;
  const mode = embed.mode || "html";
  const height = embed.height || DEFAULT_HEIGHT;

  let srcDoc = "";
  if (mode === "threejs" && embed.script) {
    srcDoc = buildThreeTemplate(embed.script);
  } else if (embed.html) {
    srcDoc = normalizeHtml(embed.html);
  }

  if (!srcDoc) return null;

  const style: CSSProperties = { height };

  return (
    <div className={className}>
      <iframe
        title="Embedded content"
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-same-origin"
        className="w-full rounded-xl border-0 bg-black/40"
        style={style}
      />
    </div>
  );
}
