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
  api_base_url: string;
  client_api: {
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

export type MeCapabilities = {
  can_manage_users?: boolean;
  can_manage_library?: boolean;
  can_import_books?: boolean;
  can_create_library_groups?: boolean;
  can_manage_group_memberships?: boolean;
  can_manage_group_identity?: boolean;
  can_edit_group_presentation?: boolean;
  can_access_imports?: boolean;
  [key: string]: boolean | undefined;
};

export type MeGroup = {
  id: string;
  name: string;
  is_public_group: boolean;
  is_curator: boolean;
};

export type MePayload = {
  id?: string | number;
  profile_id?: string;
  username: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role?: string;
  must_change_password?: boolean;
  is_owner?: boolean;
  capabilities?: MeCapabilities;
  groups?: MeGroup[];
  raw?: unknown;
};
