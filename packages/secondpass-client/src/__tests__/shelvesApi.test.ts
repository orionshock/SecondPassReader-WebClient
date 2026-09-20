import { beforeEach, describe, expect, it } from "vitest";

import { createSecondPassClient } from "../index";
import {
  emptyResponse,
  installMockFetch as asMockFetch,
  installScriptedTransport,
  jsonResponse,
} from "./SdkTestTransport.Fixtures";

describe("SDK Shelves API", () => {
  beforeEach(() => {
    asMockFetch();
  });

  it("shelves.list sends scoped and existing shelf filters", async () => {
    const transport = installScriptedTransport([
      { name: "list shared shelves", response: jsonResponse({ count: 0, next: null, previous: null, results: [] }) },
      { name: "list personal shelves", response: jsonResponse({ count: 0, next: null, previous: null, results: [] }) },
    ]);

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.list({
      scope: "shared",
      ownerGroup: 42,
      book: "book-1",
      page: 2,
      pageSize: 25,
      includePreviewBooks: true,
      previewLimit: 24,
      ordering: "-item_count",
    });
    await spl.shelves.list({ scope: "personal", book: 7, includePreviewBooks: false });

    const sharedUrl = new URL(String(transport.request("list shared shelves").input));
    expect(sharedUrl.origin + sharedUrl.pathname).toBe("https://api.example/shelves/");
    expect(sharedUrl.searchParams.get("scope")).toBe("shared");
    expect(sharedUrl.searchParams.get("owner_group")).toBe("42");
    expect(sharedUrl.searchParams.get("book")).toBe("book-1");
    expect(sharedUrl.searchParams.get("page")).toBe("2");
    expect(sharedUrl.searchParams.get("page_size")).toBe("25");
    expect(sharedUrl.searchParams.get("include_preview_books")).toBe("true");
    expect(sharedUrl.searchParams.get("preview_limit")).toBe("24");
    expect(sharedUrl.searchParams.get("ordering")).toBe("-item_count");

    const personalUrl = new URL(String(transport.request("list personal shelves").input));
    expect(personalUrl.searchParams.get("scope")).toBe("personal");
    expect(personalUrl.searchParams.get("book")).toBe("7");
    expect(personalUrl.searchParams.has("owner_group")).toBe(false);
    expect(personalUrl.searchParams.has("include_preview_books")).toBe(false);
    expect(personalUrl.searchParams.has("preview_limit")).toBe(false);
    transport.assertComplete();
  });


  it("shelf items list sends server ordering", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.items("shelf-1", { page: 2, pageSize: 50, ordering: "author" });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.example/shelves/shelf-1/items/");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(url.searchParams.get("ordering")).toBe("author");
  });

  it("shelves.get fetches shelf detail with optional preview books", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "shelf 1", name: "Shelf" }));

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.get("shelf 1", { includePreviewBooks: true, previewLimit: 8 });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.example/shelves/shelf%201/");
    expect(url.searchParams.get("include_preview_books")).toBe("true");
    expect(url.searchParams.get("preview_limit")).toBe("8");
  });

  it("shelf items list supports position, title, and author ordering without mutating shelf positions", async () => {
    const fetchMock = asMockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.items("shelf-1", { ordering: "position" });
    await spl.shelves.items("shelf-1", { ordering: "title" });
    await spl.shelves.items("shelf-1", { ordering: "author" });

    const orderings = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("ordering"));
    expect(orderings).toEqual(["position", "title", "author"]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.body).toBeUndefined();
    }
  });

  it("shelves.list preserves unscoped behavior and rejects personal owner-group filters", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ count: 0, next: null, previous: null, results: [] }));

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.list({ ownerGroup: "group-1" });

    const unscopedUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(unscopedUrl.searchParams.has("scope")).toBe(false);
    expect(unscopedUrl.searchParams.get("owner_group")).toBe("group-1");

    await expect(
      spl.shelves.list({ scope: "personal", ownerGroup: "group-1" } as never),
    ).rejects.toThrowError(/cannot be combined/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shelf create/update/delete and item mutations use reader-safe payloads", async () => {
    const transport = installScriptedTransport([
      { name: "create shelf", response: jsonResponse({ id: "shelf-1", name: "Later", owner_type: "user" }) },
      { name: "update shelf", response: jsonResponse({ id: "shelf-1", name: "Renamed" }) },
      { name: "add item", response: jsonResponse({ id: "item-1", book: 10, position: 0 }) },
      { name: "update item", response: jsonResponse({ id: "item-1", position: 2 }) },
      { name: "remove item", response: emptyResponse() },
      { name: "remove shelf", response: emptyResponse() },
    ]);

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "t" });
    await spl.shelves.create({ name: "Later", description: "<p>To <strong>read</strong></p>", visibility: "private", owner_type: "user" });
    await spl.shelves.update("shelf-1", { name: "Renamed", description: "<p>Updated<br>again</p>" });
    await spl.shelves.addItem("shelf-1", { book: "10" });
    await spl.shelves.updateItem("shelf-1", "item-1", { position: 2 });
    await spl.shelves.removeItem("shelf-1", "item-1");
    await spl.shelves.remove("shelf-1");

    const createRequest = transport.request("create shelf");
    const createPayload = JSON.parse(String(createRequest.init?.body));
    expect(String(createRequest.input)).toBe("https://api.example/shelves/");
    expect(createRequest.init?.method).toBe("POST");
    expect(createPayload).toEqual({
      name: "Later",
      description: "<p>To <strong>read</strong></p>",
      visibility: "private",
      owner_type: "user",
    });
    expect(createPayload).not.toHaveProperty("owner_group");
    expect(createPayload).not.toHaveProperty("group");

    const updateShelfRequest = transport.request("update shelf");
    expect(String(updateShelfRequest.input)).toBe("https://api.example/shelves/shelf-1/");
    expect(updateShelfRequest.init?.method).toBe("PATCH");
    expect(JSON.parse(String(updateShelfRequest.init?.body))).toEqual({ name: "Renamed", description: "<p>Updated<br>again</p>" });

    const addItemRequest = transport.request("add item");
    expect(String(addItemRequest.input)).toBe("https://api.example/shelves/shelf-1/items/");
    expect(addItemRequest.init?.method).toBe("POST");
    expect(JSON.parse(String(addItemRequest.init?.body))).toEqual({ book: "10" });

    const updateItemRequest = transport.request("update item");
    expect(String(updateItemRequest.input)).toBe("https://api.example/shelves/shelf-1/items/item-1/");
    expect(updateItemRequest.init?.method).toBe("PATCH");
    expect(JSON.parse(String(updateItemRequest.init?.body))).toEqual({ position: 2 });

    const removeItemRequest = transport.request("remove item");
    expect(String(removeItemRequest.input)).toBe("https://api.example/shelves/shelf-1/items/item-1/");
    expect(removeItemRequest.init?.method).toBe("DELETE");
    const removeShelfRequest = transport.request("remove shelf");
    expect(String(removeShelfRequest.input)).toBe("https://api.example/shelves/shelf-1/");
    expect(removeShelfRequest.init?.method).toBe("DELETE");
    transport.assertComplete();
  });

});
