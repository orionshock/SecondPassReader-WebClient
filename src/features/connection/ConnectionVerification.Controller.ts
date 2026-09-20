import type { CurrentUser, SecondPassClient } from "@secondpass/client";
import { createSplClientFromConnection } from "../../app/AppSplClient.Factory";
import { isAuthenticationRepairError, isAuthorizationError } from "../../app/AppUserFacingErrors.Mapper";
import {
  beginActiveConnectionPublication,
  isActiveConnectionPublicationCurrent,
  publishActiveConnectionResult,
  saveActiveConnection,
  type ActiveConnection,
} from "../../storage/ActiveConnection.Store";
import { loadAuthenticatedContext } from "./AuthenticatedContext.Queries";
import { applyAuthenticatedContextToConnection, ServerIdentityMismatchError } from "./ConnectionAccountProfile.Mapper";
import { finalizeConnectionRepair } from "./ConnectionRepair.Controller";

export type ConnectionVerificationResult =
  | { status: "verified"; currentUser: CurrentUser }
  | { status: "stale" }
  | { status: "repair-cleanup-failed"; previousProfileId?: string; verifiedProfileId?: string }
  | { status: "authorization-failed"; authenticationRejected: boolean }
  | { status: "server-identity-mismatch" }
  | { status: "failed"; error: unknown };

export async function verifyConnection(input: {
  connection: ActiveConnection;
  createClient?: (connection: ActiveConnection) => SecondPassClient;
  loadContext?: typeof loadAuthenticatedContext;
  finalizeRepair?: typeof finalizeConnectionRepair;
  save?: (connection: ActiveConnection) => void;
  now?: () => string;
}): Promise<ConnectionVerificationResult> {
  const publication = beginActiveConnectionPublication(input.connection);
  if (!publication) return { status: "stale" };

  const save = input.save ?? saveActiveConnection;
  try {
    const spl = (input.createClient ?? createSplClientFromConnection)(input.connection);
    const { currentUser, serverInfo } = await (input.loadContext ?? loadAuthenticatedContext)(spl);
    if (!isActiveConnectionPublicationCurrent(publication)) return { status: "stale" };

    const updated = applyAuthenticatedContextToConnection(
      input.connection,
      currentUser,
      serverInfo,
      (input.now ?? (() => new Date().toISOString()))(),
    );
    if (input.connection.authenticationState !== "verifying-repair") {
      const published = publishActiveConnectionResult(publication, () => save(updated));
      return published ? { status: "verified", currentUser } : { status: "stale" };
    }

    let saved = false;
    const repair = await (input.finalizeRepair ?? finalizeConnectionRepair)({
      previous: input.connection,
      verified: updated,
      save: (verified) => {
        saved = publishActiveConnectionResult(publication, () => save(verified));
      },
    });
    if (repair.status !== "saved") {
      if (!isActiveConnectionPublicationCurrent(publication)) return { status: "stale" };
      return {
        status: "repair-cleanup-failed",
        previousProfileId: input.connection.verifiedUser?.profileId,
        verifiedProfileId: updated.verifiedUser?.profileId,
      };
    }
    return saved ? { status: "verified", currentUser } : { status: "stale" };
  } catch (error) {
    if (error instanceof ServerIdentityMismatchError) {
      return publishActiveConnectionResult(publication, () => undefined)
        ? { status: "server-identity-mismatch" }
        : { status: "stale" };
    }
    const authenticationRejected = isAuthenticationRepairError(error);
    if (isAuthorizationError(error)) {
      const published = publishActiveConnectionResult(publication, () => {
        if (input.connection.authenticationState === "verifying-repair" && authenticationRejected) {
          save({ ...input.connection, authenticationState: "repair-required" });
        }
      });
      return published
        ? { status: "authorization-failed", authenticationRejected }
        : { status: "stale" };
    }
    return publishActiveConnectionResult(publication, () => undefined)
      ? { status: "failed", error }
      : { status: "stale" };
  }
}
