/**
 * KONTALA: the one endpoint this instance exposes to Kontala Marketing.
 *
 * Kontala owns who its customers are; this instance owns what they can see. A
 * crossing between the two has to reconcile the first into the second, and
 * this is where that happens: make sure the person exists, make sure they are
 * in the right organization, and make sure their role there matches the one
 * their Kontala membership grants.
 *
 * ⚠ IT IS CALLED DURING THE TOKEN EXCHANGE, before this instance has ever seen
 * the person. That ordering is the whole design. By the time the single
 * sign-on callback runs loginWithOpenId, the user and the membership already
 * exist, so the login LINKS an identity to a known account (requires
 * AUTH_ENABLE_OIDC_TO_EMAIL_LINKING=true) rather than provisioning one - and
 * loginToOrganization has an organization to choose.
 *
 * Why this exists rather than Kontala calling the stock invite and org-user
 * routes: those authenticate as an admin OF THE TARGET ORGANIZATION, which
 * would mean Kontala storing one admin token per customer. One instance-wide
 * secret against one endpoint is a smaller thing to hold and a smaller thing
 * to leak.
 */
import {
    OrganizationMemberRole,
    ParameterError,
    type CreateUserWithRole,
} from '@lightdash/common';
import { timingSafeEqual } from 'crypto';
import express from 'express';
import type { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import type { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import type { EmailModel } from '../models/EmailModel';
import type { OrganizationMemberProfileModel } from '../models/OrganizationMemberProfileModel';
import type { UserModel } from '../models/UserModel';

export const KONTALA_ADMIN_HEADER = 'x-kontala-admin-secret';

/** The description every minted deploy token carries, so one is recognisable. */
export const DEPLOY_TOKEN_DESCRIPTION = 'Kontala semantic-layer deploy';

/**
 * KONTALA: the identity a tenant's semantic-layer deploy runs as.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, which is exactly
 * why it is used: this address can never receive mail, so it can never become
 * a password reset or an invitation, and the account is reachable only through
 * the token minted below. Kontala's single sign-on cannot reach it either,
 * because no Kontala identity ever carries this address.
 *
 * The organization uuid sits in the local part because `emails.email` is
 * citext UNIQUE instance-wide: one fixed address could serve only one customer.
 */
export const deployUserEmail = (organizationUuid: string): string =>
    `analytics-deploy+${organizationUuid}@kontala.invalid`;

type KontalaRouterDependencies = {
    lightdashConfig: LightdashConfig;
    userModel: UserModel;
    emailModel: EmailModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    personalAccessTokenModel: PersonalAccessTokenModel;
};

type MemberBody = {
    organizationUuid?: unknown;
    email?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    role?: unknown;
};

/** Constant time, so the secret cannot be recovered a character at a time. */
const secretMatches = (given: string, expected: string): boolean => {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
};

const asString = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ParameterError(`${field} is required`);
    }
    return value.trim();
};

const asRole = (value: unknown): OrganizationMemberRole => {
    const roles = Object.values(OrganizationMemberRole) as string[];
    if (typeof value !== 'string' || !roles.includes(value)) {
        throw new ParameterError(
            `role must be one of ${roles.join(', ')}, got ${String(value)}`,
        );
    }
    return value as OrganizationMemberRole;
};

