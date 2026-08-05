/**
 * Lifecycle events, listener shapes and client options.
 *
 * Lifecycle events are camelCase, so they cannot collide with the PascalCase game
 * event names.
 *
 * @example
 * ```ts
 * client
 *     .onConnected((info: ConnectedInfo) => console.log(info.host, info.port))
 *     .onDisconnected((info: DisconnectedInfo) => console.log(info.reason))
 *     .on('warning', (info: WarningInfo) => console.warn(info.event, info.issues))
 *     .on('unknownEvent', (info: UnknownEventInfo) => console.log(info.event));
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import type { StatsApiError } from '../errors.ts';
import type { ValidationIssue } from '../protocol/validation.ts';
import type { StatsApiEventMap, StatsApiEventName, StatsApiMessage } from './events.ts';

export interface ConnectedInfo {
    readonly host: string;
    readonly port: number;
    readonly attempt: number;
}

export type DisconnectReason = 'remote' | 'error' | 'manual';

export interface DisconnectedInfo {
    readonly reason: DisconnectReason;
    readonly error?: StatsApiError;
    readonly willReconnect: boolean;
}

export interface UnknownEventInfo {
    readonly event: string;
    readonly raw: Readonly<Record<string, unknown>>;
}

export interface WarningInfo {
    readonly event: StatsApiEventName;
    readonly issues: readonly ValidationIssue[];
}

export interface ClientLifecycleMap {
    readonly connected: ConnectedInfo;
    readonly disconnected: DisconnectedInfo;
    readonly error: StatsApiError;
    readonly message: StatsApiMessage;
    readonly unknownEvent: UnknownEventInfo;
    readonly warning: WarningInfo;
}

export const LifecycleEvent = {
    Connected: 'connected',
    Disconnected: 'disconnected',
    Error: 'error',
    Message: 'message',
    UnknownEvent: 'unknownEvent',
    Warning: 'warning',
} as const;

export type ClientEventName = StatsApiEventName | keyof ClientLifecycleMap;

export type ClientStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export type GameEventListener<K extends StatsApiEventName> = (
    data: StatsApiEventMap[K],
    message: Extract<StatsApiMessage, { event: K }>,
) => void;

export type LifecycleListener<K extends keyof ClientLifecycleMap> = (
    payload: ClientLifecycleMap[K],
) => void;

export type StoredListener = (...args: never[]) => void;

export interface ReconnectOptions {
    readonly enabled?: boolean;
    readonly delayMs?: number;
    readonly maxDelayMs?: number;
}

export interface RocketLeagueStatsClientOptions {
    readonly host?: string;
    readonly port?: number;
    readonly tickIntervalMs?: number;
    readonly connectTimeoutMs?: number;
    readonly reconnect?: ReconnectOptions | boolean;
    readonly maxBufferChars?: number;
    readonly onInvalidPayload?: 'emit' | 'ignore';
}

export interface StreamOptions {
    readonly bufferSize?: number;
    readonly signal?: AbortSignal;
}
