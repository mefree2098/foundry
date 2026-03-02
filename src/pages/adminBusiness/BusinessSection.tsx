import type { ReactNode } from "react";
import SectionCard from "../../components/SectionCard";

type BusinessSectionProps = {
  title: string;
  summary: string;
  children?: ReactNode;
};

function BusinessSection({ title, summary, children }: BusinessSectionProps) {
  return (
    <SectionCard title={title}>
      <div className="space-y-3 text-sm text-slate-200">
        <p>{summary}</p>
        {children}
      </div>
    </SectionCard>
  );
}

export default BusinessSection;
