import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { queryClient } from "./lib/api";

const persister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: "ntechr-cache",
      })
    : undefined;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {persister ? (
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <App />
      </PersistQueryClientProvider>
    ) : (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )}
  </React.StrictMode>,
);
