"use client";

import { useEffect, useRef } from "react";

/**
 * The line, made visible.
 *
 * Every layer is driven by one CSS custom property, --amp, written here at
 * frame rate from the SDK's real input and output volume. Nothing is faked: a
 * still orb means a silent line, which is the whole point of having it on
 * screen — you can tell whether the agent heard you without waiting for it to
 * answer.
 *
 * Colour carries the turn: amber while the agent speaks, teal while it listens.
 * See the tokens in globals.css.
 */

// Speech peaks are short. Rise fast so a syllable lands, fall slower so the
// orb settles instead of strobing.
const RISE = 0.32;
const FALL = 0.12;

// Raw volume sits low even at a normal speaking level; lift it into a range
// that actually moves the layers.
const GAIN = 2.4;

export function Orb({
  live,
  speaking,
  docked,
  getInputVolume,
  getOutputVolume,
}: {
  live: boolean;
  speaking: boolean;
  docked: boolean;
  getInputVolume: () => number;
  getOutputVolume: () => number;
}) {
  const root = useRef<HTMLDivElement>(null);

  // Read the getters through a ref so the loop is started by `live` alone and
  // never restarts on an unrelated re-render.
  const meters = useRef({ getInputVolume, getOutputVolume });
  meters.current = { getInputVolume, getOutputVolume };

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    // Hand the resting glow back to the stylesheet when the line is down.
    if (!live) {
      node.style.removeProperty("--amp");
      return;
    }

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let level = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);

      let volume = 0;
      try {
        volume = Math.max(meters.current.getInputVolume(), meters.current.getOutputVolume());
      } catch {
        // The meters only exist while a session is connected. Silence is a
        // correct answer here, not an error worth surfacing.
      }

      // A slow breath under everything, so an open-but-quiet line still reads
      // as alive rather than as a crash.
      const breath = calm ? 0.04 : (Math.sin(now / 1100) * 0.5 + 0.5) * 0.09 + 0.03;
      const target = Math.min(1, Math.max(volume * GAIN, breath));

      level += (target - level) * (target > level ? RISE : FALL);
      node.style.setProperty("--amp", level.toFixed(3));
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [live]);

  return (
    <div
      ref={root}
      className="orb"
      data-speaking={speaking}
      data-docked={docked}
      role="img"
      aria-label={
        !live ? "The line is idle" : speaking ? "The agent is speaking" : "The agent is listening"
      }
    >
      <span className="orb-bloom" />
      <span className="orb-sheen" />
      <span className="orb-ring-wide" />
      <span className="orb-ring" />
      <span className="orb-core" />
    </div>
  );
}
