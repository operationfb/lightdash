import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import rehypeExternalLinks from 'rehype-external-links';
import LazyToastMarkdown from './LazyToastMarkdown';

// The global test setup replaces the previewer with a plain-text stand-in;
// this one also records what it was given.
const previewProps = vi.hoisted(() => ({
    current: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@uiw/react-markdown-preview', () => ({
    default: (props: Record<string, unknown>) => {
        previewProps.current = props;
        return <div data-testid="markdown-preview">{String(props.source)}</div>;
    },
}));

const renderToastMarkdown = (source: string) =>
    render(
        <MantineProvider env="test">
            <LazyToastMarkdown source={source} />
        </MantineProvider>,
    );

describe('LazyToastMarkdown', () => {
    beforeEach(() => {
        previewProps.current = undefined;
    });

    it('shows the text as it is while the previewer loads', () => {
        renderToastMarkdown('Saved **chart**');

        expect(screen.getByText('Saved **chart**')).toBeTruthy();
    });

    it('hands the text to the previewer, with links opening in a new tab', async () => {
        renderToastMarkdown('Saved **chart**');

        const preview = await screen.findByTestId('markdown-preview');
        expect(preview.textContent).toBe('Saved **chart**');
        expect(previewProps.current?.rehypePlugins).toEqual([
            [rehypeExternalLinks, { target: '_blank' }],
        ]);
    });
});
