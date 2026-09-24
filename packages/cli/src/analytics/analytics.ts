import { LightdashError } from '@lightdash/common';

export interface AnalyticsTrack {
    event: string;
    properties?: Record<string, unknown>;
    context?: Record<string, unknown>;
}

type BaseTrack = Omit<AnalyticsTrack, 'context'>;

type CliGenerateExposuresStarted = BaseTrack & {
    event: 'generate_exposures.started';
    properties: {
        executionId: string;
    };
};
type CliGenerateExposuresCompleted = BaseTrack & {
    event: 'generate_exposures.completed';
    properties: {
        executionId: string;
        countExposures: number;
        durationMs: number;
    };
};
type CliGenerateExposuresError = BaseTrack & {
    event: 'generate_exposures.error';
    properties: {
        executionId: string;
    };
};

type CliGenerateStarted = BaseTrack & {
    event: 'generate.started';
    properties: {
        executionId: string;
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
    };
};
type CliGenerateCompleted = BaseTrack & {
    event: 'generate.completed';
    properties: {
        executionId: string;
        numModelsSelected: number | undefined;
        trigger: string; // generate or dbt
        durationMs: number;
    };
};
type CliGenerateError = BaseTrack & {
    event: 'generate.error';
    properties: {
        executionId: string;
        trigger: string;
        error: string;
    };
};
type CliDbtCommand = BaseTrack & {
    event: 'dbt_command.started';
    properties: {
        command: string;
    };
};

type CliDbtCommandCompleted = BaseTrack & {
    event: 'dbt_command.completed';
    properties: {
        command: string;
        durationMs: number;
    };
};

type CliDbtError = BaseTrack & {
    event: 'dbt_command.error';
    properties: {
        command: string;
        error: string;
        durationMs: number;
    };
};

type CliPreviewStarted = BaseTrack & {
    event: 'preview.started';
    properties: {
        executionId: string;
        projectId: string;
    };
};
type CliPreviewCompleted = BaseTrack & {
    event: 'preview.completed';
    properties: {
        executionId: string;
        projectId: string;
        durationMs: number;
    };
};
type CliPreviewStopped = BaseTrack & {
    event: 'preview.stopped';
    properties: {
        executionId: string;
        projectId: string;
        durationMs: number;
    };
};
type CliPreviewError = BaseTrack & {
    event: 'preview.error';
    properties: {
        executionId: string;
        projectId: string;
        error: string;
    };
};

type CliRefreshStarted = BaseTrack & {
    event: 'refresh.started';
    properties: {
        executionId: string;
        projectId: string;
    };
};
type CliRefreshCompleted = BaseTrack & {
    event: 'refresh.completed';
    properties: {
        executionId: string;
        projectId: string;
        durationMs: number;
    };
};
type CliRefreshError = BaseTrack & {
    event: 'refresh.error';
    properties: {
        executionId: string;
        projectId: string;
        error: string;
    };
};

type CliCompileStarted = BaseTrack & {
    event: 'compile.started';
    properties: {
        executionId: string;
        dbtVersion?: string;
        skipDbtCompile: boolean;
        skipWarehouseCatalog: boolean;
        useDbtList: boolean;
    };
};
type CliCompileCompleted = BaseTrack & {
    event: 'compile.completed';
    properties: {
        executionId: string;
        explores: number;
        errors: number;
        dbtMetrics: number;
        dbtVersion?: string;
        durationMs: number;
    };
};
type CliCompileError = BaseTrack & {
    event: 'compile.error';
    properties: {
        executionId: string;
        dbtVersion?: string;
        error: string;
    };
};

type CliDeployTriggered = BaseTrack & {
    event: 'deploy.triggered';
    properties: {
        projectId: string;
        durationMs: number;
        payloadSizeBytes?: number;
    };
};

type CliCreateStarted = BaseTrack & {
    event: 'create.started';
    properties: {
        executionId: string;
        projectName: string;
        isDefaultName: boolean;
    };
};
type CliCreateCompleted = BaseTrack & {
    event: 'create.completed';
    properties: {
        executionId: string;
        projectId: string;
        projectName: string;
        durationMs: number;
    };
};
type CliCreateError = BaseTrack & {
    event: 'create.error';
    properties: {
        executionId: string;
        error: string;
    };
};

