/**
 * KONTALA: the dashboards and charts a tenant's project is provisioned with.
 *
 * Its sibling semanticLayer.ts deploys the model; this deploys what is built on
 * it. Together they are the whole of a project's contents, so a customer signs
 * in to an Overview dashboard rather than to an explore and a blank page.
 *
 * ⚠ THIS EXISTS BECAUSE KONTALA HOLDS NO LIGHTDASH CREDENTIAL. The stock
 * content-as-code routes sit behind [allowApiKeyAuthentication, isAuthenticated]
 * and want a session or a personal access token. Kontala deliberately has
 * neither: the per-organization token and the admin membership it needed were
 * deleted when provisioning became pure Go, and the account that survives is a
 * foreign key target with no membership and no password. Re-introducing a token
 * to publish a dashboard would restore exactly the standing privilege that was
 * removed on purpose, on every customer's organization, for a write that runs
 * a few times a year.
 *
 * So the same instance-wide secret that authorises the semantic layer authorises
 * this, and the CASL actor the upserts need is built in memory for the length of
 * one already-authorised request - see deployActor below.
 *
 * ⚠ NOTHING HERE IS A NEW WRITE PATH. Every document goes through
 * CoderService's own upsert, which is what the CLI and the stock routes call.
 * This module parses, orders and authorises; it does not know how a chart is
 * stored, and must not learn.
 */
import {
    ContentAsCodeType,
    getUserAbilityBuilder,
    OrganizationMemberRole,
    ParameterError,
    ParseError,
    type ChartAsCode,
    type DashboardAsCode,
    type LightdashUser,
    type SessionUser,
    type SqlChartAsCode,
} from '@lightdash/common';
import yaml from 'js-yaml';
import type { LightdashConfig } from '../../config/parseConfig';

/** One posted file, the same shape semanticLayer.ts takes, for the same reason. */
export type PostedFile = {
    path: string;
    content: string;
};

/**
 * A parsed document, tagged with the upsert it is destined for.
 *
 * `path` is carried through to the upsert's `filePath`, exactly as the model's
 * path becomes an explore's original_file_path: it is what makes a later
 * `lightdash download` produce the tree Kontala posted rather than a diff on
 * every file.
 */
export type ParsedDocument =
    | {
          kind: ContentAsCodeType.SQL_CHART;
          path: string;
          slug: string;
          doc: SqlChartAsCode;
      }
    | {
          kind: ContentAsCodeType.CHART;
          path: string;
          slug: string;
          doc: ChartAsCode;
      }
    | {
          kind: ContentAsCodeType.DASHBOARD;
          path: string;
          slug: string;
          doc: DashboardAsCode;
      };

/**
 * ⚠ SQL CHARTS, THEN CHARTS, THEN DASHBOARDS, AND THE ORDER IS LOAD-BEARING.
 * convertTileWithSlugsToUuids resolves a tile's chartSlug against what is
 * already in the project; a slug it cannot find is saved as a tile with a null
 * chart and a warning, NOT as an error. A dashboard written before its charts
 * therefore succeeds and produces a page of empty tiles.
 */
const UPSERT_ORDER: ContentAsCodeType[] = [
    ContentAsCodeType.SQL_CHART,
    ContentAsCodeType.CHART,
    ContentAsCodeType.DASHBOARD,
];

/**
 * Spaces are deliberately NOT a supported document type, even though
 * content-as-code has them.
 *
 * upsertSpace takes an Account where every other upsert takes a SessionUser,
 * so supporting it would mean constructing a second synthetic principal in a
 * second shape. It buys nothing: publicSpaceCreate below creates whatever space
 * a chart or dashboard names, and spaceNames gives it its display name. One
 * synthetic actor is a thing to reason about; two is a thing to get wrong.
 */
const SUPPORTED = new Set<string>(UPSERT_ORDER);

const SLUG = /^[a-z0-9-]+$/;

/** The only content-as-code version this fork speaks. */
const CONTENT_VERSION = 1;

const asPostedFiles = (value: unknown): PostedFile[] => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new ParameterError('files must be a non-empty array');
    }
    return value.map((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
            throw new ParameterError(`files[${index}] must be an object`);
        }
        const { path, content } = entry as Record<string, unknown>;
        if (typeof path !== 'string' || path.trim() === '') {
            throw new ParameterError(`files[${index}].path is required`);
        }
        if (typeof content !== 'string' || content.trim() === '') {
            throw new ParameterError(`files[${index}].content is required`);
        }
        return { path: path.trim(), content };
    });
};

