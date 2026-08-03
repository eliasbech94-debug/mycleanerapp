// Minimal head manager for the Legal Center. The app is a Vite SPA without
// SSR, so tags are applied to document.head and reverted on unmount.
import { useEffect } from "react";

export interface HeadTags {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: unknown;
}

function setMeta(selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void) {
  const existing = document.head.querySelector<HTMLElement>(selector);
  const el = existing ?? create();
  const previous = existing?.getAttribute("content") ?? existing?.getAttribute("href") ?? null;
  apply(el);
  if (!existing) document.head.appendChild(el);
  return () => {
    if (!existing) el.remove();
    else if (previous !== null) {
      if (el.hasAttribute("content")) el.setAttribute("content", previous);
      else el.setAttribute("href", previous);
    }
  };
}

export function useDocumentHead({ title, description, canonical, jsonLd }: HeadTags) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const cleanups: Array<() => void> = [];

    const metas: Array<[string, string, string]> = [
      ["name", "description", description],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["property", "og:type", "article"],
      ["property", "og:url", canonical],
      ["name", "twitter:card", "summary_large_image"],
      ["name", "twitter:title", title],
      ["name", "twitter:description", description],
    ];
    for (const [attr, key, value] of metas) {
      cleanups.push(
        setMeta(`meta[${attr}="${key}"]`, () => {
          const el = document.createElement("meta");
          el.setAttribute(attr, key);
          return el;
        }, (el) => el.setAttribute("content", value)),
      );
    }

    cleanups.push(
      setMeta('link[rel="canonical"]', () => {
        const el = document.createElement("link");
        el.setAttribute("rel", "canonical");
        return el;
      }, (el) => el.setAttribute("href", canonical)),
    );

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.legalCenter = "true";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.title = previousTitle;
      cleanups.forEach((fn) => fn());
      script?.remove();
    };
  }, [title, description, canonical, JSON.stringify(jsonLd ?? null)]);
}
