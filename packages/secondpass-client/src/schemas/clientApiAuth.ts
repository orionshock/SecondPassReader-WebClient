export type SecondPassWellKnown = {
  // Future: shape defined by the server discovery document.
  // Keep permissive until the server API is finalized.
  issuer?: string;
  client_api?: {
    login_request_url?: string;
  };
};

export type SecondPassDiscovery = {
  server_name: string;
  server_description?: string;
  server_version?: string;
  server_release?: string;
  server_release_date?: string;
  api_base_url: string;
  client_api?: {
    discovery_version: string;
    discovery_endpoint: string;
    login_request_endpoint: string;
    authorize_url: string;
    poll_endpoint_template: string;
    token_type: "Bearer" | string;
  };
};

export type ClientApiLoginRequestResponse = {
  id: string;
  code: string;
  authorize_url: string;
  poll_url: string;
  expires_at: string;
  interval: number;
};

export type ClientApiPollResponse =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "consumed" }
  | {
      status: "approved";
      access_token: string;
      token_type: "Bearer" | string;
      client_session: {
        id: string;
        name: string;
        client_type: string;
      };
    };
