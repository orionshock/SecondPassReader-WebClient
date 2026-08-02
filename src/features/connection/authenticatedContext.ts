import type { CurrentUser, SecondPassClient, ServerInfo } from "@secondpass/client";

export type AuthenticatedContext = {
  currentUser: CurrentUser;
  serverInfo: ServerInfo;
};

export class AuthenticatedContextLoadError extends Error {
  readonly source: "currentUser" | "serverInfo";
  override readonly cause: unknown;

  constructor(source: "currentUser" | "serverInfo", cause: unknown) {
    super(source === "serverInfo"
      ? "Could not load authenticated server information."
      : "Could not load current account information.");
    this.source = source;
    this.cause = cause;
  }
}

export async function loadAuthenticatedContext(spl: SecondPassClient): Promise<AuthenticatedContext> {
  const [currentUser, serverInfo] = await Promise.all([
    spl.account.getCurrentUser().catch((error: unknown) => {
      throw new AuthenticatedContextLoadError("currentUser", error);
    }),
    spl.server.info().catch((error: unknown) => {
      throw new AuthenticatedContextLoadError("serverInfo", error);
    }),
  ]);
  return { currentUser, serverInfo };
}
