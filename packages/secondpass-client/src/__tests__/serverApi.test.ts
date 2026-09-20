import { beforeEach, describe, expect, it } from "vitest";

import { ApiError, createSecondPassClient } from "../index";
import { installMockFetch as asMockFetch, installScriptedTransport, jsonResponse } from "./SdkTestTransport.Fixtures";

function clientApiDiscoveryResponse() {
  return {
    discovery_version: "1",
    login_request_endpoint: "/client-api/login-requests/",
    poll_endpoint_template: "/client-api/login-requests/%7Bid%7D/poll/",
    consume_endpoint_template: "/client-api/login-requests/%7Bid%7D/consume/",
    token_type: "Bearer",
  };
}

describe("SDK Server API", () => {
  const serverId = "123e4567-e89b-42d3-a456-426614174000";
  beforeEach(() => {
    asMockFetch();
  });

  it("server.discover works without access token, while auth-required namespaces throw without access token", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        server_name: "S",
        server_description: "D",
        server_version: "1.2.3",
        server_release_date: "2026-07-06",
        server_id: serverId,
      }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(clientApiDiscoveryResponse()));

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example" });
    const discovery = await spl.server.discover("https://server.example");
    expect(discovery.serverId).toBe(serverId);
    expect(discovery.server_release_date).toBe("2026-07-06");

    expect(() => spl.server.info()).toThrowError(ApiError);
    expect(() => spl.library.books.list()).toThrowError(ApiError);
  });

  it("uses the same cancellation signal for both anonymous discovery requests", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ server_id: serverId, server_name: "Library" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(clientApiDiscoveryResponse()));
    const signal = new AbortController().signal;

    await createSecondPassClient({ apiRootUrl: "https://server.example/api/v1/" })
      .server.discover("https://server.example", { signal });

    expect(fetchMock.mock.calls.map(([, init]) => init?.signal)).toEqual([signal, signal]);
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === "omit")).toBe(true);
  });

  it.each([
    [{ server_name: "Library" }, "missing ID"],
    [{ server_name: "Library", server_id: "bad-id" }, "malformed ID"],
    [{ server_name: "Library", installation_id: "123e4567-e89b-42d3-a456-426614174000" }, "old-only shape"],
  ])("rejects public discovery with %s (%s)", async (body, _description) => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(body));
    const spl = createSecondPassClient({ apiRootUrl: "https://server.example/api/v1/" });
    await expect(spl.server.discover("https://server.example")).rejects.toThrow("Invalid SecondPass discovery response.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not require an API root field in public discovery", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ server_id: serverId, server_name: "Library" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(clientApiDiscoveryResponse()));
    const spl = createSecondPassClient({ apiRootUrl: "https://server.example/api/v1/" });
    await expect(spl.server.discover("https://server.example")).resolves.toMatchObject({ serverId });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://server.example/api/v1/client-api/discovery/");
  });

  it("server discovery and pairing use discovered endpoints without credentials", async () => {
    const transport = installScriptedTransport([
      {
        name: "public discovery",
        response: jsonResponse({
          server_name: "S",
          server_description: "D",
          server_version: "1.2.3",
          server_release_date: "2026-07-06",
          server_id: serverId,
        }),
      },
      { name: "client API discovery", response: jsonResponse(clientApiDiscoveryResponse()) },
      {
        name: "create login request",
        response: jsonResponse({
          id: "request-1",
          code: "ABCD",
          authorize_url: "https://server.example/authorize",
          poll_url: "https://api.example/client-api/login-requests/request-1/poll/",
          consume_url: "https://api.example/client-api/login-requests/request-1/consume/",
          expires_at: "2026-06-21T12:00:00Z",
          interval: 3,
        }),
      },
      { name: "poll login request", response: jsonResponse({ status: "approved" }) },
      { name: "consume login request", response: jsonResponse({
        status: "consumed",
        access_token: "new-token",
        token_type: "Bearer",
        client_session: { id: "session-1", name: "Browser", client_type: "reader" },
      }) },
    ]);

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "pairing-token" });
    const discovery = await spl.server.discover("https://server.example/");
    expect(discovery).toEqual({
      server_name: "S",
      server_description: "D",
      server_version: "1.2.3",
      server_release_date: "2026-07-06",
      serverId,
      client_api: {
        ...clientApiDiscoveryResponse(),
      },
    });

    const loginRequest = await spl.server.createLoginRequest(discovery, "https://server.example");
    expect(loginRequest.consumeUrl).toBe("https://api.example/client-api/login-requests/request-1/consume/");
    await spl.server.pollLoginRequest("https://api.example/client-api/login-requests/request-1/poll/");
    await spl.server.consumeLoginRequest("https://api.example/client-api/login-requests/request-1/consume/");

    const publicDiscovery = transport.request("public discovery");
    const discoverHeaders = publicDiscovery.init?.headers as Record<string, string>;
    expect(String(publicDiscovery.input)).toBe("https://server.example/.well-known/secondpass");
    expect(discoverHeaders.Authorization).toBeUndefined();

    expect(String(transport.request("client API discovery").input)).toBe("https://server.example/api/v1/client-api/discovery/");

    const createRequest = transport.request("create login request");
    const createHeaders = createRequest.init?.headers as Record<string, string>;
    expect(String(createRequest.input)).toBe("https://server.example/api/v1/client-api/login-requests/");
    expect(createHeaders.Authorization).toBeUndefined();
    expect(JSON.parse(String(createRequest.init?.body))).toEqual({
      client_name: "Second Pass Reader",
      client_type: "reader",
    });

    const pollHeaders = transport.request("poll login request").init?.headers as Record<string, string>;
    expect(pollHeaders.Authorization).toBeUndefined();
    const consumeInit = transport.request("consume login request").init;
    expect(consumeInit?.method).toBe("POST");
    expect(consumeInit?.body).toBeUndefined();
    for (const name of [
      "public discovery",
      "client API discovery",
      "create login request",
      "poll login request",
      "consume login request",
    ]) {
      expect(transport.request(name).init?.credentials).toBe("omit");
    }
    transport.assertComplete();
  });

  it("server.createLoginRequest submits the caller-provided editable client name", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "request-1",
        code: "ABCD",
        authorize_url: "https://server.example/authorize",
        poll_url: "https://api.example/client-api/login-requests/request-1/poll/",
        consume_url: "https://api.example/client-api/login-requests/request-1/consume/",
        expires_at: "2026-06-21T12:00:00Z",
        interval: 3,
      }),
    );

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example" });
    await spl.server.createLoginRequest(
      {
        server_name: "Library Server",
        serverId,
        client_api: {
          ...clientApiDiscoveryResponse(),
        },
      },
      "https://api.example",
      {
        clientName: "SecondPass Reader \u00b7 Firefox on Linux",
        clientType: "reader",
      },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/api/v1/client-api/login-requests/");
    expect(JSON.parse(String(init?.body))).toEqual({
      client_name: "SecondPass Reader \u00b7 Firefox on Linux",
      client_type: "reader",
    });
  });


  it("server.info projects authenticated server display and configuration context", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      server_id: serverId,
      server_urls: ["https://library.example", "https://library.example:8443"],
      server_name: "Athena Library",
      server_description: "Private reading server",
      server_banner_message: "Maintenance tonight",
      advanced_library_groups_enabled: true,
      reading_client_base_url: "https://reader.example",
      marginalia_profile_uri: "https://example.test/profiles/marginalia",
      public_group: {
        id: "public-1",
        name: "Common Room",
        description: "Public catalog",
      },
      server_version: "2.4.0",
      server_release_date: "2026-08-01",
    }));

    const spl = createSecondPassClient({ apiRootUrl: "https://api.example", accessToken: "t" });
    await expect(spl.server.info()).resolves.toEqual({
      serverId,
      serverUrls: ["https://library.example", "https://library.example:8443"],
      name: "Athena Library",
      description: "Private reading server",
      bannerText: "Maintenance tonight",
      advancedLibraryGroupsEnabled: true,
      readingClientBaseUrl: "https://reader.example",
      marginaliaProfileUri: "https://example.test/profiles/marginalia",
      publicGroup: {
        id: "public-1",
        name: "Common Room",
        description: "Public catalog",
      },
      version: "2.4.0",
      releaseDate: "2026-08-01",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/server/info/");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it.each([
    { server_id: "bad-id", server_urls: ["https://library.example"] },
    { server_id: serverId, server_urls: ["https://library.example", "not a URL"] },
  ])("rejects malformed authenticated server identity or route list", async (wire) => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(wire));
    const spl = createSecondPassClient({ apiRootUrl: "https://library.example/api/v1/", accessToken: "t" });
    await expect(spl.server.info()).rejects.toThrow("Invalid authenticated server information.");
  });

  it("accepts one declared route", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({ server_id: serverId, server_urls: ["https://library.example"] }));
    const spl = createSecondPassClient({ apiRootUrl: "https://library.example/api/v1/", accessToken: "t" });
    await expect(spl.server.info()).resolves.toMatchObject({
      serverId,
      serverUrls: ["https://library.example"],
    });
  });

});
