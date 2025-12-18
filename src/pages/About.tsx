import SectionCard from "../components/SectionCard";

function About() {
  return (
    <div className="space-y-6">
      <SectionCard title="About Foundry">
        <p className="text-sm text-slate-200">
          Foundry is a lightweight, AI-friendly website + admin starter you can deploy on Azure’s free tiers. Customize your brand, theme, navigation,
          homepage sections, and content in the admin UI.
        </p>
      </SectionCard>
      <SectionCard title="Contact">
        <p className="text-sm text-slate-200">
          To get started, deploy with `pwsh ./scripts/foundry.ps1` and then visit <a href="/admin">/admin</a>.
        </p>
      </SectionCard>
    </div>
  );
}

export default About;
