/**
 * KONTALA: what makes the published content Kontala's rather than the tenant's.
 *
 * Two things, both applied after every content publish so that a publish is
 * also the repair for a project that has drifted from them.
 *
 * Every space a published document names is made read-only for the project's
 * members. A content-as-code upsert always overwrites, so an edit a customer
 * made to a published chart or dashboard would be lost silently on the next
 * publish, and a deletion would come back; refusing both is more honest than
 * accepting work that will be thrown away. The space stops inheriting project
 * permissions and gives every project member the viewer role instead, which is
 * the stock "all project members" grant (spaces.project_member_access_role),
 * so CASL hides edit, move and delete from every customer role and the
 * documents can still be duplicated into a space of the customer's own.
 * Organization admins keep managing it, as they manage every space: in
 * Kontala that is a superadmin, and the publish itself, whose actor is an
 * in-memory admin (deployActor).
 *
 * The dashboards Kontala names are pinned first, in the order it names them,
 * on the project's home page. What a customer pinned stays pinned, after them
 * and in its own order.
 */
import {
    getLtreePathFromContentAsCodePath,
    ParameterError,
    SpaceMemberRole,
} from '@lightdash/common';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { PinnedListModel } from '../../models/PinnedListModel';
import type { SpaceModel } from '../../models/SpaceModel';
import { type ParsedDocument } from './content';

export type ManagedContentDependencies = {
    spaceModel: Pick<SpaceModel, 'findByProjectAndPath' | 'update'>;
    dashboardModel: Pick<DashboardModel, 'getByIdOrSlug'>;
    pinnedListModel: Pick<PinnedListModel, 'pinDashboardsFirst'>;
};

const SLUG = /^[a-z0-9-]+$/;

/** The body's pinnedDashboards: absent is none, anything else is refused. */
export const asPinnedDashboards = (
    value: unknown,
    documents: ParsedDocument[],
): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new ParameterError('pinnedDashboards must be an array of slugs');
    }
    const published = new Set(
        documents.filter((d) => d.kind === 'dashboard').map((d) => d.slug),
    );
    const seen = new Set<string>();
    return value.map((slug, index) => {
        if (typeof slug !== 'string' || !SLUG.test(slug)) {
            throw new ParameterError(
                `pinnedDashboards[${index}] must be a slug matching ${SLUG.source}`,
            );
        }
        // Only what this payload publishes, so a pin can never reach a
        // customer's own dashboard of the same slug in another space.
        if (!published.has(slug)) {
            throw new ParameterError(
                `pinnedDashboards[${index}] names "${slug}", which this payload does not publish`,
            );
        }
        if (seen.has(slug)) {
            throw new ParameterError(`pinnedDashboards names "${slug}" twice`);
        }
        seen.add(slug);
        return slug;
    });
};

/** Every space the documents name, made read-only for project members. */
export const lockPublishedSpaces = async (
    deps: ManagedContentDependencies,
    projectUuid: string,
    documents: ParsedDocument[],
): Promise<string[]> => {
    const slugs = [...new Set(documents.map((d) => d.doc.spaceSlug))].sort();
    const locked: string[] = [];
    /* eslint-disable no-await-in-loop */
    for (const slug of slugs) {
        const spaces = await deps.spaceModel.findByProjectAndPath(
            projectUuid,
            getLtreePathFromContentAsCodePath(slug),
        );
        for (const space of spaces) {
            if (
                space.inheritParentPermissions ||
                space.projectMemberAccessRole !== SpaceMemberRole.VIEWER
            ) {
                await deps.spaceModel.update(space.uuid, {
                    name: space.name,
                    inheritParentPermissions: false,
                    projectMemberAccessRole: SpaceMemberRole.VIEWER,
                });
            }
            locked.push(space.uuid);
        }
    }
    /* eslint-enable no-await-in-loop */
    return locked;
};

/** The named dashboards pinned first, in order. */
export const pinPublishedDashboards = async (
    deps: ManagedContentDependencies,
    projectUuid: string,
    slugs: string[],
): Promise<void> => {
    if (slugs.length === 0) return;
    const uuids: string[] = [];
    /* eslint-disable no-await-in-loop */
    for (const slug of slugs) {
        const dashboard = await deps.dashboardModel.getByIdOrSlug(slug, {
            projectUuid,
        });
        uuids.push(dashboard.uuid);
    }
    /* eslint-enable no-await-in-loop */
    await deps.pinnedListModel.pinDashboardsFirst(projectUuid, uuids);
};
