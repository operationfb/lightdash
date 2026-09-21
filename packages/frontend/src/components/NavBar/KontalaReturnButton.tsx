import { Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { returnToKontala, takeReturnTo } from '../../kontala/handover';
import MantineIcon from '../common/MantineIcon';

/**
 * KONTALA: takes the reader back to the page they crossed over from.
 *
 * ⚠ READ AT MODULE SCOPE, ON PURPOSE. takeReturnTo CONSUMES the payload, so it
 * must happen exactly once per page load. A hook would run again on a remount,
 * and under StrictMode twice on the first one, and the second read would find
 * nothing - leaving the button to disappear the moment anything re-rendered it.
 * Module scope is once per document, which is the same lifetime as the
 * crossing itself.
 *
 * Absent when this was not a crossing (somebody opened analytics directly, or
 * the payload was stale), and the button then renders nothing rather than
 * offering a way back to somewhere nobody came from.
 */
const capturedReturnTo = takeReturnTo();

const KontalaReturnButton: FC<{ withLabel?: boolean }> = ({ withLabel }) => {
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
