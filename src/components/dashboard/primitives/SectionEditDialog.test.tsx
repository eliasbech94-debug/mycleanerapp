import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SectionEditDialog } from "./SectionEditDialog";

describe("SectionEditDialog", () => {
  it("renders title, description, body and Save/Cancel", () => {
    render(
      <SectionEditDialog
        open
        onOpenChange={() => {}}
        title="Personlige oplysninger"
        description="Rediger dine grundlæggende oplysninger"
        onSave={() => {}}
      >
        <p>Body</p>
      </SectionEditDialog>,
    );
    expect(screen.getByText("Personlige oplysninger")).toBeInTheDocument();
    expect(screen.getByText("Rediger dine grundlæggende oplysninger")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gem/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /annullér/i })).toBeInTheDocument();
  });

  it("invokes onSave when Save is clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SectionEditDialog open onOpenChange={() => {}} title="T" onSave={onSave}>
        <p />
      </SectionEditDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: /gem/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("closes without confirmation when not dirty", () => {
    const onOpenChange = vi.fn();
    render(
      <SectionEditDialog open onOpenChange={onOpenChange} title="T" dirty={false} onSave={() => {}}>
        <p />
      </SectionEditDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: /annullér/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks for discard confirmation when dirty", () => {
    const onOpenChange = vi.fn();
    render(
      <SectionEditDialog open onOpenChange={onOpenChange} title="T" dirty onSave={() => {}}>
        <p />
      </SectionEditDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: /annullér/i }));
    // AlertDialog appears, onOpenChange NOT called yet
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText(/kassér ændringer/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^kassér$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hides footer when showFooter=false (self-saving editors)", () => {
    render(
      <SectionEditDialog open onOpenChange={() => {}} title="T" showFooter={false}>
        <p>self</p>
      </SectionEditDialog>,
    );
    expect(screen.queryByRole("button", { name: /gem/i })).not.toBeInTheDocument();
  });

  it("disables Save when saveDisabled=true", () => {
    render(
      <SectionEditDialog open onOpenChange={() => {}} title="T" onSave={() => {}} saveDisabled>
        <p />
      </SectionEditDialog>,
    );
    expect(screen.getByRole("button", { name: /gem/i })).toBeDisabled();
  });

  it("disables Save while saving", () => {
    render(
      <SectionEditDialog open onOpenChange={() => {}} title="T" onSave={() => {}} saving>
        <p />
      </SectionEditDialog>,
    );
    expect(screen.getByRole("button", { name: /gem/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /annullér/i })).toBeDisabled();
  });
});