const parseOne = ({ path, content }: PostedFile): ParsedDocument => {
    let doc: unknown;
    try {
        doc = yaml.load(content);
    } catch (error) {
        throw new ParseError(
            `${path} is not valid YAML: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
        throw new ParseError(`${path} must be a YAML mapping`);
    }
    const { contentType, slug, spaceSlug, version } = doc as Record<
        string,
        unknown
    >;

    // ⚠ contentType IS REQUIRED HERE, where upstream makes it optional on
    // charts and dashboards. Upstream knows which document it is holding from
    // the route it arrived on; this endpoint takes them all at once and routes
    // on this field, and a guess from the document's shape would pick a
    // different upsert for a chart missing a key.
    if (typeof contentType !== 'string' || !SUPPORTED.has(contentType)) {
        throw new ParseError(
            `${path} must declare contentType as one of ${UPSERT_ORDER.join(
                ', ',
            )}, got ${String(contentType)}`,
        );
    }
    if (typeof slug !== 'string' || !SLUG.test(slug)) {
        throw new ParseError(
            `${path} must declare a slug matching ${SLUG.source}, got ${String(
                slug,
            )}`,
        );
    }
    // Omitted, a space slug defaults to the project's own space in some upstream
    // paths and to nothing in others. Kontala publishes into a space of its own
    // so that republishing cannot overwrite a customer's work, and a document
    // that forgot to say so would land in theirs.
    if (typeof spaceSlug !== 'string' || spaceSlug.trim() === '') {
        throw new ParseError(`${path} must declare a spaceSlug`);
    }
    if (version !== CONTENT_VERSION) {
        throw new ParseError(
            `${path} declares version ${String(
                version,
            )}; this instance writes version ${CONTENT_VERSION}`,
        );
    }
    return {
        kind: contentType as ParsedDocument['kind'],
        path,
        slug,
        doc,
    } as ParsedDocument;
};

/**
 * Parse every posted file, in the order they will be written.
 *
 * ⚠ EVERYTHING THAT CAN FAIL ON THE PAYLOAD FAILS HERE, before the first
 * database write. That is the half of semanticLayer.ts's all-or-nothing promise
 * this endpoint can keep: the writes are N sequential upserts and cannot be one
 * transaction, so a failure part-way leaves what came before it. The response
 * says which documents were written rather than implying atomicity that is not
 * there.
 */
export const parsePostedContent = (value: unknown): ParsedDocument[] => {
    const parsed = asPostedFiles(value).map(parseOne);

    // Two documents of one kind sharing a slug is one overwriting the other,
    // silently and in file order. Same failure the model's duplicate-name check
    // guards, and the same reason it is worth a line.
    const seen = new Map<string, string>();
    for (const { kind, slug, path } of parsed) {
        const key = `${kind}:${slug}`;
        const previous = seen.get(key);
        if (previous !== undefined) {
            throw new ParseError(
                `Duplicate ${kind} slug "${slug}" in ${previous} and ${path}`,
            );
        }
        seen.set(key, path);
    }

    return parsed
        .slice()
        .sort(
            (a, b) =>
                UPSERT_ORDER.indexOf(a.kind) - UPSERT_ORDER.indexOf(b.kind) ||
                a.path.localeCompare(b.path),
        );
};

/**
 * Chart slugs a dashboard tile names that no document in this payload defines.
 *
 * Reported rather than refused, because a dashboard referencing a chart that is
 * already in the project is legitimate and this endpoint cannot tell that case
 * from a mistake. The caller can: Kontala posts a closed set and treats any
 * entry here as a failure, which is the same division of labour as
 * DeploySemanticLayer refusing an exploreCount of zero that the server called
 * a success.
 */
export const unresolvedChartSlugs = (documents: ParsedDocument[]): string[] => {
    const defined = new Set(
        documents
            .filter(
                (d) =>
                    d.kind === ContentAsCodeType.CHART ||
                    d.kind === ContentAsCodeType.SQL_CHART,
            )
            .map((d) => d.slug),
    );
    const missing = new Set<string>();
    for (const document of documents) {
        if (document.kind === ContentAsCodeType.DASHBOARD) {
            for (const tile of document.doc.tiles ?? []) {
                const chartSlug = (
                    tile as { properties?: { chartSlug?: string | null } }
                ).properties?.chartSlug;
                if (
                    typeof chartSlug === 'string' &&
                    chartSlug !== '' &&
                    !defined.has(chartSlug)
                ) {
                    missing.add(chartSlug);
                }
            }
        }
    }
    return [...missing].sort();
};

/**
 * The CASL principal the upserts run as.
 *
 * ⚠ BUILT IN MEMORY, NEVER PERSISTED, AND THAT IS THE WHOLE POINT. The deploy
 * account holds no organization membership - kontalaRouter.ts removed the one it
 * used to have, calling it "exactly the kind of standing privilege worth not
 * having" - so there is no row here that grants anybody anything. What exists is
 * an admin ability object, for the length of a request the instance-wide secret
 * already authorised, discarded when the response is written. Grant the
 * membership instead and the privilege outlives the request, on a customer's
 * organization, reachable by anything that can sign in as that address. Nothing
 * can, but that is a property of an unroutable .invalid domain rather than of
 * the permission model, and the two should not have to hold at once.
 *
 * ADMIN rather than EDITOR because manage:ContentAsCode begins at developer.
 * That is a wider ability than this needs and there is no narrower preset to
 * ask for; what keeps it safe is that it is unreachable rather than that it is
 * small.
 */
export const deployActor = ({
    user,
    organizationUuid,
    lightdashConfig,
}: {
    user: LightdashUser;
    organizationUuid: string;
    lightdashConfig: LightdashConfig;
}): SessionUser => {
    const principal = {
        ...user,
        organizationUuid,
        role: OrganizationMemberRole.ADMIN,
        // No custom role: the ability comes from the static ADMIN block, which
        // is a constant of this Lightdash version rather than of whatever
        // scopes a customer's organization happens to have defined.
        roleUuid: undefined,
    };
    const { builder } = getUserAbilityBuilder({
        user: principal,
        // Empty, deliberately: a project profile would union project-level
        // grants on top, and the organization admin block already carries
        // everything an upsert checks.
        projectProfiles: [],
        permissionsConfig: { pat: lightdashConfig.auth.pat },
    });
    return {
        ...principal,
        abilityRules: builder.rules,
        ability: builder.build(),
    };
};
