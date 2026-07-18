import { OrderingControl, type OrderingOption } from "../../../components/OrderingControl";
import type { LibraryBooksView } from "../../../storage/libraryBooksView";
import { BookViewModeToggle } from "../display/BookViewModeToggle";
import type { LibraryBookOrdering, LibraryEntityOrdering } from "../route/libraryRouteState";

type Props =
  | {
      kind: "books";
      options: Array<OrderingOption<LibraryBookOrdering>>;
      ordering: LibraryBookOrdering;
      viewMode: LibraryBooksView;
      onOrderingChange: (ordering: LibraryBookOrdering) => void;
      onViewChange: (viewMode: LibraryBooksView) => void;
    }
  | {
      kind: "entity";
      options: Array<OrderingOption<LibraryEntityOrdering>>;
      ordering: LibraryEntityOrdering;
      ariaLabel: string;
      onOrderingChange: (ordering: LibraryEntityOrdering) => void;
    }
  | { kind: "none" };

export function LibrarySortViewControls(props: Props) {
  if (props.kind === "none") return null;
  if (props.kind === "books") {
    return (
      <>
        <OrderingControl options={props.options} value={props.ordering} onChange={props.onOrderingChange} ariaLabel="Sort books" />
        <BookViewModeToggle viewMode={props.viewMode} onChange={props.onViewChange} />
      </>
    );
  }
  return <OrderingControl options={props.options} value={props.ordering} onChange={props.onOrderingChange} ariaLabel={props.ariaLabel} />;
}
