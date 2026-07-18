import type { SecondPassClient } from "@secondpass/client";
import { LibraryScopeSelect } from "./LibraryScopeSelect";
import { useLibraryScopeOptions } from "./useLibraryScopeOptions";

type Props = { spl: SecondPassClient; groupId?: string; onChange: (groupId?: string) => void };

export function LibraryScopeControl({ spl, groupId, onChange }: Props) {
  const options = useLibraryScopeOptions(spl);
  return <LibraryScopeSelect {...options} groupId={groupId} onChange={onChange} />;
}
