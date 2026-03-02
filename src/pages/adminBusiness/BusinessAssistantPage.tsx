import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import BusinessSection from "./BusinessSection";
import { businessAiApply, businessAiChat } from "../../lib/api";
import type { BusinessAiAction } from "../../lib/businessSchemas";

type Message = { role: "user" | "assistant"; content: string };

function BusinessAssistantPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"safe" | "simulation" | "live">("safe");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposedActions, setProposedActions] = useState<BusinessAiAction[]>([]);
  const [confirmToken, setConfirmToken] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");

  const chatMutation = useMutation({
    mutationFn: () =>
      businessAiChat({
        mode,
        messages: [...messages, { role: "user", content: input.trim() }],
      }),
    onSuccess: (result) => {
      setMessages((prev) => [...prev, { role: "user", content: input.trim() }, { role: "assistant", content: result.assistantMessage }]);
      setAssistantMessage(result.assistantMessage);
      setProposedActions(result.proposedActions || []);
      setConfirmToken(result.confirmToken || "");
      setInput("");
    },
  });

  const applyMutation = useMutation({
    mutationFn: (applyMode: "simulation" | "live") =>
      businessAiApply({
        mode: applyMode,
        actions: proposedActions,
        confirmToken,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business"] });
    },
  });

  return (
    <BusinessSection
      title="Business Assistant"
      summary="AI-assisted workflow is simulation-first: propose actions, review impact, then confirm before commit."
    >
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-3 md:grid-cols-4">
        <label className="grid gap-1 md:col-span-1">
          <span className="text-xs text-slate-300">Mode</span>
          <select className="input-field" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="safe">safe</option>
            <option value="simulation">simulation</option>
            <option value="live">live</option>
          </select>
        </label>
        <label className="grid gap-1 md:col-span-3">
          <span className="text-xs text-slate-300">Prompt</span>
          <div className="flex gap-2">
            <input className="input-field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Example: create invoice for acme-co for $500" />
            <button className="btn btn-primary" type="button" disabled={chatMutation.status === "pending" || !input.trim()} onClick={() => void chatMutation.mutateAsync()}>
              {chatMutation.status === "pending" ? "Planning..." : "Plan"}
            </button>
          </div>
        </label>
      </div>

      {assistantMessage ? <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{assistantMessage}</div> : null}

      {proposedActions.length ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Proposed actions</div>
          <div className="mt-2 space-y-2">
            {proposedActions.map((action) => (
              <div key={action.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200">
                <div className="font-semibold text-slate-100">
                  {action.type} {action.simulation ? "(simulation)" : "(live)"}
                </div>
                <div className="text-slate-400">Reason: {action.reason}</div>
                <pre className="mt-1 max-h-28 overflow-auto rounded border border-white/10 bg-black/30 p-2 text-[11px] text-slate-300">
                  {JSON.stringify(action.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-secondary" type="button" disabled={applyMutation.status === "pending"} onClick={() => void applyMutation.mutateAsync("simulation")}>
              Simulate actions
            </button>
            <button className="btn btn-primary" type="button" disabled={applyMutation.status === "pending"} onClick={() => void applyMutation.mutateAsync("live")}>
              Apply live
            </button>
          </div>
        </div>
      ) : null}

      {applyMutation.data ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Apply results ({applyMutation.data.mode})</div>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-200">
            {JSON.stringify(applyMutation.data, null, 2)}
          </pre>
        </div>
      ) : null}

      {messages.length ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Conversation</div>
          <div className="mt-2 space-y-2">
            {messages.slice(-12).map((message, index) => (
              <div key={`${message.role}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200">
                <span className="font-semibold text-slate-100">{message.role}</span>: {message.content}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </BusinessSection>
  );
}

export default BusinessAssistantPage;
