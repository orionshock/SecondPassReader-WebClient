export type ActiveConnection = {
  id: string;
  label: string;
  serverBaseUrl: string;
  apiBaseUrl?: string;
  serverName?: string;
  serverDescription?: string;
  serverVersion?: string;
  serverRelease?: string;
  serverReleaseDate?: string;
  advancedLibraryGroupsEnabled?: boolean;
  bannerText?: string | null;
  readingClientBaseUrl?: string;
  marginaliaProfileUri?: string;
  publicGroup?: {
    id: string;
    name: string;
    description: string;
  };
  accessToken?: string;
  authenticationState?: "repair-required" | "verifying-repair";
  tokenType?: string;
  clientSessionId?: string;
  clientSessionName?: string;
  linkedAt?: string;
  verifiedAt?: string;
  verifiedUser?: {
    profileId?: string;
    username: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
    isOwner?: boolean;
    isManager?: boolean;
    isLibrarian?: boolean;
    isReader?: boolean;
    canAccessDjangoAdmin?: boolean;
    groups?: Array<{
      id: string;
      name: string;
      isPublicGroup: boolean;
      isCurator: boolean;
    }>;
  };
  mustChangePassword?: boolean;
  clientApi?: {
    discoveryVersion: string;
    loginRequestEndpoint: string;
    pollEndpointTemplate: string;
    consumeEndpointTemplate: string;
    tokenType: string;
  };
  createdAt: string;
  lastUsedAt?: string;
  lastCheckedAt?: string;
};

const ACTIVE_CONNECTION_KEY = "secondpass.activeConnection.v1";
const LEGACY_CONNECTIONS_KEY = "secondpass.connectionProfiles.v1";
const LEGACY_SELECTED_CONNECTION_KEY = "secondpass.selectedConnectionProfileId.v1";

export type ActiveConnectionPublication = Readonly<{ token: symbol }>;

let publicationGeneration = 0;
const publicationOwnership = new WeakMap<ActiveConnectionPublication, {
  generation: number;
  expectedRecord: string | null;
}>();

function readActive(): ActiveConnection | null {
  const raw = localStorage.getItem(ACTIVE_CONNECTION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isActiveConnection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type UnknownRecord = Record<string, unknown>;

function isActiveConnection(value: unknown): value is ActiveConnection {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)
    || typeof value.label !== "string"
    || !isNonEmptyString(value.serverBaseUrl)
    || !isTimestamp(value.createdAt)) return false;

  if (!optionalFieldsMatch(value, [
    "apiBaseUrl",
    "serverName",
    "serverDescription",
    "serverVersion",
    "serverRelease",
    "serverReleaseDate",
    "readingClientBaseUrl",
    "marginaliaProfileUri",
    "clientSessionName",
  ], isString)) return false;
  if (!optionalFieldsMatch(value, [
    "accessToken",
    "tokenType",
    "clientSessionId",
  ], isNonEmptyString)) return false;
  if (!optionalFieldsMatch(value, [
    "linkedAt",
    "verifiedAt",
    "lastUsedAt",
    "lastCheckedAt",
  ], isTimestamp)) return false;
  if (!optionalFieldsMatch(value, [
    "advancedLibraryGroupsEnabled",
    "mustChangePassword",
  ], isBoolean)) return false;
  if (value.bannerText !== undefined && value.bannerText !== null && typeof value.bannerText !== "string") return false;
  if (value.authenticationState !== undefined
    && value.authenticationState !== "repair-required"
    && value.authenticationState !== "verifying-repair") return false;
  if (value.publicGroup !== undefined && !isPublicGroup(value.publicGroup)) return false;
  if (value.verifiedUser !== undefined && !isVerifiedUser(value.verifiedUser)) return false;
  return value.clientApi === undefined || isClientApi(value.clientApi);
}

