import { useState } from "react";
import { submitContact } from "../lib/api";
import type { ContactSettings } from "../lib/types";

export function ContactForm({ settings }: { settings?: ContactSettings }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setEmail("");
    setCompany("");
    setSubject("");
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      await submitContact({
        name: name.trim(),
        email: email.trim(),
        company: company.trim() || undefined,
        subject: subject.trim() || undefined,
        message: message.trim(),
        pageUrl: window.location.href,
      });
      setStatus("sent");
      reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to send contact request.");
    }
  };

  if (!settings?.enabled) {
    return <div className="text-sm text-slate-300">Contact form is currently unavailable.</div>;
  }

  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
      <input
        className="input-field"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        className="input-field"
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="input-field"
        placeholder="Company (optional)"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />
      <input
        className="input-field"
        placeholder="Subject (optional)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <textarea
        className="input-field md:col-span-2 min-h-[140px]"
        placeholder="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
      />
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
          {status === "sending" ? "Sending..." : "Send message"}
        </button>
        {status === "sent" ? (
          <span className="text-sm text-emerald-200">
            {settings?.successMessage || "Thanks! We received your message."}
          </span>
        ) : null}
        {status === "error" ? <span className="text-sm text-red-200">{error}</span> : null}
      </div>
    </form>
  );
}
