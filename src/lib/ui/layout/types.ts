export interface Crumb {
  label: string;
  /** Absolute href (use `link()` from `$lib/paths`); omitted on the last item. */
  href?: string;
}
