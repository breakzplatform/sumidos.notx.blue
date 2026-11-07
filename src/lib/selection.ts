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
}
