type SectionCardProps = {
  title: string;
  children: React.ReactNode;
};

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="glass-surface rounded-3xl p-8">
      <h2 className="text-2xl font-semibold text-slate-50">{title}</h2>
      <div className="mt-4 text-sm text-slate-200">{children}</div>
    </div>
  );
}

export default SectionCard;
