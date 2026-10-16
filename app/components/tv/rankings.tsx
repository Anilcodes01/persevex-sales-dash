"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Trophy } from "lucide-react";

export type Standing = {
  id: string;
  name: string;
  targetCount: number | null;
  achievement: number | null;
  salesCount: number;
  rank: number;
};
const ROWS = 7;

export function Rankings({
  title,
  rows,
  cycle,
  controls,
  status,
}: {
  title: string;
  rows: Standing[];
  cycle: number;
  controls?: ReactNode;
  status?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const previous = useRef<{
    ranks: Map<string, { rank: number; index: number }>;
    tops: Map<string, number>;
    cycle: number;
  } | null>(null);
  const animations = useRef(new Map<string, Animation>());
  const indicators = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pages = Math.max(1, Math.ceil(rows.length / ROWS));
  const page = cycle % pages;

  useLayoutEffect(() => {
    const nodes = Array.from(
      list.current?.querySelectorAll<HTMLElement>("[data-standing-id]") ?? [],
    );
    const before = previous.current;
    const tops = new Map<string, number>();
    const ranks = new Map(
      rows.map((row, index) => [row.id, { rank: row.rank, index }]),
    );
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    for (const node of nodes) {
      const id = node.dataset.standingId!;
      const old = before?.ranks.get(id);
      const next = ranks.get(id)!;
      // Sample an interrupted animation so another sale continues from the
      // tile's current visual position, rather than jumping to its last target.
      const running = animations.current.get(id);
      const transform = running ? getComputedStyle(node).transform : "none";
      const offset =
        transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
      running?.cancel();
      const top = node.getBoundingClientRect().top;
      tops.set(id, top);
      if (old && old.rank !== next.rank) {
        const direction = old.rank > next.rank ? "up" : "down";
        node.dataset.movement = direction;
        const indicator = node.querySelector<HTMLElement>(".tv-rank-movement")!;
        const change = Math.abs(old.rank - next.rank);
        indicator.setAttribute(
          "aria-label",
          `Moved ${direction} ${change} ${change === 1 ? "place" : "places"}`,
        );
        indicator.title = indicator.getAttribute("aria-label")!;
        clearTimeout(indicators.current.get(id));
        indicators.current.set(
          id,
          setTimeout(() => {
            delete node.dataset.movement;
            indicator.removeAttribute("aria-label");
            indicator.removeAttribute("title");
            indicators.current.delete(id);
          }, 20000),
        );
      }
      // Rotating display pages must not be mistaken for a rank change.
      if (!reduceMotion && before && before.cycle === cycle) {
        const oldTop = before.tops.get(id);
        const delta =
          oldTop !== undefined
            ? oldTop + offset - top
            : old
              ? (old.index - next.index) * node.offsetHeight
              : 0;
        if (Math.abs(delta) > 1) {
          const bounded = Math.max(
            -window.innerHeight,
            Math.min(window.innerHeight, delta),
          );
          animations.current.set(
            id,
            node.animate(
              [
                {
                  transform: `translateY(${bounded}px)`,
                  opacity: oldTop === undefined ? 0.3 : 1,
                },
                { transform: "translateY(0)", opacity: 1 },
              ],
              { duration: 850, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            ),
          );
        }
      }
    }
    const visible = new Set(nodes.map((node) => node.dataset.standingId!));
    for (const [id, animation] of animations.current)
      if (!visible.has(id)) {
        animation.cancel();
        animations.current.delete(id);
      }
    for (const [id, timer] of indicators.current)
      if (!visible.has(id)) {
        clearTimeout(timer);
        indicators.current.delete(id);
      }
    previous.current = { ranks, tops, cycle };
  }, [rows, cycle]);

  useLayoutEffect(() => {
    const active = animations.current;
    const timers = indicators.current;
    return () => {
      active.forEach((animation) => animation.cancel());
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <section className="tv-rankings">
      <div className="tv-section-title">
        <h2>{title}</h2>
        {controls}
      </div>
      <div className="tv-ranking-labels">
        <span>Rank / Name</span>
        <span>Target</span>
        <span>Sales</span>
        <span>Achieved</span>
      </div>
      <div className="tv-ranking-tiles" ref={list}>
        {rows.slice(page * ROWS, (page + 1) * ROWS).map((row) => (
          <div
            className={`tv-ranking-row ${row.rank === 1 ? "tv-first" : ""}`}
            data-standing-id={row.id}
            key={row.id}
          >
            <div className="tv-person">
              <span className="tv-rank">
                {row.rank === 1 ? (
                  <Trophy aria-label="First place" />
                ) : (
                  row.rank
                )}
              </span>
              <strong>{row.name}</strong>
              <span className="tv-rank-movement" role="img">
                <ArrowUp className="tv-movement-up" aria-hidden="true" />
                <ArrowDown className="tv-movement-down" aria-hidden="true" />
              </span>
            </div>
            <span className="tv-target-count">
              {row.targetCount ?? "Not set"}
            </span>
            <span>{row.salesCount}</span>
            <div className="tv-achievement">
              <strong>
                {row.achievement === null
                  ? "—"
                  : `${Math.round(row.achievement)}%`}
              </strong>
              {row.achievement !== null && (
                <span
                  className="tv-achievement-track"
                  role="meter"
                  aria-label={`${row.name} target achievement`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, row.achievement)}
                  aria-valuetext={`${row.achievement.toFixed(1)}%`}
                >
                  <span
                    style={{ width: `${Math.min(100, row.achievement)}%` }}
                  />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="tv-panel-status">
        <span role="status">{status}</span>
        <span>
          {page + 1} / {pages}
        </span>
      </div>
      {!rows.length && (
        <p className="tv-empty">
          The first approved sale starts the leaderboard.
        </p>
      )}
    </section>
  );
}
