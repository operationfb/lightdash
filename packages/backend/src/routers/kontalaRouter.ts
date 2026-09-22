/**
 * KONTALA: what this instance exposes to Kontala Marketing, and nothing else.
 *
 * Three endpoints, all authorised by one instance-wide secret.
 *
 * POST /members reconciles people. Kontala owns who its customers are; this
 * instance owns what they can see, and a crossing between the two has to turn
 * the first into the second: make sure the person exists, make sure they are
 * in the right organization, and make sure their role there matches the one
 * their Kontala membership grants.
 *
 * PUT /projects/:projectUuid/semantic-layer deploys a tenant's model. It
 * exists so that provisioning a customer needs no Lightdash CLI, and therefore
 * no Node, no version pin against this instance and no personal access token.
 *
 * PUT /projects/:projectUuid/content deploys the charts and dashboards built on
 * that model, for the same reason and through the same secret. See
 * routers/kontala/content.ts, and in particular deployActor: the CASL principal
 * those upserts run as exists in memory for the length of the request and is
 * never written down.
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
    calculateExploreWarningReport,
    ContentAsCodeType,
    OrganizationMemberRole,
    ParameterError,
    type CreateUserWithRole,
    type Explore,
    type ExploreError,
    type ProjectDefaults,
} from '@lightdash/common';
import { timingSafeEqual } from 'crypto';
import express from 'express';
import type { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import type { EmailModel } from '../models/EmailModel';
import type { OrganizationMemberProfileModel } from '../models/OrganizationMemberProfileModel';
import type { ProjectModel } from '../models/ProjectModel/ProjectModel';
import type { UserModel } from '../models/UserModel';
import type { CoderService } from '../services/CoderService/CoderService';
import {
    deployActor,
    parsePostedContent,
    unresolvedChartSlugs,
    type ParsedDocument,
} from './kontala/content';
import {
    compilePostedSemanticLayer,
    parsePostedModels,
} from './kontala/semanticLayer';

export const KONTALA_ADMIN_HEADER = 'x-kontala-admin-secret';

/**
 * KONTALA: the identity a tenant's semantic-layer deploy is ATTRIBUTED to.
 *
 * It is no longer a credential. The deploy used to run as this user through a
 * personal access token, because only the CLI could produce explores and the
 * CLI authenticates with nothing else. The semantic-layer endpoint below
 * compiles them here instead, authorised by the instance-wide admin secret.
 * What survives is attribution: saveExploresToCacheAndIndexCatalog writes a
 * project_compile_log row and indexes the catalog, and both want a user uuid.
 *
 * So this account deliberately holds NO membership and NO token. It is a
 * foreign key target and nothing more, which is why nothing below grants it a
 * role: the admin membership existed only to satisfy a CASL check that no
 * longer runs, and an unused admin of a customer's organization is exactly the
 * kind of standing privilege worth not having.
 *
 * `.invalid` is reserved by RFC 2606 and resolves nowhere, which is exactly
 * why it is used: this address can never receive mail, so it can never become
 * a password reset or an invitation. Kontala's single sign-on cannot reach it
 * either, because no Kontala identity ever carries this address.
 *
 * The organization uuid sits in the local part because `emails.email` is
 * citext UNIQUE instance-wide: one fixed address could serve only one customer.
 */
export const deployUserEmail = (organizationUuid: string): string =>
    `analytics-deploy+${organizationUuid}@kontala.invalid`;

/**
 * Declared structurally, exactly as DeployService declares the same dependency,
 * so this router needs the one method it calls rather than the whole service.
 */
type ProjectServiceInterface = {
    saveExploresToCacheAndIndexCatalog: (args: {
        userUuid: string;
        projectUuid: string;
        explores: (Explore | ExploreError)[];
        compilationSource: 'cli_deploy' | 'refresh_dbt' | 'create_project';
        jobUuid?: string | null;
        requestMethod?: string | null;
        projectConfigDefaults?: ProjectDefaults;
        cliVersion?: string | null;
        complete?: boolean;
        dbtModelNames?: string[];
    }) => Promise<string>;
};

/**
 * The three content upserts, declared structurally for the same reason
 * ProjectServiceInterface above is: this router needs the methods it calls
 * rather than the whole of CoderService, and saying so keeps the test able to
 * stub three functions instead of a class.
 */
type CoderServiceInterface = Pick<
    CoderService,
    'upsertChart' | 'upsertSqlChart' | 'upsertDashboard'
>;