function isVerifiedUser(value: unknown): value is NonNullable<ActiveConnection["verifiedUser"]> {
  if (!isRecord(value) || !isNonEmptyString(value.username)) return false;
  if (!optionalFieldsMatch(value, [
    "profileId",
    "displayName",
    "firstName",
    "lastName",
    "email",
    "role",
  ], isString)) return false;
  if (!optionalFieldsMatch(value, [
    "isOwner",
    "isManager",
    "isLibrarian",
    "isReader",
    "canAccessDjangoAdmin",
  ], isBoolean)) return false;
  return value.groups === undefined
    || (Array.isArray(value.groups) && value.groups.every(isVerifiedUserGroup));
}

function isVerifiedUserGroup(value: unknown): value is NonNullable<NonNullable<ActiveConnection["verifiedUser"]>["groups"]>[number] {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && typeof value.name === "string"
    && typeof value.isPublicGroup === "boolean"
    && typeof value.isCurator === "boolean";
}

function isPublicGroup(value: unknown): value is NonNullable<ActiveConnection["publicGroup"]> {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && typeof value.name === "string"
    && typeof value.description === "string";
}

function isClientApi(value: unknown): value is NonNullable<ActiveConnection["clientApi"]> {
  return isRecord(value)
    && isNonEmptyString(value.discoveryVersion)
    && isNonEmptyString(value.loginRequestEndpoint)
    && isNonEmptyString(value.pollEndpointTemplate)
    && isNonEmptyString(value.consumeEndpointTemplate)
    && isNonEmptyString(value.tokenType);
}

function optionalFieldsMatch(
  value: UnknownRecord,
  fields: readonly string[],
  validate: (candidate: unknown) => boolean,
): boolean {
  return fields.every((field) => value[field] === undefined || validate(value[field]));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function writeActive(connection: ActiveConnection) {
  invalidateActiveConnectionPublications();
  localStorage.setItem(ACTIVE_CONNECTION_KEY, JSON.stringify(connection));
}

function serializedConnection(connection: ActiveConnection | null): string | null {
  return connection ? JSON.stringify(connection) : null;
}

export function getActiveConnection(): ActiveConnection | null {
  return readActive();
}

export function beginActiveConnectionPublication(
  expected: ActiveConnection | null,
): ActiveConnectionPublication | null {
  const expectedRecord = serializedConnection(expected);
  if (serializedConnection(readActive()) !== expectedRecord) return null;
  publicationGeneration += 1;
  const publication = Object.freeze({ token: Symbol("active-connection-publication") });
  publicationOwnership.set(publication, { generation: publicationGeneration, expectedRecord });
  return publication;
}

export function isActiveConnectionPublicationCurrent(
  publication: ActiveConnectionPublication,
): boolean {
  const ownership = publicationOwnership.get(publication);
  return ownership?.generation === publicationGeneration
    && serializedConnection(readActive()) === ownership.expectedRecord;
}

export function publishActiveConnectionResult(
  publication: ActiveConnectionPublication,
  publish: () => void,
): boolean {
  // Async verification/refresh may outlive its connection. Results publish only while both the
  // operation generation and the exact active connection record that started it remain current.
  if (!isActiveConnectionPublicationCurrent(publication)) return false;
  publish();
  return true;
}

function invalidateActiveConnectionPublications(): void {
  publicationGeneration += 1;
}

export function saveActiveConnection(connection: ActiveConnection): void {
  writeActive(connection);
  try {
    localStorage.removeItem(LEGACY_CONNECTIONS_KEY);
    localStorage.removeItem(LEGACY_SELECTED_CONNECTION_KEY);
  } catch {
    // Legacy-key cleanup must not block the active single-connection record.
  }
}

export function clearActiveConnection(): void {
  invalidateActiveConnectionPublications();
  localStorage.removeItem(ACTIVE_CONNECTION_KEY);
  try {
    localStorage.removeItem(LEGACY_CONNECTIONS_KEY);
    localStorage.removeItem(LEGACY_SELECTED_CONNECTION_KEY);
  } catch {
    // The active connection is already gone; legacy residue is inert.
  }
}
