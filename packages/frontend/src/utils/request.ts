import {
    getErrorMessage,
    JWT_HEADER_NAME,
    type ApiError,
} from '@lightdash/common';
import { EMBED_KEY, type InMemoryEmbed } from '../ee/providers/Embed/types';
import { getFromInMemoryStorage } from './inMemoryStorage';
import { isRootRelativePath } from './redirectUrl';

const LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY =
    '__lightdash_sdk_instance_url';

/**
 * KONTALA: resolve a Lightdash request path against the base this build is
 * served under, not against the bare origin.
 *
 * The path is resolved RELATIVE to that base. A leading slash resolves against
 * the origin alone, which drops the prefix: `/api/v2/...` instead of
 * `/analytics/api/v2/...`, landing on whatever else shares the origin. This
 * mirrors how `lightdashApi` builds its own prefix (see api.ts).
 */
export const resolveRequestUrl = (url: string) => {
    const sdkInstanceUrl = sessionStorage.getItem(
        LIGHTDASH_SDK_INSTANCE_URL_LOCAL_STORAGE_KEY,
    );
    const base =
        sdkInstanceUrl ??
        `${window.location.origin}${import.meta.env.BASE_URL}`;

    return new URL(
        isRootRelativePath(url) ? url.slice(1) : url,
        base.endsWith('/') ? base : `${base}/`,
    ).toString();
};

// To be reused across all hooks that need to fetch SQL query results
export const getResultsFromStream = async <T>(url: string | undefined) => {
    try {
        if (!url) {
            throw new Error('No URL provided');
        }
        // Embed iframes need the JWT on every fetch — there is no session
        // cookie. Mirror lightdashApi's finalizeHeaders so streamed result
        // reads aren't rejected with 401.
        const embed = getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY);
        const headers: Record<string, string> = {
            Accept: 'application/json',
        };
        if (embed?.token) {
            headers[JWT_HEADER_NAME] = embed.token;
        }
        const response = await fetch(resolveRequestUrl(url), {
            method: 'GET',
            headers,
        });
        const rb = response.body;
        const reader = rb?.getReader();

        const stream = new ReadableStream({
            start(controller) {
                function push() {
                    void reader?.read().then(({ done, value }) => {
                        if (done) {
                            // Close the stream
                            controller.close();
                            return;
                        }
                        // Enqueue the next data chunk into our target stream
                        controller.enqueue(value);

                        push();
                    });
                }

                push();
            },
        });

        const responseStream = new Response(stream, {
            headers: { 'Content-Type': 'application/json' },
        });
        const result = await responseStream.text();

        // Split the JSON strings by newline
        const jsonStrings = result
            .trim()
            .split('\n')
            .filter((s) => s !== '');
        const jsonObjects: T[] = jsonStrings
            .map((jsonString) => {
                try {
                    if (!jsonString) {
                        return null;
                    }
                    return JSON.parse(jsonString);
                } catch (e) {
                    throw new Error('Error parsing JSON');
                }
            })
            .filter((obj) => obj !== null);

        return jsonObjects;
    } catch (e) {
        // convert error to ApiError
        throw <ApiError>{
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 500,
                message: getErrorMessage(e),
                data: {},
            },
        };
    }
};
