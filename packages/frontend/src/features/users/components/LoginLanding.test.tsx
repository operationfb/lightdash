import { useForm } from '@mantine/form';
import { screen } from '@testing-library/react';
import { type FC } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type LoginParams } from '../hooks/useLogin';
import { LoginForm } from './LoginLanding';

const LoginFormHarness: FC = () => {
    const form = useForm<LoginParams>({
        initialValues: { email: '', password: '' },
    });

    return (
        <LoginForm
            alternativeLoginIntent={undefined}
            availability={{ email: true, emailOtp: false }}
            form={form}
            formStatus="idle"
            formStage="precheck"
            lastUsedSsoProvider={undefined}
            layout="new"
            loginHint={undefined}
            mobileLoginIntent="local"
            onClearEmail={() => {}}
            onEmailOtpSuccess={() => {}}
            onSubmit={() => {}}
            preCheckEmail={undefined}
            redirectUrl="/"
            signupPath={null}
            signupUrl="/register"
            ssoOptions={[]}
        />
    );
};

describe('LoginForm work email input', () => {
    it('does not let iOS auto-capitalise, autocorrect, or spellcheck the address', () => {
        renderWithProviders(<LoginFormHarness />);

        const emailInput = screen.getByRole('textbox', {
            name: /work email/i,
        });

        expect(emailInput).toHaveAttribute('type', 'email');
        expect(emailInput).toHaveAttribute('inputmode', 'email');
        expect(emailInput).toHaveAttribute('autocapitalize', 'none');
        expect(emailInput).toHaveAttribute('autocorrect', 'off');
        expect(emailInput).toHaveAttribute('spellcheck', 'false');
    });
});

// KONTALA: `redirect` is a router path, and "Continue with SSO" is a real
// anchor back to the server's authorize endpoint. Served under /analytics, the
// bare /api/v1/oauth/authorize reached the API of the app sharing the origin.
describe('LoginForm alternative login intent', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    const AlternativeIntentHarness: FC = () => {
        const form = useForm<LoginParams>({
            initialValues: { email: '', password: '' },
        });

        return (
            <LoginForm
                alternativeLoginIntent="sso"
                availability={{ email: true, emailOtp: false }}
                form={form}
                formStatus="idle"
                formStage="precheck"
                lastUsedSsoProvider={undefined}
                layout="new"
                loginHint={undefined}
                mobileLoginIntent="local"
                onClearEmail={() => {}}
                onEmailOtpSuccess={() => {}}
                onSubmit={() => {}}
                preCheckEmail={undefined}
                redirectUrl="/api/v1/oauth/authorize?client_id=mobile"
                signupPath={null}
                signupUrl="/register"
                ssoOptions={[]}
            />
        );
    };

    it('links back to the authorize endpoint under the base path', () => {
        vi.stubEnv('BASE_URL', '/analytics/');

        renderWithProviders(<AlternativeIntentHarness />);

        expect(
            screen.getByRole('link', { name: /continue with sso/i }),
        ).toHaveAttribute(
            'href',
            '/analytics/api/v1/oauth/authorize?client_id=mobile&mobile_login_intent=sso',
        );
    });
});
