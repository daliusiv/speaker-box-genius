/**
 * Keep the app alive when the browser translates the page.
 *
 * Page translators (Firefox Translations, Google Translate in Chrome) swap text nodes for new
 * ones or wrap them in `<font>`. React still holds the old nodes, so its next
 * `insertBefore(node, oldText)` or `removeChild(oldText)` throws "… is not a child of this node",
 * and an error thrown while React commits blanks the whole app (PostHog issue on the Build tab,
 * Firefox in German, #406). This is React's long-standing translation problem
 * (facebook/react#11538); the guard below is the usual way round it: when the node React points
 * at has already been moved out by someone else, append instead of inserting, and skip the
 * removal. Normal (untranslated) pages never take these branches.
 */
export function guardDomForTranslation(proto: Pick<Node, "insertBefore" | "removeChild"> = Node.prototype): void {
  const p = proto as Node & { __sbgGuarded?: boolean };
  if (p.__sbgGuarded) return;
  p.__sbgGuarded = true;
  const insertBefore = p.insertBefore;
  const removeChild = p.removeChild;
  p.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T {
    if (child && child.parentNode !== this) return this.appendChild(node);
    return insertBefore.call(this, node, child) as T;
  };
  p.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
}
