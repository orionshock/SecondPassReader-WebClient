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
        server_release: "r1",
        server_release_date: "2026-07-06",
        api_base_url: "https://api.example",
      }),
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(clientApiDiscoveryResponse()));

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example" });
    const discovery = await spl.server.discover("https://server.example");
    expect(discovery.api_base_url).toBe("https://api.example");
    expect(discovery.server_release_date).toBe("2026-07-06");

    expect(() => spl.server.info()).toThrowError(ApiError);
    expect(() => spl.library.books.list()).toThrowError(ApiError);
  });

  it("server discovery and pairing use discovered endpoints without credentials", async () => {
    const transport = installScriptedTransport([
      {
        name: "public discovery",
        response: jsonResponse({
          server_name: "S",
          server_description: "D",
          server_version: "1.2.3",
          server_release: "r1",
          server_release_date: "2026-07-06",
          api_base_url: "https://api.example",
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

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "pairing-token" });
    const discovery = await spl.server.discover("https://server.example/");
    expect(discovery).toEqual({
      server_name: "S",
      server_description: "D",
      server_version: "1.2.3",
      server_release: "r1",
      server_release_date: "2026-07-06",
      api_base_url: "https://api.example",
      client_api: {
        ...clientApiDiscoveryResponse(),
      },
    });

    const loginRequest = await spl.server.createLoginRequest(discovery);
    expect(loginRequest.consumeUrl).toBe("https://api.example/client-api/login-requests/request-1/consume/");
    await spl.server.pollLoginRequest("https://api.example/client-api/login-requests/request-1/poll/");
    await spl.server.consumeLoginRequest("https://api.example/client-api/login-requests/request-1/consume/");

    const publicDiscovery = transport.request("public discovery");
    const discoverHeaders = publicDiscovery.init?.headers as Record<string, string>;
    expect(String(publicDiscovery.input)).toBe("https://server.example/.well-known/secondpass");
    expect(discoverHeaders.Authorization).toBeUndefined();

    expect(String(transport.request("client API discovery").input)).toBe("https://api.example/client-api/discovery/");

    const createRequest = transport.request("create login request");
    const createHeaders = createRequest.init?.headers as Record<string, string>;
    expect(String(createRequest.input)).toBe("https://api.example/client-api/login-requests/");
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

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example" });
    await spl.server.createLoginRequest(
      {
        server_name: "Library Server",
        api_base_url: "https://api.example",
        client_api: {
          ...clientApiDiscoveryResponse(),
        },
      },
      {
        clientName: "SecondPass Reader \u00b7 Firefox on Linux",
        clientType: "reader",
      },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example/client-api/login-requests/");
    expect(JSON.parse(String(init?.body))).toEqual({
      client_name: "SecondPass Reader \u00b7 Firefox on Linux",
      client_type: "reader",
    });
  });


  it("server.info projects authenticated server display and configuration context", async () => {
    const fetchMock = asMockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse({
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

    const spl = createSecondPassClient({ apiBaseUrl: "https://api.example", accessToken: "t" });
    await expect(spl.server.info()).resolves.toEqual({
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

});
