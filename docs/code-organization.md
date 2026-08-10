# Code Organization

Operational rules for agents live in [../AGENTS.md](../AGENTS.md). This doc explains the project's current organization conventions for human readers.

## General Shape

- Keep feature code feature-local.
- Prefer explicit boundaries over broad shared utility modules.
- Components render UI.
- Hooks own state and lifecycle.
- Helpers own pure mapping, formatting, sorting, and parsing.
- Adapters translate external API/schema/renderer shapes.
- Orchestrators wire behavior together.

## File Size Guidance

These are soft heuristics:

- Around 100 lines: comfortable.
- 150-220 lines: usually fine for UI/components.
- 250+ lines: look for obvious sub-responsibilities.
- 350+ lines: split unless the file is truly orchestration/glue.

Do not split just to reduce line count. Split when the extracted file has a clear name and stable responsibility.

## Naming

- Reading component files use PascalCase role suffixes, such as `ReaderBookSearch.Drawer.tsx`.
- Reading hooks and helpers use PascalCase role owners, such as `ReaderBookSearch.Controller.ts` and `ReaderBookSearch.Labels.ts`.
- Prefer folders over underscore grouping.
- Avoid generic `utils` dumping grounds.

## Feature-Local Examples

Reader search:

```text
src/features/reader/shell/bookSearch/
  ReaderBookSearch.Drawer.tsx
  ReaderBookSearch.InputBar.tsx
  ReaderBookSearch.ResultList.tsx
  ReaderBookSearch.ResultRow.tsx
  ReaderBookSearch.Controller.ts
  ReaderBookSearch.Labels.ts
```

Reader imports:

```text
src/features/reader/imports/
  ReaderImportDrawer.tsx
  ReaderImportModal.tsx
  ReaderImportRowItem.tsx
  useReaderImportJob.ts
  useReaderImportActivation.ts
  glaspCsvParser.ts
  readerImportSearch.ts
```

## Lifecycle-Sensitive Code

Be careful extracting around:

- `ReadingShell.tsx`
- `EpubTsBookEngine.ts`
- reader engine init effects
- shell command handling
- staged selection callbacks
- renderer mark painting

Chrome UI state should not recreate the EPUB engine.
