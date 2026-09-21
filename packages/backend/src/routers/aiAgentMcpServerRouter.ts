import express, { type Router } from 'express';
import { lightdashConfig } from '../config/lightdashConfig';
import { siteUrlFor } from '../config/siteUrl';
import { AiAgentService } from '../ee/services/AiAgentService/AiAgentService';
import Logger from '../logging/logger';

export const aiAgentMcpOAuthCallbackRouter: Router = express.Router();

const getAiAgentService = (req: express.Request): AiAgentService =>
    req.services.getAiAgentService<AiAgentService>();

const handleOAuthCallback = async (
    req: express.Request,
    res: express.Response,
) => {
    const { code, state } = req.query;
    // KONTALA: the popup these close is served by this instance, so both go
    // through siteUrlFor rather than resolving a leading slash against the
    // origin. See config/siteUrl.ts.
    const successRedirect = siteUrlFor(lightdashConfig, '/auth/popup/success');
    const failureRedirect = siteUrlFor(lightdashConfig, '/auth/popup/failure');

    try {
        await getAiAgentService(req).completeMcpOAuthConnection({
            code: typeof code === 'string' ? code : undefined,
            state: typeof state === 'string' ? state : undefined,
        });
        res.redirect(302, successRedirect);
    } catch (error) {
        Logger.error(`[AiAgent][MCP] OAuth callback failed`, error);
        res.redirect(302, failureRedirect);
    }
};

aiAgentMcpOAuthCallbackRouter.get('/aiAgents/mcp/oauth/callback', (req, res) =>
    handleOAuthCallback(req, res),
);
