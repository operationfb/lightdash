// jsdom has no layout and, unlike Element, gives Range no rect methods at all;
// ProseMirror measures the selection with them when scrolling it into view.
function mockRangeClientRects() {
    window.Range.prototype.getBoundingClientRect = () => new DOMRect();
    window.Range.prototype.getClientRects = () =>
        Object.assign([], { item: () => null });
}

export default mockRangeClientRects;
