import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Reveal Oral Health",
  description:
    "About Reveal Oral Health — free dental practice intelligence by Tolair.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-text-primary">
        About Reveal Oral Health
      </h1>

      <p className="mt-6 text-text-secondary leading-relaxed">
        Reveal Oral Health is a free, public dental intelligence tool that lets
        anyone explore the landscape of U.S. oral health providers and dental
        service organizations (DSOs). No login required — just search and
        explore.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text-primary">
        What You Can Do
      </h2>
      <ul className="mt-4 space-y-2 text-text-secondary list-disc list-inside">
        <li>
          Search 200,000+ dental providers by name, NPI, city, or specialty
        </li>
        <li>
          View practice profiles with governance scores and DSO affiliations
        </li>
        <li>Explore DSO portfolios and provider networks</li>
        <li>Compare providers within a market or across states</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-text-primary">
        Data Sources
      </h2>
      <p className="mt-4 text-text-secondary leading-relaxed">
        Reveal Oral Health aggregates and scores data from authoritative public
        sources, updated monthly:
      </p>
      <ul className="mt-4 space-y-2 text-text-secondary list-disc list-inside">
        <li>
          <span className="text-text-primary font-medium">NPPES</span> —
          National Plan and Provider Enumeration System (CMS)
        </li>
        <li>
          <span className="text-text-primary font-medium">ADA</span> — American
          Dental Association specialty and taxonomy data
        </li>
        <li>
          <span className="text-text-primary font-medium">HRSA</span> — Health
          Resources and Services Administration (dental HPSAs)
        </li>
        <li>
          <span className="text-text-primary font-medium">CMS</span> — Centers
          for Medicare &amp; Medicaid Services (enrollment, utilization)
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-text-primary">
        Built by Tolair
      </h2>
      <p className="mt-4 text-text-secondary leading-relaxed">
        Reveal Oral Health is built and maintained by{" "}
        <a
          href="https://tolair.org"
          className="text-primary hover:text-primary-hover transition-colors underline"
        >
          Tolair, Inc.
        </a>
        , creators of the Governance OS for healthcare. Tolair builds tools that
        bring transparency and accountability to healthcare delivery systems.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-text-primary">
        Contact
      </h2>
      <p className="mt-4 text-text-secondary">
        Questions, feedback, or data inquiries:{" "}
        <a
          href="mailto:chadbrausen@tolair.org"
          className="text-primary hover:text-primary-hover transition-colors underline"
        >
          chadbrausen@tolair.org
        </a>
      </p>
    </div>
  );
}
