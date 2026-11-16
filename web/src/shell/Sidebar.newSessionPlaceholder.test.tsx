import { conversation, conversationPage } from "@/test/sidebarMockHelpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useScopeCache", () => import("@/test/mockScopeCache"));
import { SidebarDataProvider } from "@/hooks/useSidebarData";
// While a new session is composed inside a project (`/?project=<name>`), the
// expanded folder shows a "New session" placeholder row above its sessions. It
// is not a session: no link, menu, pin, drag, selection or shortcut slot. It
// appears only under the targeted project and only on that composer route.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PROJECT_LABEL_KEY } from "@/lib/sessionListCache";
import { EXPANDED_PROJECT_SECTIONS_STORAGE_KEY } from "@/shell/sidebarNav";

vi.mock("@/hooks/useConversations", async () => {
  const {
    conversationHooksMock,
    conversation: row,
    conversationPage: page,
  } = await import("@/test/sidebarMockHelpers");
  const { PROJECT_LABEL_KEY: projectLabelKey } = await import("@/lib/sessionListCache");
  return {
    ...conversationHooksMock(),
    useProjects: () => ({
      data: [
        { id: "p_alpha", name: "Alpha" },
        { id: "p_beta", name: "Beta" },
      ],
    }),
    // Each folder lists one session of its own so the placeholder's position
    // relative to real rows is observable.
    useProjectSessions: (name: string) =>
      page([row(`${name} session`, { labels: { [projectLabelKey]: name } })]),
  };
});
vi.mock("@/components/PermissionsModal", () => ({ PermissionsModal: () => null }));

import { useConversations } from "@/hooks/useConversations";
import { Sidebar } from "./Sidebar";

const useConvMock = vi.mocked(useConversations);

function renderAt(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SidebarDataProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/" element={<Sidebar open onClose={vi.fn()} />} />
              <Route path="/c/:conversationId" element={<Sidebar open onClose={vi.fn()} />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </SidebarDataProvider>
    </QueryClientProvider>,
  );
}

/** The folder's <section>, found from its header button. */
function folderSection(name: string): HTMLElement {
  return screen.getByRole("button", { name }).closest("section") as HTMLElement;
}

beforeEach(() => {
  localStorage.setItem(EXPANDED_PROJECT_SECTIONS_STORAGE_KEY, JSON.stringify(["Alpha", "Beta"]));
  useConvMock.mockReturnValue(
    conversationPage(
      [
        conversation("Alpha session", { labels: { [PROJECT_LABEL_KEY]: "Alpha" } }),
        conversation("Beta session", { labels: { [PROJECT_LABEL_KEY]: "Beta" } }),
      ],
      { first_id: null, last_id: null },
    ),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("new-session placeholder row", () => {
  it("shows one placeholder at the top of the targeted project only", () => {
    renderAt("/?project=Alpha");

    const placeholders = screen.getAllByTestId("sidebar-new-session-placeholder");
    expect(placeholders).toHaveLength(1);
    const [placeholder] = placeholders;
    expect(placeholder).toHaveTextContent("New session");

    const alpha = folderSection("Alpha");
    expect(alpha).toContainElement(placeholder);
    expect(
      within(folderSection("Beta")).queryByTestId("sidebar-new-session-placeholder"),
    ).toBeNull();

    // Above the folder's real rows, which keep rendering.
    const firstRow = within(alpha).getByRole("link", { name: /Alpha session/ });
    expect(placeholder.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    // Active-row highlight on the row; the label inherits its foreground.
    expect(placeholder).toHaveClass(
      "sidebar-row",
      "items-center",
      "bg-[var(--sidebar-active)]",
      "text-[var(--sidebar-active-foreground)]",
    );
    expect(placeholder.parentElement).toHaveClass("pl-6");
    const label = within(placeholder).getByText("New session");
    expect(label).not.toHaveClass("italic", "text-muted-foreground");

    // A leading sparkle icon, decorative only.
    const icon = placeholder.querySelector("svg.lucide-wand-sparkles");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.getAttribute("class")).toMatch(/\bsize-3\.5\b/);
    expect(icon!.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    // Not a session: no link, controls, drag handle or shortcut slot.
    expect(placeholder.closest("a")).toBeNull();
    expect(placeholder.querySelector("a, button, input")).toBeNull();
    expect(placeholder.closest("[data-sidebar-session-id]")).toBeNull();
    expect(placeholder.querySelector("[aria-keyshortcuts]")).toBeNull();
  });

  it("renders no placeholder on a session route", () => {
    renderAt("/c/Alpha%20session?project=Alpha");
    expect(screen.queryByTestId("sidebar-new-session-placeholder")).toBeNull();
  });

  it("renders no placeholder on the plain new-session route", () => {
    renderAt("/");
    expect(screen.queryByTestId("sidebar-new-session-placeholder")).toBeNull();
  });
});
