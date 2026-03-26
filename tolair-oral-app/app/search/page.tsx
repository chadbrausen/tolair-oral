import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search | Reveal Oral Health",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q ?? "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-text-primary">
        Search results for: &ldquo;{query}&rdquo;
      </h1>
      <p className="mt-4 text-text-secondary">
        Use the search bar on the{" "}
        <a
          href="/"
          className="text-primary hover:text-primary-hover transition-colors underline"
        >
          home page
        </a>{" "}
        for the best search experience.
      </p>
    </div>
  );
}
