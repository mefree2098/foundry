import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../hooks/useAuth";
import BankingPage from "./adminBusiness/BankingPage";
import BusinessAssistantPage from "./adminBusiness/BusinessAssistantPage";
import CustomersPage from "./adminBusiness/CustomersPage";
import ImportsPage from "./adminBusiness/ImportsPage";
import InvoicesPage from "./adminBusiness/InvoicesPage";
import LedgerPage from "./adminBusiness/LedgerPage";
import OverviewPage from "./adminBusiness/OverviewPage";
import ReconcilePage from "./adminBusiness/ReconcilePage";
import ReportsPage from "./adminBusiness/ReportsPage";
import SettingsPage from "./adminBusiness/SettingsPage";
import TaxCenterPage from "./adminBusiness/TaxCenterPage";
import VendorsPage from "./adminBusiness/VendorsPage";

const sections = [
  { path: "overview", label: "Overview" },
  { path: "invoices", label: "Invoices" },
  { path: "customers", label: "Customers" },
  { path: "vendors", label: "Vendors" },
  { path: "banking", label: "Banking" },
  { path: "imports", label: "Imports" },
  { path: "ledger", label: "Ledger" },
  { path: "reconcile", label: "Reconcile" },
  { path: "reports", label: "Reports" },
  { path: "tax", label: "Tax" },
  { path: "settings", label: "Settings" },
  { path: "assistant", label: "Assistant" },
] as const;

function AdminBusiness() {
  const { loading: authLoading, isAdmin } = useAuth();

  const loginButtons = (
    <div className="mt-4 flex flex-wrap gap-2">
      <a className="btn btn-secondary" href="/.auth/login/github?post_login_redirect_uri=/admin/business/overview">
        Login with GitHub
      </a>
      <a className="btn btn-secondary" href="/.auth/login/aad?post_login_redirect_uri=/admin/business/overview">
        Login with Azure AD
      </a>
      <a className="btn btn-secondary" href="/.auth/login/twitter?post_login_redirect_uri=/admin/business/overview">
        Login with X
      </a>
    </div>
  );

  if (!authLoading && !isAdmin) {
    return (
      <SectionCard title="Business Admin">
        <div className="space-y-2 text-sm text-red-200">
          <p>Admin privileges required.</p>
          <p>Business operations are locked behind the same server-side admin checks as the rest of /admin.</p>
          {loginButtons}
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Business Admin">
        <p className="text-sm text-emerald-100">
          Accounting and finance workspace for invoicing, imports, reconciliation, and reporting.
        </p>
        {authLoading ? <p className="mt-2 text-sm text-slate-300">Checking access...</p> : <p className="mt-2 text-sm text-emerald-100">Access granted.</p>}
        {loginButtons}
      </SectionCard>

      <div className="glass-surface rounded-2xl border border-white/10 p-3">
        <nav className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <NavLink
              key={section.path}
              to={`/admin/business/${section.path}`}
              className={({ isActive }) =>
                `rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                  isActive
                    ? "border-emerald-300/70 bg-emerald-400/20 text-emerald-100"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-emerald-400/50 hover:text-slate-100"
                }`
              }
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="banking" element={<BankingPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="reconcile" element={<ReconcilePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="tax" element={<TaxCenterPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="assistant" element={<BusinessAssistantPage />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </div>
  );
}

export default AdminBusiness;
