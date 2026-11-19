/**
 * How much of the list is marked, Gmail-style, for the "mark this page" box:
 * - `none`: nothing on the page;
 * - `some`: part of the page;
 * - `page`: the whole page, but not everything in the filter;
 * - `every`: everything in the filter (the page included).
 */
export type PageMark = 'none' | 'some' | 'page' | 'every';

/**
 * Which accounts are marked for unfollow. Marks survive filter changes, but
 * only marked accounts that are visible under the current filter count: what
 * the confirmation lists is always a subset of what the list shows.
 */
export class Selection {
  private readonly marked = new Set<string>();

  has(did: string): boolean {
    return this.marked.has(did);
  }

  set(did: string, on: boolean): void {
    if (on) this.marked.add(did);
    else this.marked.delete(did);
  }

  toggle(did: string): void {
    this.set(did, !this.marked.has(did));
  }

  /** Marks every account in `visible` ("all in the filter"). */
  markAll(visible: Iterable<string>): void {
    for (const did of visible) this.marked.add(did);
  }

  clear(): void {
    this.marked.clear();
  }

  /** Forgets accounts that are gone, e.g. after they were unfollowed. */
  forget(dids: Iterable<string>): void {
    for (const did of dids) this.marked.delete(did);
  }

  /** The marked accounts among `visible`, in `visible` order. */
  pick(visible: readonly string[]): string[] {
    return visible.filter((did) => this.marked.has(did));
  }

  /** True when every account in `visible` (and at least one) is marked. */
  coversAll(visible: readonly string[]): boolean {
    return visible.length > 0 && visible.every((did) => this.marked.has(did));
  }

  /** `page` is the slice on screen, `all` every account in the filter. */
  pageMark(page: readonly string[], all: readonly string[]): PageMark {
    if (this.coversAll(all)) return 'every';
    const marked = this.pick(page).length;
    if (marked === 0) return 'none';
    return marked === page.length ? 'page' : 'some';
  }
}
