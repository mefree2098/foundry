import { Link } from "react-router-dom";

function NotFound() {
  return (
    <div className="rounded-3xl border border-white/5 bg-white/5 p-8 text-center">
      <h1 className="text-3xl font-semibold text-slate-50">Page not found</h1>
      <p className="mt-3 text-sm text-slate-200">The page you’re looking for doesn’t exist.</p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
      >
        Go home
      </Link>
    </div>
  );
}

export default NotFound;
