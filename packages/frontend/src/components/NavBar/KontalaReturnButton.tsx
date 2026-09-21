import { Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { returnToKontala, takeReturnTo } from '../../kontala/handover';
import MantineIcon from '../common/MantineIcon';

/**
 * KONTALA: takes the reader back to the page they crossed over from.
 *
 * ⚠ READ ONCE, ON FIRST RENDER. takeReturnTo CONSUMES the payload, so whichever
 * page load reads it takes it from every later one. Two things have to hold at
 * once, and they pull in opposite directions.
 *
 * It must not be read by a page load that is not the destination. A crossing
 * whose reader is not yet signed in to this build passes through the login page
 * first, and this module is in the entry chunk - Routes.tsx imports the nav bar
 * statically - so reading at module scope consumed the payload there, during a
 * page the reader never even sees. By the time single sign-on landed them here
 * there was nothing left to find and the button simply never appeared.
 * Rendering is what separates the two: this component lives inside the
 * authenticated nav bar, so its first render IS the arrival.
 *
 * And it must not be read again after that, or the button would vanish on the
 * next re-render - immediately under StrictMode, which renders everything
 * twice. So the first answer is remembered for the life of the document, which
 * is the same lifetime as the crossing.
 *
 * Absent when this was not a crossing (somebody opened analytics directly, or
 * the payload was stale), and the button then renders nothing rather than
 * offering a way back to somewhere nobody came from.
 */
let cachedReturnTo: string | null | undefined;
const captureReturnTo = (): string | null => {
    if (cachedReturnTo === undefined) cachedReturnTo = takeReturnTo();
    return cachedReturnTo;
};

const KontalaReturnButton: FC<{ withLabel?: boolean }> = ({ withLabel }) => {
    const capturedReturnTo = captureReturnTo();
    if (!capturedReturnTo) return null;

    return (
        <Button
            variant="default"
            size="xs"
            leftSection={<MantineIcon icon={IconArrowLeft} />}
            onClick={() => returnToKontala(capturedReturnTo)}
        >
            {withLabel ? 'Back to Kontala' : 'Back'}
        </Button>
    );
};

export default KontalaReturnButton;