type CliStartStopPreview = BaseTrack & {
    event:
        | 'start_preview.update'
        | 'start_preview.create'
        | 'stop_preview.delete'
        | 'stop_preview.missing';
    properties: {
        executionId: string;
        projectId: string;
        name: string;
    };
};
type CliStopPreviewMissing = BaseTrack & {
    event: 'stop_preview.missing';
    properties: {
        name: string;
    };
};

type CliLogin = BaseTrack & {
    event: 'login.started' | 'login.completed';
    properties: {
        userId?: string;
        organizationId?: string;
        method: string;
        url: string;
    };
};

export type ProjectContentAsCodeCounts = {
    chartsNum?: number;
    dashboardsNum?: number;
    spacesNum?: number;
    virtualViewsNum?: number;
    agentsNum?: number;
    appsNum?: number;
    chartTypesNum?: number;
    alertsNum?: number;
    scheduledDeliveriesNum?: number;
    googleSheetsNum?: number;
    externalConnectionsNum?: number;
};

type CliContentAsCode = BaseTrack &
    (
        | {
              event: 'download.started' | 'upload.started';
              properties: {
                  userId?: string;
                  organizationId?: string;
                  projectId: string;
              };
          }
        | {
              event: 'download.completed' | 'upload.completed';
              properties: {
                  userId?: string;
                  organizationId?: string;
                  projectId: string;
                  timeToCompleted: number; // in seconds
              } & ProjectContentAsCodeCounts;
          }
        | {
              event: 'download.error' | 'upload.error';
              properties: {
                  userId?: string;
                  organizationId?: string;
                  projectId: string;
                  type?: 'charts' | 'dashboards'; // Error uploading specific charts or dashboards, this error is not blocking
                  error: string;
              };
          }
        | {
              event: 'download.started' | 'upload.started';
              properties: {
                  userId?: string;
                  organizationId: string;
                  scope: 'organization';
              };
          }
        | {
              event: 'download.completed';
              properties: {
                  userId?: string;
                  organizationId: string;
                  scope: 'organization';
                  customRolesNum: number;
                  timeToCompleted: number;
              };
          }
        | {
              event: 'upload.completed';
              properties: {
                  userId?: string;
                  organizationId: string;
                  scope: 'organization';
                  customRolesCreated: number;
                  customRolesUpdated: number;
                  customRolesUnchanged: number;
                  timeToCompleted: number;
              };
          }
        | {
              event: 'download.error' | 'upload.error';
              properties: {
                  userId?: string;
                  organizationId: string;
                  scope: 'organization';
                  error: string;
              };
          }
    );

type CliLightdashConfigLoaded = BaseTrack & {
    event: 'lightdashconfig.loaded';
    properties: {
        userId?: string;
        organizationId?: string;
        projectId: string;
        categories_count?: number;
        default_visibility?: 'show' | 'hide';
    };
};

type CliValidateStarted = BaseTrack & {
    event: 'validate.started';
    properties: {
        executionId: string;
        projectId: string;
        isPreview: boolean;
        validationTargets: string[];
        validateWarehouseColumns: boolean;
        includedSpacesCount: number;
        excludedSpacesCount: number;
        severity: 'error' | 'warning';
    };
};
/** `success` indicates whether 0 validation errors were found, not whether the process ran without crashing (crashes fire `validate.error` instead). */
type CliValidateCompleted = BaseTrack & {
    event: 'validate.completed';
    properties: {
        executionId: string;
        projectId: string;
        isPreview: boolean;
        validationTargets: string[];
        validateWarehouseColumns: boolean;
        includedSpacesCount: number;
        excludedSpacesCount: number;
        durationMs: number;
        success: boolean;
        totalErrors: number;
        totalWarnings: number;
        tableErrors: number;
        chartErrors: number;
        dashboardErrors: number;
        appErrors: number;
        severity: 'error' | 'warning';
    };
};
type CliValidateError = BaseTrack & {
    event: 'validate.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliSqlStarted = BaseTrack & {
    event: 'sql.started';
    properties: {
        executionId: string;
        projectId: string;
    };
};
type CliSqlCompleted = BaseTrack & {
    event: 'sql.completed';
    properties: {
        executionId: string;
        projectId: string;
        rowCount: number;
        columnCount: number;
        durationMs: number;
    };
};
type CliSqlError = BaseTrack & {
    event: 'sql.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliLintCompleted = BaseTrack & {
    event: 'lint.completed';
    properties: {
        executionId: string;
        filesScanned: number;
        lightdashFilesFound: number;
        validFiles: number;
        invalidFiles: number;
        chartFiles: number;
        dashboardFiles: number;
        modelFiles: number;
        outputFormat: string;
        durationMs: number;
    };
};

