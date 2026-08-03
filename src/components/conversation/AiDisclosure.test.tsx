import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiDisclosure } from "./AiDisclosure";
import { HumanTakeoverNotice } from "./HumanTakeoverNotice";
import da from "../../../public/locales/da/ai.json";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const value = key
        .split(".")
        .reduce<any>((acc, part) => (acc ? acc[part] : undefined), da as any);
      if (typeof value !== "string") return key;
      return value.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts?.[k] ?? ""));
    },
  }),
}));

describe("AiDisclosure", () => {
  it("always shows the AI identification inline, not hidden behind a tooltip", () => {
    render(<AiDisclosure />);
    expect(screen.getByTestId("ai-disclosure-title")).toBeVisible();
    expect(screen.getByTestId("ai-disclosure-title").textContent).toMatch(/AI-assistent/i);
    expect(screen.getByTestId("ai-disclosure-body").textContent).toMatch(/fejl/i);
  });

  it("renders 'Talk to a person' as a real button that triggers escalation", () => {
    const onTalkToHuman = vi.fn();
    render(<AiDisclosure onTalkToHuman={onTalkToHuman} />);
    const btn = screen.getByTestId("ai-talk-to-human");
    expect(btn.tagName).toBe("BUTTON");
    fireEvent.click(btn);
    expect(onTalkToHuman).toHaveBeenCalledTimes(1);
  });

  it("hides the action once a human has taken over", () => {
    render(<AiDisclosure showAction={false} onTalkToHuman={vi.fn()} />);
    expect(screen.queryByTestId("ai-talk-to-human")).toBeNull();
  });

  it("disables the button while the handover is in flight", () => {
    render(<AiDisclosure pending onTalkToHuman={vi.fn()} />);
    expect(screen.getByTestId("ai-talk-to-human")).toBeDisabled();
  });

  it("uses the calm tone by default and red only for risk answers", () => {
    const { rerender } = render(<AiDisclosure />);
    expect(screen.getByTestId("ai-disclosure").dataset.tone).toBe("calm");
    rerender(<AiDisclosure tone="risk" />);
    expect(screen.getByTestId("ai-disclosure").dataset.tone).toBe("risk");
  });
});

describe("HumanTakeoverNotice", () => {
  it("names the human agent by first name only", () => {
    render(<HumanTakeoverNotice firstName="Mette" expectedResponseMinutes={30} />);
    const el = screen.getByTestId("human-takeover-notice");
    expect(el.textContent).toContain("Mette");
    expect(el.textContent).toContain("30");
  });

  it("never promises a response time when it is unknown", () => {
    render(<HumanTakeoverNotice firstName={null} expectedResponseMinutes={null} />);
    const text = screen.getByTestId("human-takeover-notice").textContent ?? "";
    expect(text).not.toMatch(/\d+\s*min/);
  });
});
