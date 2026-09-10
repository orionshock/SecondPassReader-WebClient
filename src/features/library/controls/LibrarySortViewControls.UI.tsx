import { OrderingControl, type OrderingOption } from "../../../components/OrderingControl.UI";
import type { LibraryBooksView } from "../../../storage/LibraryBooksView.Store";
import { BookViewModeToggle } from "../display/BookViewModeControl.UI";
import type { LibraryBookOrdering, LibraryEntityOrdering } from "../route/LibraryRoute.State";

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
