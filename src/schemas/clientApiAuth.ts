export type SecondPassWellKnown = {
  // Future: shape defined by the server discovery document.
  // Keep permissive until the server API is finalized.
  issuer?: string;
  client_api?: {
    login_request_url?: string;
  };
};

export type ClientApiLoginRequestResponse = {
  code: string;
  authorize_url: string;
  poll_url: string;
  expires_at?: string;
};

export type ClientApiPollResponse =
  | { status: "pending" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "approved"; access_token: string };

