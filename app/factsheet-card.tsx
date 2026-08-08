import type { FactSheet } from "@/lib/factsheet";

/**
 * Renders exactly what the crawl found. Unpublished fields say so out loud —
 * an operator staring at a blank cell can't tell "missing" from "broken".
 */

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function NotPublished() {
  return <span className="text-mute/70 italic">not published on the site</span>;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-mono text-[11px] tracking-widest text-mute uppercase">{label}</h3>
      {children}
    </div>
  );
}

export function FactSheetCard({
  sheet,
  lastRead,
}: {
  sheet: FactSheet;
  lastRead: { at: string; live: boolean };
}) {
  return (
    <section
      aria-label="Fact sheet"
      className="flex flex-col gap-6 rounded-md border border-line bg-panel p-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{sheet.business_name}</h2>
          <p className="mt-1 text-sm text-mute">{sheet.one_line}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[11px] whitespace-nowrap ${
            lastRead.live ? "border-lamp/50 text-lamp" : "border-line text-mute"
          }`}
          title={lastRead.live ? "The agent re-read the site mid-call" : "From the onboarding crawl"}
        >
          {lastRead.live ? "live" : "cached"} · read {clock(lastRead.at)}
        </span>
      </header>

      <Section label="Services">
        {sheet.services.length === 0 ? (
          <NotPublished />
        ) : (
          <ul className="divide-y divide-line/60">
            {sheet.services.map((service) => (
              <li key={service.name} className="flex items-baseline justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{service.name}</p>
                  {service.description && (
                    <p className="text-xs text-mute">{service.description}</p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-sm">
                  {service.price ?? <NotPublished />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section label="Hours">
          <p className="text-sm">{sheet.hours || <NotPublished />}</p>
        </Section>
        <Section label="Booking">
          <p className="text-sm">{sheet.booking_policy ?? <NotPublished />}</p>
        </Section>
      </div>

      <Section label="Locations">
        {sheet.locations.length === 0 ? (
          <NotPublished />
        ) : (
          <ul className="flex flex-col gap-2">
            {sheet.locations.map((location) => (
              <li key={location.branch} className="text-sm">
                <span className="font-medium">{location.branch}</span>
                <span className="text-mute"> — {location.address}</span>
                {location.phone && <span className="font-mono text-xs text-mute"> · {location.phone}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section label="Languages">
          <p className="text-sm">
            {sheet.languages_spoken.length > 0 ? sheet.languages_spoken.join(", ") : <NotPublished />}
          </p>
        </Section>
        <Section label="If the agent can't answer">
          <p className="text-sm text-mute">{sheet.escalation_note || <NotPublished />}</p>
        </Section>
      </div>

      <footer className="border-t border-line/60 pt-3 font-mono text-[11px] text-mute/70">
        source:{" "}
        <a href={sheet.source_url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-mute">
          {sheet.source_url}
        </a>
      </footer>
    </section>
  );
}
