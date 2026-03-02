import { app, type InvocationContext, type Timer } from "@azure/functions";
import { listImportSources, runImportJob } from "../business/imports.js";

async function runScheduledBusinessImports(_timer: Timer, context: InvocationContext) {
  const enabled = String(process.env.BUSINESS_IMPORTS_TIMER_ENABLED || "true").toLowerCase() === "true";
  if (!enabled) {
    context.log("Business import timer disabled");
    return;
  }

  try {
    const sources = await listImportSources();
    const runnable = sources.filter((source) => source.state === "active" && source.schedule);

    for (const source of runnable) {
      try {
        const job = await runImportJob({ sourceId: source.id });
        context.log(`Ran scheduled import source=${source.id} job=${job.id}`);
      } catch (error) {
        context.error(`Failed scheduled import source=${source.id}`, error);
      }
    }

    context.log(`Business scheduled imports completed. runnable=${runnable.length}`);
  } catch (error) {
    context.error("Business scheduled imports timer failed", error);
  }
}

app.timer("business-imports-runner", {
  schedule: "0 30 3 * * *",
  handler: runScheduledBusinessImports,
});
