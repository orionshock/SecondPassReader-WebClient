export { ApiError, type ApiErrorKind } from "./apiHttp";
export { createSecondPassClient } from "./client";
export type { SecondPassClient, SecondPassClientConfig, LibraryBookListParams } from "./client";

export type * from "./schemas/clientApiAuth";
export type * from "./schemas/library";
export type * from "./schemas/readingSession";
export type * from "./schemas/shelves";
export type * from "./schemas/w3cAnnotation";
