// Safe markdown renderer for legal documents. react-markdown escapes raw HTML
// by default (no rehype-raw), so user/admin markdown cannot inject scripts.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { headingId } from "@/lib/legal/markdown";
import { cn } from "@/lib/utils";

function textOf(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children && typeof children === "object" && "props" in (children as never)) {
    return textOf((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function LegalMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("text-[15px] leading-7 text-foreground/90", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => (
            <h2 id={headingId(textOf(children))} className="mt-12 scroll-mt-28 font-heading text-2xl font-semibold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 id={headingId(textOf(children))} className="mt-12 scroll-mt-28 font-heading text-xl font-semibold tracking-tight first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 id={headingId(textOf(children))} className="mt-8 scroll-mt-28 font-heading text-lg font-semibold">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 id={headingId(textOf(children))} className="mt-6 scroll-mt-28 font-heading text-base font-semibold">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mt-4 text-muted-foreground">{children}</p>,
          ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              className="font-medium text-primary underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              rel="noopener noreferrer"
              target={href?.startsWith("http") ? "_blank" : undefined}
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-6 rounded-xl border border-border bg-muted/50 px-5 py-4 text-muted-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mt-6 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => <th className="border-b border-border px-4 py-3 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-border px-4 py-3 align-top text-muted-foreground">{children}</td>,
          code: ({ children, className: cls }) =>
            cls ? (
              <code className="block overflow-x-auto rounded-xl bg-muted p-4 font-mono text-[13px]">{children}</code>
            ) : (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
            ),
          pre: ({ children }) => <pre className="mt-6">{children}</pre>,
          hr: () => <hr className="my-10 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
