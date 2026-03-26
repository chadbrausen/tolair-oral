"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3004";

interface StateEntry {
  state: string;
  count: number;
}

interface SpecialtyEntry {
  specialty: string;
  count: number;
}

interface TopProvider {
  npi: string;
  providerName: string;
  city: string;
  state: string;
  specialty: string;
  ogsScore: number;
}

interface DsoData {
  dso: {
    name: string;
    slug: string;
    ownershipType: string;
    peSponsors?: string[];
    estimatedLocations?: number;
    estimatedDentists?: number;
    headquarters?: string;
  };
  affiliatedProviderCount: number;
  stateDistribution: StateEntry[];
  specialtyDistribution: SpecialtyEntry[];
  topProviders: TopProvider[];
}

function formatOwnershipType(type: string): string {
  const map: Record<string, string> = {
    PE_BACKED: "PE-Backed",
    PUBLIC: "Public",
    PRIVATE: "Private",
    DENTIST_OWNED: "Dentist-Owned",
    HYBRID: "Hybrid",
  };
  return map[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSpecialty(specialty: string): string {
  return specialty
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ownershipBadgeClasses(type: string): string {
  switch (type) {
    case "PE_BACKED":
      return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    case "PUBLIC":
      return "bg-blue-500/15 text-blue-400 border border-blue-500/30";
    default:
      return "bg-gray-500/15 text-gray-400 border border-gray-500/30";
  }
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 animate-pulse">
      <div className="h-10 w-80 bg-surface rounded mb-4" />
      <div className="h-6 w-48 bg-surface rounded mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-surface rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-surface rounded-lg mb-8" />
      <div className="h-64 bg-surface rounded-lg" />
    </div>
  );
}

export default function DsoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [data, setData] = useState<DsoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDso() {
      try {
        const res = await fetch(`${API_URL}/oral/dso/${slug}`);
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "DSO not found"
              : `Failed to load DSO data (${res.status})`
          );
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load DSO data");
      } finally {
        setLoading(false);
      }
    }
    fetchDso();
  }, [slug]);

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-critical/30 bg-critical/10 p-8 text-center">
          <h2 className="text-xl font-semibold text-critical mb-2">
            Unable to Load DSO Briefing
          </h2>
          <p className="text-text-secondary mb-4">{error || "Unknown error"}</p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-navy hover:bg-primary-hover transition-colors"
          >
            Back to Search
          </Link>
        </div>
      </div>
    );
  }

  const { dso, affiliatedProviderCount, stateDistribution, specialtyDistribution, topProviders } = data;
  const stateCount = stateDistribution?.length || 0;
  const maxSpecialtyCount = specialtyDistribution?.length
    ? Math.max(...specialtyDistribution.map((s) => s.count))
    : 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-text-primary">
            {dso.name}
          </h1>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ownershipBadgeClasses(dso.ownershipType)}`}
          >
            {formatOwnershipType(dso.ownershipType)}
          </span>
        </div>

        {dso.peSponsors && dso.peSponsors.length > 0 && (
          <p className="text-text-secondary mb-1">
            <span className="font-medium text-text-primary">PE Sponsors:</span>{" "}
            {dso.peSponsors.join(", ")}
          </p>
        )}

        <p className="text-text-secondary text-sm">
          {affiliatedProviderCount?.toLocaleString() || 0} affiliated providers
          {stateCount > 0 && ` across ${stateCount} state${stateCount !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary mb-1">Estimated Locations</p>
          <p className="text-2xl font-bold text-text-primary">
            {dso.estimatedLocations?.toLocaleString() || "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary mb-1">Estimated Dentists</p>
          <p className="text-2xl font-bold text-text-primary">
            {dso.estimatedDentists?.toLocaleString() || "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary mb-1">States Present</p>
          <p className="text-2xl font-bold text-text-primary">{stateCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-text-secondary mb-1">Ownership Type</p>
          <p className="text-2xl font-bold text-text-primary">
            {formatOwnershipType(dso.ownershipType)}
          </p>
        </div>
      </div>

      {/* State Distribution */}
      {stateDistribution && stateDistribution.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-text-primary mb-4">
            State Distribution
          </h2>
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="flex flex-wrap gap-2">
              {[...stateDistribution]
                .sort((a, b) => b.count - a.count)
                .map((entry) => (
                  <span
                    key={entry.state}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm border border-border"
                  >
                    <span className="font-medium text-text-primary">
                      {entry.state}
                    </span>
                    <span className="text-text-secondary">
                      {entry.count.toLocaleString()}
                    </span>
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Specialty Distribution */}
      {specialtyDistribution && specialtyDistribution.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-text-primary mb-4">
            Specialty Distribution
          </h2>
          <div className="rounded-lg border border-border bg-surface p-6 space-y-3">
            {[...specialtyDistribution]
              .sort((a, b) => b.count - a.count)
              .map((entry) => (
                <div key={entry.specialty}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text-primary">
                      {formatSpecialty(entry.specialty)}
                    </span>
                    <span className="text-sm text-text-secondary">
                      {entry.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-navy">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{
                        width: `${(entry.count / maxSpecialtyCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Top Providers Table */}
      {topProviders && topProviders.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-text-primary mb-4">
            Top Providers by OGS Score
          </h2>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">
                      Provider Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">
                      NPI
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">
                      City / State
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-text-secondary">
                      Specialty
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-text-secondary">
                      OGS Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topProviders.map((provider) => (
                    <tr
                      key={provider.npi}
                      className="border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/provider/${provider.npi}`}
                          className="text-primary hover:text-primary-hover transition-colors font-medium"
                        >
                          {provider.providerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/provider/${provider.npi}`}
                          className="text-primary hover:text-primary-hover transition-colors font-mono text-xs"
                        >
                          {provider.npi}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {provider.city}, {provider.state}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatSpecialty(provider.specialty)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-text-primary">
                        {provider.ogsScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CTA Section */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-8 text-center">
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Want deeper DSO governance intelligence?
        </h2>
        <p className="text-text-secondary mb-6 max-w-xl mx-auto">
          Get full ownership mapping, compliance scoring, and competitive
          benchmarking for this DSO and thousands more.
        </p>
        <a
          href="mailto:chadbrausen@tolair.org?subject=DSO Platform Demo Request"
          className="inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-navy hover:bg-primary-hover transition-colors"
        >
          Request a Tolair DSO Platform Demo
        </a>
      </div>
    </div>
  );
}
