// Column definitions for ResponsiveTable: one description, rendered as a <table> (>= 640px) or as cards.

export interface Column<T> {
  /** Stable id: the sort key and what a `cell` snippet switches on. */
  id: string;
  /** Header text (table) and the default label in a card. */
  header: string;
  /** Tooltip on the header. */
  title?: string;
  align?: 'start' | 'end';
  /** The header is a sort button that calls `onsort(id)` and carries `aria-sort`. */
  sortable?: boolean;
  /** The row's name: a `<th scope="row">` in the table, the card's title. Exactly one column should be. */
  rowHeader?: boolean;
  /** Plain text of the cell (used when the page passes no `cell` snippet, and for the card's sort select). */
  value?: (row: T) => string | number | null | undefined;
  /** The label in a card: `false` for none (the value spans the line). Defaults to `header`. */
  cardLabel?: string | false;
  /** Leave out of the card layout / the table layout. */
  cardHide?: boolean;
  tableHide?: boolean;
  /** Extra CSS class on the cell. */
  class?: string;
}

export interface SortState {
  key: string;
  /** 1 ascending, -1 descending. */
  dir: 1 | -1;
}

/** The breakpoint: exactly 640px, `<= 639px` is narrow (MAIN-RESP-01). */
export const CARD_QUERY = '(min-width: 640px)';
