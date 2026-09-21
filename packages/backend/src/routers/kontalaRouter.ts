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
import type { EmailModel } from '../models/EmailModel';
import type { OrganizationMemberProfileModel } from '../models/OrganizationMemberProfileModel';
import type { UserModel } from '../models/UserModel';

export const KONTALA_ADMIN_HEADER = 'x-kontala-admin-secret';

type KontalaRouterDependencies = {
    lightdashConfig: LightdashConfig;
    userModel: UserModel;
    emailModel: EmailModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
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

    return router;
};
