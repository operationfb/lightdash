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
 *
 * And, where the caller asks, what Kontala published there before and no
 * longer sends is taken out (prunePublishedSpaces), because a content-as-code
 * upsert never deletes: a chart dropped from Kontala's build otherwise stays
 * in every project it ever reached, as the Overview's two SQL charts did after
 * the Active users explore replaced them on 2026-10-14.
 */
import {
  getLtreePathFromContentAsCodePath,
  ParameterError,
  SpaceMemberRole,
} from "@lightdash/common";
import type { DashboardModel } from "../../models/DashboardModel/DashboardModel";
import type { PinnedListModel } from "../../models/PinnedListModel";
import type { SavedChartModel } from "../../models/SavedChartModel";
import type { SavedSqlModel } from "../../models/SavedSqlModel";
import type { SpaceModel } from "../../models/SpaceModel";
import { type ParsedDocument } from "./content";

export type ManagedContentDependencies = {
  spaceModel: Pick<SpaceModel, "findByProjectAndPath" | "update">;
  dashboardModel: Pick<DashboardModel, "getByIdOrSlug" | "find" | "softDelete">;
  pinnedListModel: Pick<PinnedListModel, "pinDashboardsFirst">;
  savedChartModel: Pick<SavedChartModel, "find" | "get" | "softDelete">;
  savedSqlModel: Pick<SavedSqlModel, "find" | "softDelete">;
};

/** One document a prune took out, or left for a person to decide on. */
export type PrunedDocument = {
  type: "sql_chart" | "chart" | "dashboard";
  slug: string;
  uuid: string;
};

const SLUG = /^[a-z0-9-]+$/;

/** The body's pinnedDashboards: absent is none, anything else is refused. */
export const asPinnedDashboards = (
  value: unknown,
  documents: ParsedDocument[],
): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ParameterError("pinnedDashboards must be an array of slugs");
  }
  const published = new Set(
    documents.filter((d) => d.kind === "dashboard").map((d) => d.slug),
  );
  const seen = new Set<string>();
  return value.map((slug, index) => {
    if (typeof slug !== "string" || !SLUG.test(slug)) {
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

/**
 * Take out of the published spaces what the deploy account published there
 * and this payload no longer sends.
 *
 * ⚠ ONLY WHAT THE DEPLOY ACCOUNT LAST WROTE. The space is read-only to every
 * customer role, but an organization admin - in Kontala a superadmin - can
 * still save a chart into it, and on 2026-11-10 chrometests' held one. A
 * document whose latest version somebody else saved is theirs: it is listed in
 * `kept` and never deleted, so a prune can only ever undo a publish.
 *
 * Soft deletes, so whatever goes is in the project's trash and can be
 * restored. Dashboards first, so no dashboard is left naming a chart that went.
 * A chart saved inside a dashboard rather than a space is its dashboard's, and
 * goes with it.
 */
export const prunePublishedSpaces = async (
  deps: ManagedContentDependencies,
  projectUuid: string,
  spaceUuids: string[],
  documents: ParsedDocument[],
  deployUserUuid: string,
): Promise<{ removed: PrunedDocument[]; kept: PrunedDocument[] }> => {
  const removed: PrunedDocument[] = [];
  const kept: PrunedDocument[] = [];
  if (spaceUuids.length === 0) return { removed, kept };
  const inSpaces = new Set(spaceUuids);
  const sent = (kind: string) =>
    new Set(documents.filter((d) => d.kind === kind).map((d) => d.slug));
  const sentDashboards = sent("dashboard");
  const sentCharts = sent("chart");
  const sentSqlCharts = sent("sql_chart");
  const decide = (
    document: PrunedDocument,
    lastWrittenBy: string | null | undefined,
  ) => {
    if (lastWrittenBy === deployUserUuid) removed.push(document);
    else kept.push(document);
  };

  /* eslint-disable no-await-in-loop */
  const dashboards = (await deps.dashboardModel.find({ projectUuid }))
    .filter((d) => inSpaces.has(d.spaceUuid) && !sentDashboards.has(d.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  for (const dashboard of dashboards) {
    const full = await deps.dashboardModel.getByIdOrSlug(dashboard.uuid);
    decide(
      { type: "dashboard", slug: dashboard.slug, uuid: dashboard.uuid },
      full.updatedByUser?.userUuid,
    );
  }

  const charts = (
    await deps.savedChartModel.find({
      projectUuid,
      spaceUuids,
      excludeChartsSavedInDashboard: true,
    })
  )
    .filter((c) => inSpaces.has(c.spaceUuid) && !sentCharts.has(c.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  for (const chart of charts) {
    const full = await deps.savedChartModel.get(chart.uuid);
    decide(
      { type: "chart", slug: chart.slug, uuid: chart.uuid },
      full.updatedByUser?.userUuid,
    );
  }

  const sqlCharts = (await deps.savedSqlModel.find({ projectUuid }))
    .filter(
      (c) =>
        c.dashboard_uuid === null &&
        inSpaces.has(c.space_uuid) &&
        !sentSqlCharts.has(c.slug),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
  for (const sqlChart of sqlCharts) {
    decide(
      {
        type: "sql_chart",
        slug: sqlChart.slug,
        uuid: sqlChart.saved_sql_uuid,
      },
      sqlChart.last_version_updated_by_user_uuid,
    );
  }

  for (const document of removed) {
    switch (document.type) {
      case "dashboard":
        await deps.dashboardModel.softDelete(document.uuid, deployUserUuid);
        break;
      case "chart":
        await deps.savedChartModel.softDelete(document.uuid, deployUserUuid);
        break;
      default:
        await deps.savedSqlModel.softDelete(document.uuid, deployUserUuid);
    }
  }
  /* eslint-enable no-await-in-loop */
  return { removed, kept };
};
