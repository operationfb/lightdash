import { fireEvent } from '@testing-library/react';

// jsdom cannot follow links, so cancel the default action after the page handles the
// click. Returns false when the page itself prevented it, as fireEvent.click would.
export const clickLinkWithoutNavigation = (
    link: Element,
    init?: MouseEventInit,
): boolean => {
    let leftToBrowser = false;
    const cancelNavigation = (event: MouseEvent) => {
        leftToBrowser = !event.defaultPrevented;
        event.preventDefault();
    };
    window.addEventListener('click', cancelNavigation);
    try {
        fireEvent.click(link, init);
    } finally {
        window.removeEventListener('click', cancelNavigation);
    }
    return leftToBrowser;
};
