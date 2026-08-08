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
        selected ? "border-lamp bg-lamp/5" : "border-line hover:border-lamp/60"
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
