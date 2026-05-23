import type { PaginatedResponse } from "./library";
import type { LibraryAuthorSummary, LibrarySeriesSummary } from "./library";

export type ShelfOwnerType = "user" | "group" | string;
export type ShelfVisibility = "private" | "listed" | string;

export type ShelfOwnerUserSummary = {
  id: string | number;
  username?: string | null;
  [k: string]: unknown;
};

export type ShelfOwnerGroupSummary = {
  id: string | number;
  name: string;
  is_public_group?: boolean;
  [k: string]: unknown;
};

export type Shelf = {
  id: string;
  name: string;
  description?: string | null;
  owner_type: ShelfOwnerType;
  owner_user?: ShelfOwnerUserSummary | null;
  owner_group?: ShelfOwnerGroupSummary | null;
  visibility?: ShelfVisibility | null;
  item_count?: number | null;
  matched_item_id?: string | null;
  can_edit?: boolean;
  created_by?: ShelfOwnerUserSummary | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

export type ShelfBookSummary = {
  id: string | number;
  title: string;
  authors?: LibraryAuthorSummary[] | null;
  series?: LibrarySeriesSummary | null;
  has_file?: boolean;
  cover_url?: string | null;
  [k: string]: unknown;
};

export type ShelfItem = {
  id: string;
  shelf: string;
  book: ShelfBookSummary;
  position?: number | null;
  added_by?: ShelfOwnerUserSummary | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

export type PaginatedShelfResponse = PaginatedResponse<Shelf>;
export type PaginatedShelfItemResponse = PaginatedResponse<ShelfItem>;

