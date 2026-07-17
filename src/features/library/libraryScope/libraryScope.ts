export function getEffectiveLibraryGroupId(groupId: string | undefined, advancedGroupsEnabled: boolean): string | undefined {
  if (!advancedGroupsEnabled) return undefined;
  return groupId?.trim() || undefined;
}