type KontalaRouterDependencies = {
    lightdashConfig: LightdashConfig;
    userModel: UserModel;
    emailModel: EmailModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    projectModel: ProjectModel;
    projectService: ProjectServiceInterface;
    coderService: CoderServiceInterface;
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
    projectModel,
    projectService,
    coderService,
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
     * Finds or creates the attribution account for an organization's deploys.
     *
     * createUser, NOT createPendingUser: the latter needs an organization and
     * creates a membership in it, and this account must hold none. What is
     * left is a row in `users` that `project_compile_log.user_uuid` and the
     * catalog index can point at, with no password, no membership and an
     * address that resolves nowhere - so there is nothing to sign in as.
     *
     * An account that already exists is returned untouched. Deploy users
     * created before this endpoint still carry the admin membership the old
     * token needed; removing those is a one-off cleanup on the instance, not
     * something to do silently on the next deploy.
     */
    const ensureDeployUser = async (
        organizationUuid: string,
    ): Promise<string> => {
        const email = deployUserEmail(organizationUuid);
        const existing = await userModel.findUserByEmail(email);
        if (existing) {
            return existing.userUuid;
        }
        const created = await userModel.createUser(
            { firstName: 'Kontala', lastName: 'deploy', email },
            true,
            true,
        );
        // Same reason as /members: an unverified primary email leaves the
        // account half-created. Nothing is ever sent to it, and nothing signs
        // in as it - the address is unroutable by construction.
        await emailModel.verifyUserEmailIfExists(created.userUuid, email);
        Logger.info(
            `kontala: created the deploy attribution user for organization ${organizationUuid}`,
        );
        return created.userUuid;
    };

    /**
     * Replaces a project's semantic layer with the posted Lightdash models.
     *
     * PUT, and named after upstream's own PUT /projects/:uuid/explores,
     * because that is what it is: the same write, authenticated by the
     * instance-wide admin secret instead of by a personal access token.
     * Idempotent by construction, which is what lets Kontala re-run
     * provisioning as its repair for a project whose model has moved on.
     *
     * ⚠ THIS IS WHAT REPLACED THE LIGHTDASH CLI. The CLI's one irreplaceable
     * job was compiling the model client-side; the compiler is MIT and lives
     * in @lightdash/common, so it runs here instead - see
     * routers/kontala/semanticLayer.ts. With the CLI went Node on the caller's
     * machine, the version pin binding CLI to instance, the loopback proxy
     * that put this deployment's base path back underneath a client that
     * resolves /api/v1 against the origin, and the personal access token this
     * router used to mint.
     *
     * ⚠ COMPILE FIRST, PERSIST SECOND, NEVER HALF OF EACH. Everything that can
     * fail - the schema, the YAML, a warehouse disagreement, a metric missing
     * its own sql - fails before saveExploresToCacheAndIndexCatalog is
     * reached. So a request either replaces the whole semantic layer or
     * changes nothing, which `lightdash deploy` could not promise: it uploads
     * and then reports what went wrong.
     */
    router.put(
        '/projects/:projectUuid/semantic-layer',
        // The rendered model is ~15KB and express.json defaults to 100KB.
        // Raised here rather than met as a 413 the day a second model lands.
        express.json({ limit: '2mb' }),
        async (req, res, next) => {
            try {
                const { projectUuid } = req.params;
                const body = req.body as { models?: unknown; config?: unknown };
                if (
                    body.config !== undefined &&
                    typeof body.config !== 'string'
                ) {
                    throw new ParameterError('config must be a string');
                }
                // Parsed before the project is read, so a malformed payload
                // costs no database round trip.
                const models = parsePostedModels(body.models);

                // get(), not getWithSensitiveFields(): startOfWeek and
                // disableTimestampConversion are not sensitive credential
                // fields, so this returns everything the compiler needs while
                // keeping decrypted warehouse secrets out of a router that a
                // shared secret opens. It throws NotFoundError on an unknown
                // uuid, which is the 404 wanted here.
                const project = await projectModel.get(projectUuid);

                const explores = await compilePostedSemanticLayer({
                    models,
                    project,
                    config: body.config,
                });

                const userUuid = await ensureDeployUser(
                    project.organizationUuid,
                );

                const catalogIndexJobUuid =
                    await projectService.saveExploresToCacheAndIndexCatalog({
                        userUuid,
                        projectUuid,
                        explores,
                        // A closed upstream union, so ours is not added to it
                        // for the sake of a log label. requestMethod carries
                        // the distinction instead, and is free text.
                        compilationSource: 'cli_deploy',
                        requestMethod: 'kontala',
                        cliVersion: null,
                        jobUuid: null,
                        // ⚠ TRUE, WHERE `lightdash deploy` SENDS FALSE. False
                        // merges into whatever is cached, so a renamed model
                        // leaves its old explore behind for good. Kontala
                        // posts the entire semantic layer every time, so a
                        // replace is both correct and the only way to converge.
                        complete: true,
                    });

                Logger.info(
                    `kontala: deployed ${explores.length} explores to project ${projectUuid}`,
                );
                res.status(200).json({
                    status: 'ok',
                    results: {
                        projectUuid,
                        exploreCount: explores.length,
                        exploreNames: explores.map((explore) => explore.name),
                        warnings: calculateExploreWarningReport({ explores }),
                        catalogIndexJobUuid,
                    },
                });
            } catch (error) {
                next(error);
            }
        },
    );

    /**
     * Replaces a project's Kontala-published charts and dashboards.
     *
     * PUT and idempotent, exactly as the semantic layer is: Kontala posts the
     * whole set on every run, and re-running provisioning is its repair for a
     * project whose dashboards have drifted.
     *
     * ⚠ AN UPSERT IS AUTHORITATIVE AND ALWAYS OVERWRITES. There is no drift
     * guard to reach for - `force` only flips a NO_CHANGES promotion action to
     * UPDATE so a version row is written - so whatever a customer edited on a
     * published chart is gone on the next publish. Kontala publishes into a
     * space of its own for that reason, and the documents say to duplicate
     * rather than to edit. This endpoint does not enforce that; it is a
     * property of where the caller points it.
     */
    router.put(
        '/projects/:projectUuid/content',
        // Thirteen documents with embedded SQL, against express.json's 100KB
        // default. Raised here for the same reason the semantic layer's is,
        // and to the same ceiling so there is one number to remember.
        express.json({ limit: '2mb' }),
        async (req, res, next) => {
            try {
                const { projectUuid } = req.params;
                const body = req.body as {
                    files?: unknown;
                    spaceNames?: unknown;
                    force?: unknown;
                };
                if (
                    body.spaceNames !== undefined &&
                    (typeof body.spaceNames !== 'object' ||
                        body.spaceNames === null ||
                        Array.isArray(body.spaceNames))
                ) {
                    throw new ParameterError(
                        'spaceNames must be an object mapping space slug to display name',
                    );
                }
                if (
                    body.force !== undefined &&
                    typeof body.force !== 'boolean'
                ) {
                    throw new ParameterError('force must be a boolean');
                }
                const spaceNames = (body.spaceNames ?? {}) as Record<
                    string,
                    string
                >;
                const force = body.force === true;

                // Parsed before the project is read, so a malformed payload
                // costs no database round trip. Everything that can fail on the
                // documents themselves has failed by the end of this line.
                const documents = parsePostedContent(body.files);

                const project = await projectModel.get(projectUuid);

                const userUuid = await ensureDeployUser(
                    project.organizationUuid,
                );
                const actor = deployActor({
                    user: await userModel.getUserDetailsByUuid(userUuid),
                    organizationUuid: project.organizationUuid,
                    lightdashConfig,
                });

                // publicSpaceCreate, so the space a document names is created
                // inheriting project permissions: every member of the project
                // can see what Kontala published. Without it a new space is
                // private to its creator, which is an account nobody can sign
                // in as - the dashboards would exist and be invisible.
                const options = {
                    publicSpaceCreate: true,
                    spaceNames,
                    force,
                };

                const written: Array<{
                    path: string;
                    type: string;
                    slug: string;
                }> = [];
                const warnings = unresolvedChartSlugs(documents).map(
                    (slug) =>
                        `No chart with slug "${slug}" is in this payload; a tile referencing it resolves against the project or stays empty`,
                );

                // Sequential, in the order parsePostedContent returned: SQL
                // charts, then charts, then dashboards. Promise.all here would
                // race a dashboard against the charts its tiles name.
                /* eslint-disable no-await-in-loop */
                for (const document of documents) {
                    switch (document.kind) {
                        case ContentAsCodeType.SQL_CHART:
                            await coderService.upsertSqlChart(
                                actor,
                                projectUuid,
                                document.slug,
                                document.doc,
                                undefined,
                                options.publicSpaceCreate,
                                options.force,
                                options.spaceNames,
                            );
                            break;
                        case ContentAsCodeType.CHART:
                            await coderService.upsertChart(
                                actor,
                                projectUuid,
                                document.slug,
                                document.doc,
                                { ...options, filePath: document.path },
                            );
                            break;
                        case ContentAsCodeType.DASHBOARD: {
                            const result = await coderService.upsertDashboard(
                                actor,
                                projectUuid,
                                document.slug,
                                document.doc,
                                { ...options, filePath: document.path },
                            );
                            warnings.push(...(result.warnings ?? []));
                            break;
                        }
                        default:
                            // parsePostedContent refuses anything else, so this
                            // is unreachable rather than defensive. It is here
                            // so adding a content type to UPSERT_ORDER without
                            // adding its upsert fails to compile.
                            throw new ParameterError(
                                `No upsert for content type ${
                                    (document as ParsedDocument).kind
                                }`,
                            );
                    }
                    written.push({
                        path: document.path,
                        type: document.kind,
                        slug: document.slug,
                    });
                }
                /* eslint-enable no-await-in-loop */

                Logger.info(
                    `kontala: published ${written.length} content documents to project ${projectUuid}`,
                );
                res.status(200).json({
                    status: 'ok',
                    results: {
                        projectUuid,
                        // What was actually written, in the order it was
                        // written. The writes are N upserts and not one
                        // transaction, so a failure part-way leaves what came
                        // before it; saying which is more useful than implying
                        // an atomicity this endpoint does not have.
                        written,
                        warnings,
                    },
                });
            } catch (error) {
                next(error);
            }
        },
    );

    return router;
};