type CliLintError = BaseTrack & {
    event: 'lint.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliRenameCompleted = BaseTrack & {
    event: 'rename.completed';
    properties: {
        executionId: string;
        projectId: string;
        renameType: string;
        isDryRun: boolean;
        chartsUpdated: number;
        dashboardsUpdated: number;
        durationMs: number;
        validationStatus: 'skipped' | 'passed' | 'failed';
    };
};
type CliRenameError = BaseTrack & {
    event: 'rename.error';
    properties: {
        executionId: string;
        error: string;
        errorCategory: string;
    };
};

type CliCommandExecuted = BaseTrack & {
    event: 'command.executed';
    properties: {
        command: string;
        durationMs: number;
        success: boolean;
    };
};

type CliConnectSnowflake = BaseTrack &
    (
        | {
              event: 'connect_snowflake.started';
              properties: Record<string, never>;
          }
        | {
              event: 'connect_snowflake.completed';
              properties: { method: 'key_pair' | 'pat' };
          }
        | {
              event: 'connect_snowflake.error';
              properties: { error: string; errorCategory: string };
          }
    );

type Track =
    | CliGenerateStarted
    | CliGenerateCompleted
    | CliGenerateError
    | CliDbtCommand
    | CliDbtCommandCompleted
    | CliDbtError
    | CliPreviewStarted
    | CliPreviewCompleted
    | CliPreviewStopped
    | CliPreviewError
    | CliRefreshStarted
    | CliRefreshCompleted
    | CliRefreshError
    | CliCompileStarted
    | CliCompileCompleted
    | CliCompileError
    | CliDeployTriggered
    | CliCreateStarted
    | CliCreateCompleted
    | CliCreateError
    | CliStartStopPreview
    | CliStopPreviewMissing
    | CliGenerateExposuresStarted
    | CliGenerateExposuresCompleted
    | CliGenerateExposuresError
    | CliLogin
    | CliContentAsCode
    | CliLightdashConfigLoaded
    | CliValidateStarted
    | CliValidateCompleted
    | CliValidateError
    | CliSqlStarted
    | CliSqlCompleted
    | CliSqlError
    | CliLintCompleted
    | CliLintError
    | CliRenameCompleted
    | CliRenameError
    | CliCommandExecuted
    | CliConnectSnowflake;

const ERROR_NAME_TO_CATEGORY: Record<string, string> = {
    ForbiddenError: 'forbidden',
    AuthorizationError: 'authorization',
    ParameterError: 'parameter',
    NotFoundError: 'not_found',
    CompileError: 'compile',
    DbtError: 'dbt',
    WarehouseConnectionError: 'warehouse_connection',
    WarehouseQueryError: 'warehouse_query',
};

export const categorizeError = (error: unknown): string => {
    if (error instanceof LightdashError) {
        return ERROR_NAME_TO_CATEGORY[error.name] ?? 'lightdash';
    }
    if (error instanceof Error) {
        const msg = error.message;
        if (
            msg.includes('ECONNREFUSED') ||
            msg.includes('ENOTFOUND') ||
            msg.includes('ETIMEDOUT')
        ) {
            return 'network';
        }
    }
    return 'unknown';
};

// KONTALA: no third-party transport. CLI events are accepted and dropped; the
// RudderStack endpoint this class used to post to is removed.
export class LightdashAnalytics {
    static track: (payload: Track) => Promise<void> = () => Promise.resolve();
}
