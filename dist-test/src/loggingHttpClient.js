import { HttpClient } from "../generated/c64/index.js";
import { formatErrorMessage, formatPayloadForDebug, loggerFor, payloadByteLength } from "./logger.js";
export function createLoggingHttpClient(config, logger = loggerFor("c64u")) {
    const http = new HttpClient(config);
    http.instance.interceptors.request.use((request) => {
        const method = (request.method ?? "get").toUpperCase();
        const path = resolvePath(request);
        const meta = {
            startedAt: Date.now(),
            method,
            path,
            headers: request.headers ? { ...request.headers } : undefined,
            params: request.params ? { ...request.params } : undefined,
            body: request.data,
        };
        request.__c64Meta = meta;
        return request;
    });
    http.instance.interceptors.response.use((response) => {
        handleResponse(response, logger);
        return response;
    }, (error) => {
        handleError(error, logger);
        return Promise.reject(error);
    });
    return http;
}
function handleResponse(response, logger) {
    const meta = extractMeta(response.config);
    const latency = meta ? Date.now() - meta.startedAt : 0;
    const method = meta?.method ?? (response.config.method ?? "get").toUpperCase();
    const path = meta?.path ?? resolvePath(response.config);
    const bytes = payloadByteLength(response.data);
    logger.info(`${method} ${path} status=${response.status} bytes=${bytes} latencyMs=${latency}`);
    if (logger.isDebugEnabled()) {
        logger.debug(`request ${method} ${path}`, {
            headers: meta?.headers,
            query: meta?.params,
            body: formatPayloadForDebug(meta?.body),
        });
        logger.debug(`response ${method} ${path}`, {
            status: response.status,
            headers: response.headers ?? {},
            body: formatPayloadForDebug(response.data),
        });
    }
}
function handleError(error, logger) {
    const config = error.config;
    if (!config) {
        logger.error(`UNKNOWN UNKNOWN status=ERR bytes=0 latencyMs=0 error=${formatErrorMessage(error)}`);
        return;
    }
    const meta = extractMeta(config);
    const latency = meta ? Date.now() - meta.startedAt : 0;
    const method = meta?.method ?? (config.method ?? "get").toUpperCase();
    const path = meta?.path ?? resolvePath(config);
    const response = error.response;
    const status = response?.status ?? "ERR";
    const bytes = response ? payloadByteLength(response.data) : 0;
    const message = formatErrorMessage(error);
    logger.warn(`${method} ${path} status=${status} bytes=${bytes} latencyMs=${latency} error=${message}`);
    if (logger.isDebugEnabled()) {
        logger.debug(`request ${method} ${path}`, {
            headers: meta?.headers,
            query: meta?.params,
            body: formatPayloadForDebug(meta?.body),
        });
        logger.debug(`error ${method} ${path}`, {
            status,
            headers: response?.headers ?? {},
            body: response ? formatPayloadForDebug(response.data) : null,
            message,
        });
    }
}
function extractMeta(config) {
    const meta = config.__c64Meta;
    delete config.__c64Meta;
    return meta;
}
function resolvePath(config) {
    if (config.url)
        return config.url;
    if (config.baseURL)
        return config.baseURL;
    return "UNKNOWN";
}
