/**
 * Errors thrown or reported by the client.
 *
 * Each carries a `code`, so callers never have to match on message text.
 *
 * @example
 * ```ts
 * client.onError((error) => {
 *     switch (error.code) {
 *         case 'connection_failed':
 *             retryLater();
 *             break;
 *         case 'invalid_payload':
 *             console.warn((error as InvalidPayloadError).issues);
 *             break;
 *         default:
 *             console.error(error.message);
 *     }
 * });
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import type { ValidationIssue } from './protocol/validation.ts';

export type StatsApiErrorCode =
    | 'connection_failed'
    | 'not_connected'
    | 'connect_timeout'
    | 'invalid_command'
    | 'invalid_payload'
    | 'malformed_frame';

export class StatsApiError extends Error {
    readonly code: StatsApiErrorCode;

    constructor(code: StatsApiErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = new.target.name;
        this.code = code;
    }
}

export class ConnectionError extends StatsApiError {
    readonly host: string;
    readonly port: number;

    constructor(message: string, host: string, port: number, options?: { cause?: unknown }) {
        super('connection_failed', message, options);
        this.host = host;
        this.port = port;
    }
}

export class ConnectTimeoutError extends StatsApiError {
    readonly timeoutMs: number;

    constructor(host: string, port: number, timeoutMs: number) {
        super('connect_timeout', `Timed out after ${timeoutMs}ms connecting to ${host}:${port}`);
        this.timeoutMs = timeoutMs;
    }
}

export class NotConnectedError extends StatsApiError {
    constructor(operation: string) {
        super('not_connected', `Cannot ${operation} because the client is not connected`);
    }
}

export class InvalidCommandError extends StatsApiError {
    readonly command: string;

    constructor(command: string, message: string) {
        super('invalid_command', `${command}: ${message}`);
        this.command = command;
    }
}

export class InvalidPayloadError extends StatsApiError {
    readonly event: string;
    readonly issues: readonly ValidationIssue[];
    readonly raw: Readonly<Record<string, unknown>>;

    constructor(
        event: string,
        issues: readonly ValidationIssue[],
        raw: Readonly<Record<string, unknown>>,
    ) {
        const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');

        super('invalid_payload', `Invalid ${event} payload: ${summary}`);
        this.event = event;
        this.issues = issues;
        this.raw = raw;
    }
}

export class MalformedFrameError extends StatsApiError {
    readonly frame: string;

    constructor(frame: string, reason: string) {
        const preview = frame.length > 200 ? `${frame.slice(0, 200)}...` : frame;

        super('malformed_frame', `Malformed frame (${reason}): ${preview}`);
        this.frame = frame;
    }
}
