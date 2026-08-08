"use client";

import type { Card } from "@/lib/canvas";
import type { Place } from "@/lib/places";
import { FactSheetCard } from "./factsheet-card";

/**
 * Dumb presentational switch. Every card the agent can paint renders here.
 * Taps call onChoose; they never call a tool directly — the canvas turns a tap
 * into a contextual update and lets the agent decide what happens next.
 */

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-4 rounded-md border border-line bg-panel p-6"
    >
      <h2 className="font-mono text-[11px] tracking-widest text-mute uppercase">{label}</h2>
      {children}
    </section>
  );
}

function PlaceRow({
  place,
  selected,
  onClick,
}: {
  place: Place;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-colors ${
        selected ? "border-signal bg-signal/5" : "border-line hover:border-signal/60"
      }`}
    >
      <span className="text-sm font-medium">{place.name}</span>
      <span className="text-xs text-mute">{place.address}</span>
      <span className="font-mono text-[11px] text-mute/80">
        {place.rating !== null ? `${place.rating}★` : "unrated"}
        {place.reviews !== null && place.reviews > 0 ? ` · ${place.reviews} reviews` : ""}
        {place.website ? " · has a website" : " · no website"}
      </span>
    </button>
  );
}

export function CardView({
  card,
  onChoose,
}: {
  card: Card;
  onChoose: (id: string, index: number) => void;
}) {
  switch (card.kind) {
    case "candidates":
      return (
        <Shell label="Is this the one?">
          <div className="flex flex-col gap-2">
            {card.places.map((place, i) => (
              <PlaceRow
                key={place.name + i}
                place={place}
                selected={card.chosen === i}
                onClick={() => onChoose(card.id, i)}
              />
            ))}
          </div>
        </Shell>
      );

    case "factsheet":
      return <FactSheetCard sheet={card.sheet} lastRead={{ at: card.sheet.crawled_at, live: false }} />;

    case "restaurants":
      return (
        <Shell label={`${card.places.length} places`}>
          <div className="grid gap-2 sm:grid-cols-2">
            {card.places.map((place, i) => (
              <PlaceRow
                key={place.name + i}
                place={place}
                selected={card.chosen === i}
                onClick={() => onChoose(card.id, i)}
              />
            ))}
          </div>
        </Shell>
      );

    case "area": {
      const d = 0.035;
      const bbox = [card.lng - d, card.lat - d, card.lng + d, card.lat + d].join("%2C");
      return (
        <Shell label="Is this the right area?">
          <iframe
            title={`Map of ${card.area}`}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${card.lat}%2C${card.lng}`}
            className="map-dark h-56 w-full rounded-md border border-line"
            loading="lazy"
          />
          <button
            type="button"
            onClick={() => onChoose(card.id, 0)}
            aria-pressed={card.confirmed}
            className={`self-start rounded-md border px-4 py-2 text-sm transition-colors ${
              card.confirmed
                ? "border-signal bg-signal/10 text-signal"
                : "border-line hover:border-signal/60"
            }`}
          >
            {card.confirmed ? `${card.area} — confirmed` : `Yes, ${card.area}`}
          </button>
        </Shell>
      );
    }

    case "liveread": {
      const { read } = card;
      // "Open · Closes 2 AM" is the fact a cached crawl can never be right
      // about, so it gets the strongest treatment on the card.
      const openNow = read.open_now?.toLowerCase().startsWith("open");
      return (
        <Shell label={`${read.name} — read just now`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {read.rating && (
              <p className="flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-semibold text-lamp">{read.rating}</span>
                <span className="text-sm text-mute">
                  ★{card.reviews ? ` · ${card.reviews.toLocaleString()} reviews` : ""}
                </span>
              </p>
            )}
            {read.open_now && (
              <p
                className={`flex items-center gap-2 font-mono text-xs tracking-widest uppercase ${
                  openNow ? "text-signal" : "text-fault"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${openNow ? "lamp-live bg-signal" : "bg-fault"}`}
                  aria-hidden
                />
                {read.open_now}
              </p>
            )}
          </div>

          {read.summary && <p className="text-sm text-mute">{read.summary}</p>}

          {card.tags.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-mono text-[11px] tracking-widest text-mute uppercase">
                What reviewers mention
              </h3>
              <ul className="flex flex-wrap gap-2">
                {card.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-line bg-ink/40 px-3 py-1 text-xs text-mute"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {read.highlights.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
              {read.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 font-mono text-[11px] text-mute/70">
            <span>read {new Date(read.read_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · live</span>
            <a
              href={read.source_url}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-line underline-offset-2 hover:text-mute"
            >
              source
            </a>
          </footer>
        </Shell>
      );
    }

    case "call":
      return (
        <Shell label={`Calling ${card.restaurant}`}>
          <p className="font-mono text-xs tracking-widest text-mute uppercase">
            <span
              className={`mr-2 inline-block size-2 rounded-full align-middle ${
                card.status === "done"
                  ? "bg-lamp"
                  : card.status === "failed"
                    ? "bg-fault"
                    : "lamp-live bg-lamp"
              }`}
              aria-hidden
            />
            {card.status}
          </p>
          {card.transcript.length === 0 ? (
            <p className="text-sm text-mute">ringing…</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {card.transcript.map((turn, i) => (
                <li key={i} className="text-sm">
                  <span className="font-mono text-[11px] tracking-widest text-mute uppercase">
                    {turn.role === "agent" ? "us" : "them"}
                  </span>
                  <p>{turn.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Shell>
      );

    case "fault":
      return (
        <Shell label="That didn't work">
          <p className="text-sm text-fault">{card.text}</p>
        </Shell>
      );

    default:
      return null;
  }
}
