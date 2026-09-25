import { Box } from '@mantine/core';
import { lazy, Suspense, type ComponentProps, type FC } from 'react';

// KONTALA: the markdown previewer and its plugins are ~360 KB gzip, and the
// toaster, which every page loads, imported them directly, which put them all
// in the entry bundle. They now load the first time a toast renders markdown;
// until then the text shows as it is.
const ToastMarkdown = lazy(() => import('./ToastMarkdown'));

const LazyToastMarkdown: FC<ComponentProps<typeof ToastMarkdown>> = (props) => (
    <Suspense fallback={<Box className={props.className}>{props.source}</Box>}>
        <ToastMarkdown {...props} />
    </Suspense>
);

export default LazyToastMarkdown;
