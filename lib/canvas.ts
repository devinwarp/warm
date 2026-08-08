import type { FactSheet } from "./factsheet";
import type { Place } from "./places";

/**
 * The canvas is append-only: the agent paints, it never erases. A conversation
 * reads as a transcript of what was found, which is also what the audience
 * needs to follow on a stage.
 */

export type TranscriptTurn = { role: string; message: string };

export type Card = { id: string } & (
  | { kind: "candidates"; places: Place[]; chosen: number | null }
  | { kind: "factsheet"; sheet: FactSheet }
  | { kind: "area"; area: string; lat: number; lng: number; confirmed: boolean }
  | { kind: "restaurants"; places: Place[]; chosen: number | null }
  | {
      kind: "call";
      restaurant: string;
      conversationId: string | null;
      status: string;
      transcript: TranscriptTurn[];
    }
  | { kind: "fault"; text: string }
);

export type CanvasAction =
  | { type: "add"; card: Card }
  | { type: "choose"; id: string; index: number }
  | { type: "call"; id: string; status: string; transcript: TranscriptTurn[] };

export function canvasReducer(cards: Card[], action: CanvasAction): Card[] {
  if (action.type === "add") return [...cards, action.card];

  return cards.map((card) => {
    if (card.id !== action.id) return card;

    if (action.type === "choose") {
      if (card.kind === "candidates" || card.kind === "restaurants") {
        return { ...card, chosen: action.index };
      }
      // An area card has one thing to choose, so any choice confirms it.
      if (card.kind === "area") return { ...card, confirmed: true };
      return card;
    }

    if (card.kind === "call") {
      return { ...card, status: action.status, transcript: action.transcript };
    }
    return card;
  });
}
