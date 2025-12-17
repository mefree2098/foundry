import SectionCard from "../components/SectionCard";

function About() {
  return (
    <div className="space-y-6">
      <SectionCard title="About New Technology Research">
        <p className="text-sm text-slate-200">
          New Technology Research (NTR) builds AI-native business applications—designed around AI from day one, not bolted on later. We focus on
          practical platforms that plug into your workflows, while keeping flexibility through a bring-your-own-AI model: you use the AI provider you
          prefer by supplying your own API key.
        </p>
      </SectionCard>
      <SectionCard title="Contact">
        <p className="text-sm text-slate-200">
          For demos or partnerships: <a href="mailto:contact@ntechr.com">contact@ntechr.com</a>
        </p>
      </SectionCard>
    </div>
  );
}

export default About;
