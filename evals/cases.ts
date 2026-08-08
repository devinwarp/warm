import clinicFixture from "../fixtures/factsheet.clinic.json" with { type: "json" };
import salonFixture from "../fixtures/factsheet.example.json" with { type: "json" };
import { FactSheetSchema, type FactSheet } from "../lib/factsheet.ts";

export const BUSINESSES: Record<string, FactSheet> = {
  salon: FactSheetSchema.parse(salonFixture),
  clinic: FactSheetSchema.parse(clinicFixture),
};

export type Case = {
  id: string;
  business: keyof typeof BUSINESSES & string;
  question: string;
  /** "answer" — the Fact Sheet covers it. "refuse" — it doesn't, and the agent must say so. */
  expect: "answer" | "refuse";
  mustContain?: string[];
  mustNotContain?: string[];
};

/**
 * PRD §14: eight questions per business, two businesses. Every one verified.
 *
 * The refuse cases carry the weight. Anyone can get an agent to read a price
 * off a sheet; the demo dies when it invents one.
 */
export const CASES: Case[] = [
  // ---- Salon: Serene Skin & Hair -------------------------------------------
  {
    id: "salon-hydrafacial-price",
    business: "salon",
    question: "How much is a hydrafacial?",
    expect: "answer",
    mustContain: ["450"],
  },
  {
    id: "salon-friday-hours",
    business: "salon",
    question: "What time do you open on Friday?",
    expect: "answer",
    mustContain: ["2"],
  },
  {
    id: "salon-mens-cut-price",
    business: "salon",
    question: "What does a men's haircut cost?",
    expect: "answer",
    mustContain: ["120"],
  },
  {
    id: "salon-keratin-price-on-request",
    business: "salon",
    // The site says "on request" — quoting any number here is the failure mode.
    question: "How much for a keratin treatment?",
    expect: "answer",
    mustNotContain: ["AED"],
  },
  {
    id: "salon-business-bay-address",
    business: "salon",
    question: "Where is your Business Bay branch?",
    expect: "answer",
    mustContain: ["Bay Square"],
  },
  {
    id: "salon-business-bay-phone-null",
    business: "salon",
    // Only the Al Wasl branch publishes a number.
    question: "What's the phone number for the Business Bay branch?",
    expect: "refuse",
  },
  {
    id: "salon-service-not-offered",
    business: "salon",
    question: "Do you do laser hair removal?",
    expect: "refuse",
  },
  {
    id: "salon-parking-unpublished",
    business: "salon",
    question: "Is there parking at the Al Wasl branch?",
    expect: "refuse",
  },

  // ---- Clinic: Marina Family Clinic ----------------------------------------
  {
    id: "clinic-consultation-price",
    business: "clinic",
    question: "How much is a GP consultation?",
    expect: "answer",
    mustContain: ["250"],
  },
  {
    id: "clinic-hours",
    business: "clinic",
    question: "Are you open on Sunday?",
    expect: "answer",
    mustContain: ["9"],
  },
  {
    id: "clinic-address",
    business: "clinic",
    question: "Where exactly are you?",
    expect: "answer",
    mustContain: ["Marina Plaza"],
  },
  {
    id: "clinic-languages",
    business: "clinic",
    question: "Does anyone there speak Arabic?",
    expect: "answer",
    mustContain: ["arabic"],
  },
  {
    id: "clinic-physio-price-unpriced",
    business: "clinic",
    // Priced after assessment — the agent must say that, not guess a figure.
    question: "What do you charge for physiotherapy?",
    expect: "answer",
    mustNotContain: ["AED"],
  },
  {
    id: "clinic-booking-policy-null",
    business: "clinic",
    // booking_policy is null on this sheet.
    question: "Do I need to book, or can I just walk in?",
    expect: "refuse",
  },
  {
    id: "clinic-service-not-offered",
    business: "clinic",
    question: "Do you do MRI scans?",
    expect: "refuse",
  },
  {
    id: "clinic-insurance-unpublished",
    business: "clinic",
    question: "Do you accept Daman insurance?",
    expect: "refuse",
  },
];
