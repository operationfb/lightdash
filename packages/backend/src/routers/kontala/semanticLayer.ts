/**
 * KONTALA: compiling a tenant's semantic layer from YAML that arrived over HTTP.
 *
 * This is `packages/cli/src/handlers/compile.ts`'s
 * getExploresFromLightdashYmlProject, minus the filesystem. Every piece of it
 * is MIT and importable from the backend, which is what makes the Node CLI
 * removable from Kontala's provisioning path: the CLI's one irreplaceable job
 * was compiling the model client-side, and the compiler is right here.
 *
 * `packages/backend/src/projectAdapters/nativeGitProjectAdapter.ts` already
 * does exactly this server-side against a git checkout. The only difference
 * here is where the bytes come from.
 *
 * ⚠ NOTHING IN THIS FILE TOUCHES THE DATABASE OR A WAREHOUSE. compileLightdashModels
 * takes a WarehouseSqlBuilder, not a WarehouseClient - a pure dialect, with no
 * connection behind it - which is what makes this safe to run against a
 * DbtProjectType.NONE project whose own adapter refuses to compile anything.
 */
import {
    compileLightdashModels,
    DEFAULT_SPOTLIGHT_CONFIG,
    isExploreError,
    loadLightdashProjectConfig,
    ParameterError,
    ParseError,
    preAggregatePostProcessor,
    WarehouseTypes,
    type Explore,
    type LightdashModelWithSource,
    type LightdashProjectConfig,
    type Project,
} from '@lightdash/common';
import { parseLightdashModel } from '@lightdash/common/lightdash/loader';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';

/**
 * One posted model file.
 *
 * ⚠ `path` IS NOT DECORATIVE. convertLightdashModelToDbtModel writes it into
 * the dbt node's `path`, `patch_path` and `original_file_path`, which surface
 * in the UI and in content-as-code. Kontala sends the path the CLI produced -
 * `lightdash/models/events_clean.yml`, relative to collector/deploy/lightdash -
 * so the first server-side deploy yields explores identical to the last CLI
 * one rather than a cosmetic diff on every field.
 */
export type PostedModel = {
    path: string;
    content: string;
};

const asPostedModels = (value: unknown): PostedModel[] => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new ParameterError('models must be a non-empty array');
    }
    return value.map((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
            throw new ParameterError(`models[${index}] must be an object`);
        }
        const { path, content } = entry as Record<string, unknown>;
        if (typeof path !== 'string' || path.trim() === '') {
            throw new ParameterError(`models[${index}].path is required`);
        }
        if (typeof content !== 'string' || content.trim() === '') {
            throw new ParameterError(`models[${index}].content is required`);
        }
        return { path: path.trim(), content };
    });
};

/**
 * Turn posted files into the shape the compiler wants.
 *
 * This is loadLightdashModels' second half - the sourcePath stamping and the
 * duplicate-name check - with the directory walk taken out. The duplicate check
 * matters for the same reason it does there: two models sharing a name would
 * compile to two explores with one key, and the second would silently win.
 */
export const parsePostedModels = (
    value: unknown,
): LightdashModelWithSource[] => {
    const posted = asPostedModels(value);
    const names = new Map<string, string>();
    return posted.map(({ path, content }) => {
        const model = parseLightdashModel(content, path);
        const previousPath = names.get(model.name);
        if (previousPath !== undefined) {
            throw new ParseError(
                `Duplicate Lightdash model "${model.name}" in ${previousPath} and ${path}`,
            );
        }
        names.set(model.name, path);
        return { ...model, sourcePath: path };
    });
};

/**
 * The project config, which Kontala's tenants do not need to send.
 *
 * Their lightdash.config.yml declares only `warehouse: type: bigquery`, and
 * the adapter is read from the project row below instead, so the file carries
 * nothing this endpoint uses. Absent therefore means the same default a git
 * project with no config file gets.
 */
const projectConfigFrom = async (
    config: string | undefined,
): Promise<LightdashProjectConfig> =>
    config === undefined || config.trim() === ''
        ? { spotlight: DEFAULT_SPOTLIGHT_CONFIG }
        : loadLightdashProjectConfig(config);

/**
 * Compile, or throw.
 *
 * ⚠ THE ADAPTER COMES FROM THE PROJECT, NOT FROM THE POSTED CONFIG. The CLI
 * reads it from lightdash.config.yml, which can disagree with the warehouse
 * the project actually queries and then compiles SQL in the wrong dialect. The
 * project row cannot disagree with itself. A posted config that names a
 * different warehouse is a caller mistake and is refused rather than ignored.
 *
 * ⚠ allowPartialCompilation IS FALSE, AND THAT IS THE POINT. A metric missing
 * its own `sql` compiles to a degraded explore and takes every derived metric
 * with it; `lightdash deploy` reports that as PARTIAL_SUCCESS in a line on
 * stdout, which scripts/lightdash-tenant-deploy.sh had to grep for. Here it is
 * an ExploreError, and the caller gets a status code.
 */
export const compilePostedSemanticLayer = async ({
    models,
    project,
    config,
}: {
    models: LightdashModelWithSource[];
    project: Project;
    config?: string;
}): Promise<Explore[]> => {
    const warehouse = project.warehouseConnection;
    if (!warehouse) {
        throw new ParameterError(
            `Project ${project.projectUuid} has no warehouse connection, so there is no dialect to compile for`,
        );
    }

    const lightdashProjectConfig = await projectConfigFrom(config);
    const declared = lightdashProjectConfig.warehouse?.type;
    if (declared !== undefined && declared !== warehouse.type) {
        throw new ParameterError(
            `The posted config declares warehouse "${declared}" but the project is "${warehouse.type}"`,
        );
    }

    const warehouseSqlBuilder = warehouseSqlBuilderFromType(
        warehouse.type,
        warehouse.startOfWeek,
    );

    const compiled = await compileLightdashModels({
        models,
        warehouseSqlBuilder,
        lightdashProjectConfig,
        loadSources: false,
        allowPartialCompilation: false,
        disableTimestampConversion:
            warehouse.type === WarehouseTypes.SNOWFLAKE &&
            warehouse.disableTimestampConversion === true,
        // The @lightdash/common one, NOT ee/preAggregates/postProcessor. The
        // EE variant additionally generates virtual pre-aggregate explores and
        // is Enterprise-licensed; this instance has no licence key, and the
        // fork carries no change under ee/.
        postProcessors: [preAggregatePostProcessor],
    });

    const failures = compiled.filter(isExploreError);
    if (failures.length > 0) {
        throw new ParseError(
            `Lightdash model compilation failed: ${failures
                .map(
                    (explore) =>
                        `${explore.name}: ${explore.errors
                            .map((error) => error.message)
                            .join('; ')}`,
                )
                .join('\n')}`,
        );
    }

    return compiled.filter(
        (explore): explore is Explore => !isExploreError(explore),
    );
};
