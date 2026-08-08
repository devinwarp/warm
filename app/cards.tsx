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

    case "area": {
      const d = 0.035;
      const bbox = [card.lng - d, card.lat - d, card.lng + d, card.lat + d].join("%2C");
      return (
        <Shell label="Is this the right area?">
          <iframe
            title={`Map of ${card.area}`}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${card.lat}%2C${card.lng}`}
            className="h-56 w-full rounded-md border border-line"
            loading="lazy"
          />
          <button
            type="button"
            onClick={() => onChoose(card.id, 0)}
            aria-pressed={card.confirmed}
            className={`self-start rounded-md border px-4 py-2 text-sm transition-colors ${
              card.confirmed ? "border-lamp bg-lamp/10 text-lamp" : "border-line hover:border-lamp/60"
            }`}
          >
            {card.confirmed ? `${card.area} — confirmed` : `Yes, ${card.area}`}
          </button>
        </Shell>
      );
    }

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
