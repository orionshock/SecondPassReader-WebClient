import { useEffect } from "react";
import type { SecondPassClient } from "@secondpass/client";
import { LibraryScopeSelect } from "./LibraryScope.Select";
import { useLibraryScopeOptions } from "./LibraryScopeOptions.Controller";

type Props = {
  spl: SecondPassClient;
  groupId?: string;
  onChange: (groupId?: string) => void;
  onSelectedNameChange?: (name?: string) => void;
};

export function LibraryScopeControl({ spl, groupId, onChange, onSelectedNameChange }: Props) {
  const options = useLibraryScopeOptions(spl);
  const selectedName = groupId ? options.groups.find((group) => String(group.id) === groupId)?.name : undefined;

  useEffect(() => {
    onSelectedNameChange?.(selectedName);
  }, [onSelectedNameChange, selectedName]);

  return <LibraryScopeSelect {...options} groupId={groupId} onChange={onChange} />;
}
