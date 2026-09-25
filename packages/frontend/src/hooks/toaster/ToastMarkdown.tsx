import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';

type Props = {
    className?: string;
    source: string;
};

const ToastMarkdown: FC<Props> = ({ className, source }) => (
    <MarkdownPreview
        className={className}
        source={source}
        rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
    />
);

export default ToastMarkdown;
