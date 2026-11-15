import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/lib/api-client";
import { DeleteProject } from "./delete-project";

function client(status: number, body: unknown) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  return { api: createApiClient({ fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl };
}

describe("DeleteProject (step 10)", () => {
  it("asks first, then deletes and goes to the dashboard", async () => {
    const { api, fetchImpl } = client(200, { deleted: true, projectId: "p1", files: 1 });
    const navigate = vi.fn();
    render(
      <DeleteProject projectId="p1" projectName="Launch video" client={api} navigate={navigate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Confirm delete" })).toHaveTextContent(
      'Delete "Launch video" and its videos? This cannot be undone.',
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/projects/p1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("Cancel sends nothing", () => {
    const { api, fetchImpl } = client(200, {});
    render(<DeleteProject projectId="p1" projectName="x" client={api} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete project" })).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays on the page when it fails", async () => {
    const { api } = client(501, {
      error: { code: "not_configured", message: "Storage is not configured." },
    });
    const navigate = vi.fn();
    render(<DeleteProject projectId="p1" projectName="x" client={api} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage is not configured.");
    expect(navigate).not.toHaveBeenCalled();
  });
});
