export function Loading({ label = "Loading..." }: { label?: string }) {
  return <div className="text-slate-300">{label}</div>;
}

export function ErrorState({ message }: { message?: string }) {
  return <div className="text-red-300">{message || "Something went wrong."}</div>;
}
