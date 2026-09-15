import type { CurrentUser, SecondPassClient } from "@secondpass/client";
import { createSplClientFromProfile } from "../../app/AppSplClient.Factory";
import { isAuthenticationRepairError, isAuthorizationError } from "../../app/AppUserFacingErrors.Mapper";
import {
  beginActiveConnectionPublication,
  isActiveConnectionPublicationCurrent,
  publishActiveConnectionResult,
  saveConnectionProfile,
  type ConnectionProfile,
} from "../../storage/ConnectionProfiles.Store";
import { loadAuthenticatedContext } from "./AuthenticatedContext.Queries";
import { applyAuthenticatedContextToProfile } from "./ConnectionAccountProfile.Mapper";
import { finalizeConnectionRepair } from "./ConnectionRepair.Controller";

export type ConnectionVerificationResult =
  | { status: "verified"; currentUser: CurrentUser }
  | { status: "stale" }
  | { status: "repair-cleanup-failed"; previousProfileId?: string; verifiedProfileId?: string }
  | { status: "authorization-failed"; authenticationRejected: boolean }
  | { status: "failed"; error: unknown };

export async function verifyConnection(input: {
  profile: ConnectionProfile;
  createClient?: (profile: ConnectionProfile) => SecondPassClient;
  loadContext?: typeof loadAuthenticatedContext;
  finalizeRepair?: typeof finalizeConnectionRepair;
  save?: (profile: ConnectionProfile) => void;
  now?: () => string;
}): Promise<ConnectionVerificationResult> {
  const publication = beginActiveConnectionPublication(input.profile);
  if (!publication) return { status: "stale" };

  const save = input.save ?? saveConnectionProfile;
  try {
    const spl = (input.createClient ?? createSplClientFromProfile)(input.profile);
    const { currentUser, serverInfo } = await (input.loadContext ?? loadAuthenticatedContext)(spl);
    if (!isActiveConnectionPublicationCurrent(publication)) return { status: "stale" };

    const updated = applyAuthenticatedContextToProfile(
      input.profile,
      currentUser,
      serverInfo,
      (input.now ?? (() => new Date().toISOString()))(),
    );
    if (input.profile.authenticationState !== "verifying-repair") {
      const published = publishActiveConnectionResult(publication, () => save(updated));
      return published ? { status: "verified", currentUser } : { status: "stale" };
    }

    let saved = false;
    const repair = await (input.finalizeRepair ?? finalizeConnectionRepair)({
      previous: input.profile,
      verified: updated,
      save: (verified) => {
        saved = publishActiveConnectionResult(publication, () => save(verified));
      },
    });
    if (repair.status !== "saved") {
      if (!isActiveConnectionPublicationCurrent(publication)) return { status: "stale" };
      return {
        status: "repair-cleanup-failed",
        previousProfileId: input.profile.verifiedUser?.profileId,
        verifiedProfileId: updated.verifiedUser?.profileId,
      };
    }
    return saved ? { status: "verified", currentUser } : { status: "stale" };
  } catch (error) {
    const authenticationRejected = isAuthenticationRepairError(error);
    if (isAuthorizationError(error)) {
      const published = publishActiveConnectionResult(publication, () => {
        if (input.profile.authenticationState === "verifying-repair" && authenticationRejected) {
          save({ ...input.profile, authenticationState: "repair-required" });
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
