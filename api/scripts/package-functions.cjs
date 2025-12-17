const fs = require("fs");
const path = require("path");

const root = process.cwd();
const dist = path.join(root, "dist");
const distNodeModules = path.join(dist, "node_modules");

// Ensure we never ship a nested node_modules (breaks zipping/symlinks), but keep compiled output intact.
fs.rmSync(distNodeModules, { recursive: true, force: true });
if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}

// Copy metadata needed at runtime
for (const f of ["host.json", "package.json", "package-lock.json"]) {
  fs.copyFileSync(path.join(root, f), path.join(dist, f));
}

// Do not copy node_modules into dist; Oryx/Functions runtime will use root node_modules.
