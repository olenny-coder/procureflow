"use client";

import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      root.classList.add("motion-ready");
      document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-revealed"));
      return;
    }

    root.classList.add("motion-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.classList.add("is-revealed");
          observer.unobserve(element);

          if (element.dataset.count) {
            animateCount(element);
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );

    const counters = document.querySelectorAll<HTMLElement>("[data-count]");
    for (const counter of counters) observer.observe(counter);
    const reveals = document.querySelectorAll<HTMLElement>("[data-reveal]");
    for (const element of reveals) observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return null;
}

function animateCount(element: HTMLElement) {
  const target = Number(element.dataset.count);
  const suffix = element.dataset.suffix ?? "";
  if (!Number.isFinite(target)) return;

  const start = performance.now();
  const duration = 900;

  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${Math.round(target * eased)}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  };

  element.textContent = `0${suffix}`;
  requestAnimationFrame(tick);
}