export const kontalaRouter = ({
    lightdashConfig,
    userModel,
    emailModel,
    organizationMemberProfileModel,
    personalAccessTokenModel,
}: KontalaRouterDependencies) => {
    const router = express.Router();

    router.use((req, res, next) => {
        const expected = lightdashConfig.kontala.adminSecret;
        // Unset means the integration is not configured, and an endpoint that
        // can place anyone in any organization must not fall open.
        if (!expected) {
            res.status(404).json({ status: 'error' });
            return;
        }
        const given = req.header(KONTALA_ADMIN_HEADER);
        if (!given || !secretMatches(given, expected)) {
            Logger.warn('kontala: member request with a bad or missing secret');
            res.status(401).json({ status: 'error' });
            return;
        }
        next();
    });

    /**
     * Idempotent by construction, because Kontala calls it on every crossing:
     * creates what is missing, corrects what has drifted, and does nothing
     * when everything already agrees.
     */
    router.post('/members', express.json(), async (req, res, next) => {
        try {
            const body = req.body as MemberBody;
            const organizationUuid = asString(
                body.organizationUuid,
                'organizationUuid',
            );
            const email = asString(body.email, 'email').toLowerCase();
            const role = asRole(body.role);
            const firstName = asString(body.firstName || '-', 'firstName');
            const lastName = asString(body.lastName || '-', 'lastName');

            const existing = await userModel.findUserByEmail(email);

            if (!existing) {
                // isActive, and setup complete: this person signs in through
                // Kontala, so there is no onboarding of theirs left to do here.
                const created = await userModel.createPendingUser(
                    organizationUuid,
                    {
                        email,
                        firstName,
                        lastName,
                        role,
                    } as CreateUserWithRole,
                    true,
                    true,
                );
                // ⚠ REQUIRED, NOT COSMETIC. The single sign-on will only link
                // an identity to an existing account whose primary email is
                // verified; without this the first login fails closed with a
                // collision error instead. Kontala only ever sends addresses
                // it has itself proven, through an emailed invitation.
                await emailModel.verifyUserEmailIfExists(
                    created.userUuid,
                    email,
                );
                res.status(201).json({ status: 'ok', results: 'created' });
                return;
            }

            const member = await organizationMemberProfileModel
                .getOrganizationMemberByUuid(
                    organizationUuid,
                    existing.userUuid,
                )
                .catch(() => undefined);

            if (!member) {
                await organizationMemberProfileModel.createOrganizationMembershipByUuid(
                    {
                        organizationUuid,
                        userUuid: existing.userUuid,
                        role,
                    },
                );
                res.status(201).json({ status: 'ok', results: 'attached' });
                return;
            }

            if (member.role !== role) {
                await organizationMemberProfileModel.updateOrganizationMember(
                    organizationUuid,
                    existing.userUuid,
                    { role },
                );
                res.status(200).json({ status: 'ok', results: 'role-updated' });
                return;
            }

            res.status(200).json({ status: 'ok', results: 'unchanged' });
        } catch (error) {
            next(error);
        }
    });

    /**
     * Mints the personal access token a tenant's semantic-layer deploy runs
     * with, and returns it ONCE. Kontala seals it and keeps it.
     *
     * ⚠ WHY A TOKEN AT ALL, WHEN KONTALA ALREADY WRITES THIS DATABASE. The
     * deploy is `lightdash deploy`, and the CLI compiles the model client-side
     * before uploading it. Nothing short of running the CLI produces those
     * explores, and the CLI authenticates with a personal access token and
     * nothing else. So the token is the one artefact that cannot be written
     * directly.
     *
     * ⚠ WHY NOT ONE TOKEN FOR EVERY ORGANIZATION. A personal access token has
     * nowhere to carry an organization: findSessionUserByPersonalAccessToken
     * joins organization_memberships and takes the FIRST row with no ORDER BY,
     * so a user in several organizations resolves to an arbitrary one. A
     * deploy authorised against an arbitrary organization is a cross-tenant
     * write that reports success, so the token is per organization and its
     * user belongs to exactly one.
     *
     * ⚠ ADMIN IS THE LEAST ROLE THAT CAN DO THIS, not a convenience.
     * `manage:DeployProject` is unconditional only in the admin block;
     * developer holds it just for PREVIEW projects it created itself
     * (organizationMemberAbility.ts). A tenant's project is neither.
     *
     * Idempotent in the way the rest of provisioning is: the service user is
     * created once and reused, and every previous token of its own is deleted
     * before the new one is minted, so re-running rotates rather than
     * accumulates and a copy that leaked stops working.
     */
    router.post('/deploy-tokens', express.json(), async (req, res, next) => {
        try {
            if (!lightdashConfig.auth.pat.enabled) {
                // DISABLE_PAT turns off the only credential the CLI accepts,
                // so this cannot be worked around here and should not look
                // like a transient failure.
                res.status(409).json({
                    status: 'error',
                    results:
                        'personal access tokens are disabled on this instance',
                });
                return;
            }
            const body = req.body as { organizationUuid?: unknown };
            const organizationUuid = asString(
                body.organizationUuid,
                'organizationUuid',
            );
            const email = deployUserEmail(organizationUuid);

            const existing = await userModel.findUserByEmail(email);
            let userUuid: string;
            if (existing) {
                userUuid = existing.userUuid;
                // The membership is re-asserted rather than assumed: an
                // operator can remove a member in the UI, and a deploy user
                // without its organization would mint a token that authorises
                // nothing.
                const member = await organizationMemberProfileModel
                    .getOrganizationMemberByUuid(organizationUuid, userUuid)
                    .catch(() => undefined);
                if (!member) {
                    await organizationMemberProfileModel.createOrganizationMembershipByUuid(
                        {
                            organizationUuid,
                            userUuid,
                            role: OrganizationMemberRole.ADMIN,
                        },
                    );
                } else if (member.role !== OrganizationMemberRole.ADMIN) {
                    await organizationMemberProfileModel.updateOrganizationMember(
                        organizationUuid,
                        userUuid,
                        { role: OrganizationMemberRole.ADMIN },
                    );
                }
            } else {
                const created = await userModel.createPendingUser(
                    organizationUuid,
                    {
                        email,
                        firstName: 'Kontala',
                        lastName: 'deploy',
                        role: OrganizationMemberRole.ADMIN,
                    } as CreateUserWithRole,
                    true,
                    true,
                );
                userUuid = created.userUuid;
                // Same reason as /members: an unverified primary email leaves
                // the account in a half-created state. Nothing is ever sent
                // to it - the address is unroutable by construction.
                await emailModel.verifyUserEmailIfExists(userUuid, email);
            }

            const sessionUser = await userModel.findSessionUserByUUID(userUuid);
            await personalAccessTokenModel.deleteAllTokensForUser(
                sessionUser.userId,
            );
            const created = await personalAccessTokenModel.create(sessionUser, {
                // No expiry, because Kontala keeps this one: an expiry would
                // make a stored credential stop working between provisioning
                // runs, with the failure landing on a deploy rather than
                // anywhere it could be noticed. Rotation is re-running create,
                // which deletes the old one above.
                expiresAt: null,
                description: DEPLOY_TOKEN_DESCRIPTION,
                autoGenerated: true,
            });

            Logger.info(
                `kontala: minted a deploy token for organization ${organizationUuid}`,
            );
            // 201 and the token exactly once. It is never readable again:
            // only its hash is stored.
            res.status(201).json({
                status: 'ok',
                results: {
                    token: created.token,
                    userUuid,
                    tokenUuid: created.uuid,
                },
            });
        } catch (error) {
            next(error);
        }
    });

    return router;
};
