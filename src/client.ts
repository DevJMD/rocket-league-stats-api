/**
 * Fluent client for the Rocket League Stats API.
 *
 * Owns the TCP socket, frames the stream, validates each payload and emits typed
 * events. Configuration methods return `this`.
 *
 * @example
 * ```ts
 * const client = new RocketLeagueStatsClient({ port: 49123 })
 *     .tickRate(10)
 *     .use(new Scoreboard())
 *     .on('GoalScored', (goal) => console.log(goal.Scorer.Name))
 *     .onDisconnected((info) => console.log(info.reason, info.willReconnect));
 *
 * await client.connect();
 *
 * client.watchPlayer(3, 'PlayerView');
 * client.setHudVisibility(false);
 *
 * console.log(client.snapshot?.Game.TimeSeconds);
 *
 * await client.disconnect();
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import * as net from 'node:net';

import {
    ConnectionError,
    ConnectTimeoutError,
    InvalidPayloadError,
    MalformedFrameError,
    NotConnectedError,
    type StatsApiError,
} from './errors.ts';
import type { StatsPlugin } from './plugin.ts';
import { decodeFrame } from './protocol/decode.ts';
import { encodeCommand } from './protocol/encode.ts';
import { JsonFrameBuffer } from './protocol/framer.ts';
import type {
    ChangePovCommandData,
    LoadReplayCommandData,
    Perspective,
    SeekReplayCommandData,
    StatsApiCommand,
} from './types/commands.ts';
import { DEFAULT_HOST, DEFAULT_PORT, MAX_PACKET_SEND_RATE } from './types/config.ts';
import type {
    StatsApiEventMap,
    StatsApiEventName,
    StatsApiMessage,
    UpdateStateData,
} from './types/events.ts';
import type {
    ClientLifecycleMap,
    ClientStatus,
    GameEventListener,
    LifecycleListener,
    ReconnectOptions,
    RocketLeagueStatsClientOptions,
    StoredListener,
    StreamOptions,
} from './types/lifecycle.ts';

interface ResolvedOptions {
    host: string;
    port: number;
    tickIntervalMs: number;
    connectTimeoutMs: number;
    reconnectEnabled: boolean;
    reconnectDelayMs: number;
    maxReconnectDelayMs: number;
    maxBufferChars: number;
    onInvalidPayload: 'emit' | 'ignore';
}

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 15_000;
const DEFAULT_MAX_BUFFER_CHARS = 8 * 1024 * 1024;
const DEFAULT_STREAM_BUFFER = 256;
const MAX_PORT = 65_535;
const MILLISECONDS_PER_SECOND = 1000;

export class RocketLeagueStatsClient {
    readonly #options: ResolvedOptions;
    readonly #listeners = new Map<string, readonly StoredListener[]>();
    readonly #frames: JsonFrameBuffer;

    #socket: net.Socket | undefined;
    #state: ClientStatus = 'idle';
    #lastSocketError: StatsApiError | undefined;

    #reconnectTimer: NodeJS.Timeout | undefined;
    #connectTimer: NodeJS.Timeout | undefined;
    #tickTimer: NodeJS.Timeout | undefined;

    #currentReconnectDelay: number;
    #reconnectAttempt = 0;

    #latestTick: UpdateStateData | undefined;
    #pendingTick: Extract<StatsApiMessage, { event: 'UpdateState' }> | undefined;
    #lastTickDeliveredAt = 0;

    constructor(options: RocketLeagueStatsClientOptions = {}) {
        const reconnect: ReconnectOptions =
            typeof options.reconnect === 'boolean'
                ? { enabled: options.reconnect }
                : (options.reconnect ?? {});

        this.#options = {
            host: options.host ?? DEFAULT_HOST,
            port: options.port ?? DEFAULT_PORT,
            tickIntervalMs: options.tickIntervalMs ?? 0,
            connectTimeoutMs: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
            reconnectEnabled: reconnect.enabled ?? true,
            reconnectDelayMs: reconnect.delayMs ?? DEFAULT_RECONNECT_DELAY_MS,
            maxReconnectDelayMs: reconnect.maxDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS,
            maxBufferChars: options.maxBufferChars ?? DEFAULT_MAX_BUFFER_CHARS,
            onInvalidPayload: options.onInvalidPayload ?? 'emit',
        };
        this.#currentReconnectDelay = this.#options.reconnectDelayMs;
        this.#frames = new JsonFrameBuffer({ maxBufferChars: this.#options.maxBufferChars });
    }

    get status(): ClientStatus {
        return this.#state;
    }

    get connected(): boolean {
        return this.#state === 'connected';
    }

    get currentHost(): string {
        return this.#options.host;
    }

    get currentPort(): number {
        return this.#options.port;
    }

    get currentTickInterval(): number {
        return this.#options.tickIntervalMs;
    }

    get snapshot(): UpdateStateData | undefined {
        return this.#latestTick;
    }

    listenerCount(event: string): number {
        return this.#listeners.get(event)?.length ?? 0;
    }

    #assertConfigurable(setting: string): void {
        if (this.#state === 'connected' || this.#state === 'connecting') {
            throw new ConnectionError(
                `Cannot change ${setting} while the client is ${this.#state}. Disconnect first.`,
                this.#options.host,
                this.#options.port,
            );
        }
    }

    host(host: string): this {
        this.#assertConfigurable('host');
        this.#options.host = host;

        return this;
    }

    port(port: number): this {
        this.#assertConfigurable('port');

        if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
            throw new ConnectionError(
                `Port must be an integer between 1 and ${MAX_PORT}, received ${port}`,
                this.#options.host,
                port,
            );
        }

        this.#options.port = port;

        return this;
    }

    address(host: string, port: number): this {
        return this.host(host).port(port);
    }

    tickInterval(milliseconds: number): this {
        if (!Number.isFinite(milliseconds) || milliseconds < 0) {
            throw new RangeError(
                `tickInterval must be a non negative number, received ${milliseconds}`,
            );
        }

        this.#options.tickIntervalMs = milliseconds;

        return this;
    }

    tickRate(updatesPerSecond: number): this {
        if (!Number.isFinite(updatesPerSecond) || updatesPerSecond <= 0) {
            throw new RangeError(`tickRate must be greater than 0, received ${updatesPerSecond}`);
        }

        if (updatesPerSecond > MAX_PACKET_SEND_RATE) {
            throw new RangeError(
                `tickRate cannot exceed the game's maximum PacketSendRate of ${MAX_PACKET_SEND_RATE}`,
            );
        }

        return this.tickInterval(MILLISECONDS_PER_SECOND / updatesPerSecond);
    }

    connectTimeout(milliseconds: number): this {
        if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
            throw new RangeError(`connectTimeout must be greater than 0, received ${milliseconds}`);
        }

        this.#options.connectTimeoutMs = milliseconds;

        return this;
    }

    reconnect(options: ReconnectOptions | boolean): this {
        if (typeof options === 'boolean') {
            this.#options.reconnectEnabled = options;

            return this;
        }

        this.#options.reconnectEnabled = options.enabled ?? this.#options.reconnectEnabled;
        this.#options.reconnectDelayMs = options.delayMs ?? this.#options.reconnectDelayMs;
        this.#options.maxReconnectDelayMs = options.maxDelayMs ?? this.#options.maxReconnectDelayMs;
        this.#currentReconnectDelay = this.#options.reconnectDelayMs;

        return this;
    }

    use(plugin: StatsPlugin): this {
        plugin.attach(this);

        return this;
    }

    unuse(plugin: StatsPlugin): this {
        plugin.detach();

        return this;
    }

    on<K extends StatsApiEventName>(event: K, listener: GameEventListener<K>): this;

    on<K extends keyof ClientLifecycleMap>(event: K, listener: LifecycleListener<K>): this;

    on(event: string, listener: StoredListener): this {
        const existing = this.#listeners.get(event);

        this.#listeners.set(event, existing === undefined ? [listener] : [...existing, listener]);

        return this;
    }

    off<K extends StatsApiEventName>(event: K, listener: GameEventListener<K>): this;

    off<K extends keyof ClientLifecycleMap>(event: K, listener: LifecycleListener<K>): this;

    off(event: string, listener: StoredListener): this {
        const existing = this.#listeners.get(event);

        if (existing === undefined) return this;

        const next = existing.filter((candidate) => candidate !== listener);

        if (next.length === existing.length) return this;

        if (next.length === 0) this.#listeners.delete(event);
        else this.#listeners.set(event, next);

        return this;
    }

    onError(listener: LifecycleListener<'error'>): this {
        return this.on('error', listener);
    }

    onConnected(listener: LifecycleListener<'connected'>): this {
        return this.on('connected', listener);
    }

    onDisconnected(listener: LifecycleListener<'disconnected'>): this {
        return this.on('disconnected', listener);
    }

    onMessage(listener: LifecycleListener<'message'>): this {
        return this.on('message', listener);
    }

    removeAllListeners(event?: string): this {
        if (event === undefined) {
            this.#listeners.clear();
        } else {
            this.#listeners.delete(event);
        }

        return this;
    }

    once<K extends StatsApiEventName>(
        event: K,
        options?: { readonly signal?: AbortSignal },
    ): Promise<StatsApiEventMap[K]> {
        return new Promise((resolve, reject) => {
            const signal = options?.signal;

            const listener = ((data: StatsApiEventMap[K]) => {
                cleanup();
                resolve(data);
            }) as GameEventListener<K>;

            const onAbort = (): void => {
                cleanup();
                reject(new Error(`Waiting for ${event} was aborted`));
            };

            const cleanup = (): void => {
                this.off(event, listener);
                signal?.removeEventListener('abort', onAbort);
            };

            if (signal?.aborted === true) {
                reject(new Error(`Waiting for ${event} was aborted`));

                return;
            }

            this.on(event, listener);
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    #emitLifecycle<K extends keyof ClientLifecycleMap>(
        event: K,
        payload: ClientLifecycleMap[K],
    ): void {
        const bucket = this.#listeners.get(event);

        if (bucket === undefined) return;

        for (let index = 0; index < bucket.length; index += 1) {
            const listener = bucket[index];

            if (listener !== undefined) {
                (listener as (value: ClientLifecycleMap[K]) => void)(payload);
            }
        }
    }

    #emitGameEvent(message: StatsApiMessage): void {
        const bucket = this.#listeners.get(message.event);

        if (bucket !== undefined) {
            for (let index = 0; index < bucket.length; index += 1) {
                const listener = bucket[index];

                if (listener !== undefined) {
                    (listener as (data: unknown, message: StatsApiMessage) => void)(
                        message.data,
                        message,
                    );
                }
            }
        }

        this.#emitLifecycle('message', message);
    }

    connect(): Promise<this> {
        if (this.#state === 'connected') return Promise.resolve(this);

        return new Promise<this>((resolve, reject) => {
            this.#state = 'connecting';
            this.#frames.reset();

            const { host, port, connectTimeoutMs } = this.#options;
            const socket = net.createConnection({ host, port });

            this.#socket = socket;

            socket.setEncoding('utf8');

            let settled = false;

            this.#connectTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                socket.destroy();
                this.#state = 'idle';
                reject(new ConnectTimeoutError(host, port, connectTimeoutMs));
            }, connectTimeoutMs);

            socket.once('connect', () => {
                this.#clearConnectTimer();
                this.#state = 'connected';
                this.#currentReconnectDelay = this.#options.reconnectDelayMs;
                this.#emitLifecycle('connected', { host, port, attempt: this.#reconnectAttempt });

                if (!settled) {
                    settled = true;
                    resolve(this);
                }
            });

            socket.on('data', (chunk: string) => {
                this.ingest(chunk);
            });

            socket.on('error', (cause: Error) => {
                const error = new ConnectionError(
                    describeSocketError(cause, host, port),
                    host,
                    port,
                    {
                        cause,
                    },
                );

                this.#lastSocketError = error;

                if (settled) {
                    this.#emitLifecycle('error', error);
                } else {
                    settled = true;
                    this.#clearConnectTimer();
                    this.#state = 'idle';
                    reject(error);
                }
            });

            socket.on('close', () => {
                this.#clearConnectTimer();
                this.#clearTickTimer();
                this.#socket = undefined;

                if (this.#state === 'closed') {
                    this.#emitLifecycle('disconnected', { reason: 'manual', willReconnect: false });

                    return;
                }

                const error = this.#lastSocketError;

                this.#lastSocketError = undefined;

                const willReconnect = this.#options.reconnectEnabled && settled;

                this.#emitLifecycle(
                    'disconnected',
                    error === undefined
                        ? { reason: 'remote', willReconnect }
                        : { reason: 'error', error, willReconnect },
                );

                if (willReconnect) this.#scheduleReconnect();
                else this.#state = 'idle';
            });
        });
    }

    #scheduleReconnect(): void {
        this.#state = 'reconnecting';

        const delay = this.#currentReconnectDelay;

        this.#currentReconnectDelay = Math.min(delay * 2, this.#options.maxReconnectDelayMs);
        this.#reconnectAttempt += 1;

        this.#reconnectTimer = setTimeout(() => {
            this.#reconnectTimer = undefined;
            if (this.#state !== 'reconnecting') return;
            this.connect().catch((error: unknown) => {
                if (isStatsApiError(error)) this.#emitLifecycle('error', error);

                if (this.#options.reconnectEnabled && this.#state !== 'closed')
                    this.#scheduleReconnect();
            });
        }, delay);
    }

    async disconnect(): Promise<void> {
        this.#state = 'closed';
        this.#clearReconnectTimer();
        this.#clearConnectTimer();
        this.#clearTickTimer();
        this.#pendingTick = undefined;

        const socket = this.#socket;

        if (socket === undefined) return;

        await new Promise<void>((resolve) => {
            socket.once('close', () => {
                resolve();
            });
            socket.destroy();
        });
        this.#socket = undefined;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.disconnect();
    }

    #clearConnectTimer(): void {
        if (this.#connectTimer !== undefined) {
            clearTimeout(this.#connectTimer);
            this.#connectTimer = undefined;
        }
    }

    #clearReconnectTimer(): void {
        if (this.#reconnectTimer !== undefined) {
            clearTimeout(this.#reconnectTimer);
            this.#reconnectTimer = undefined;
        }
    }

    #clearTickTimer(): void {
        if (this.#tickTimer !== undefined) {
            clearTimeout(this.#tickTimer);
            this.#tickTimer = undefined;
        }
    }

    ingest(chunk: string): void {
        this.#frames.push(chunk);

        const frames = this.#frames.drain();

        for (let index = 0; index < frames.length; index += 1) {
            const frame = frames[index];

            if (frame !== undefined) this.#handleFrame(frame);
        }
    }

    #handleFrame(frame: string): void {
        const result = decodeFrame(frame);

        switch (result.kind) {
            case 'message': {
                if (result.warnings.length > 0) {
                    this.#emitLifecycle('warning', {
                        event: result.message.event,
                        issues: result.warnings,
                    });
                }

                this.#dispatch(result.message);
                break;
            }

            case 'invalid': {
                if (this.#options.onInvalidPayload === 'emit') {
                    this.#emitLifecycle(
                        'error',
                        new InvalidPayloadError(result.event, result.issues, result.raw),
                    );
                }

                break;
            }

            case 'unknown-event': {
                this.#emitLifecycle('unknownEvent', { event: result.event, raw: result.raw });
                break;
            }

            case 'malformed': {
                this.#emitLifecycle('error', new MalformedFrameError(result.frame, result.reason));
                break;
            }

            default:
                break;
        }
    }

    #dispatch(message: StatsApiMessage): void {
        if (message.event !== 'UpdateState') {
            this.#emitGameEvent(message);

            return;
        }

        this.#latestTick = message.data;

        const interval = this.#options.tickIntervalMs;

        if (interval <= 0) {
            this.#lastTickDeliveredAt = message.receivedAt;
            this.#emitGameEvent(message);

            return;
        }

        const elapsed = message.receivedAt - this.#lastTickDeliveredAt;

        if (elapsed >= interval) {
            this.#lastTickDeliveredAt = message.receivedAt;
            this.#pendingTick = undefined;
            this.#clearTickTimer();
            this.#emitGameEvent(message);

            return;
        }

        this.#pendingTick = message;

        if (this.#tickTimer === undefined) {
            this.#tickTimer = setTimeout(() => {
                this.#tickTimer = undefined;

                const pending = this.#pendingTick;

                this.#pendingTick = undefined;
                if (pending === undefined) return;
                this.#lastTickDeliveredAt = Date.now();
                this.#emitGameEvent(pending);
            }, interval - elapsed);
        }
    }

    stream(options: StreamOptions = {}): AsyncGenerator<StatsApiMessage, void, void> {
        const bufferSize = options.bufferSize ?? DEFAULT_STREAM_BUFFER;
        const { signal } = options;

        const queue: StatsApiMessage[] = [];
        let pending: PromiseWithResolvers<void> | undefined;
        let finished = false;

        const wake = (): void => {
            const waiter = pending;

            pending = undefined;
            waiter?.resolve();
        };

        const listener: LifecycleListener<'message'> = (message) => {
            if (queue.length >= bufferSize) queue.shift();
            queue.push(message);
            wake();
        };

        const stop = (): void => {
            finished = true;
            wake();
        };

        this.on('message', listener);
        this.on('disconnected', stop);
        signal?.addEventListener('abort', stop, { once: true });
        if (signal?.aborted === true) stop();

        const cleanup = (): void => {
            this.off('message', listener);
            this.off('disconnected', stop);
            signal?.removeEventListener('abort', stop);
        };

        async function* iterate(): AsyncGenerator<StatsApiMessage, void, void> {
            try {
                for (;;) {
                    const next = queue.shift();

                    if (next !== undefined) {
                        yield next;

                        continue;
                    }

                    if (finished) return;

                    pending ??= Promise.withResolvers<void>();

                    await pending.promise;
                }
            } finally {
                cleanup();
            }
        }

        return iterate();
    }

    [Symbol.asyncIterator](): AsyncGenerator<StatsApiMessage, void, void> {
        return this.stream();
    }

    send(command: StatsApiCommand): this {
        const socket = this.#socket;

        if (socket === undefined || this.#state !== 'connected') {
            throw new NotConnectedError(`send ${command.Command}`);
        }

        socket.write(encodeCommand(command));

        return this;
    }

    changePov(data: ChangePovCommandData): this {
        return this.send({ Command: 'ChangePOV', Data: data });
    }

    watchBall(perspective?: Perspective): this {
        return this.changePov(
            perspective === undefined
                ? { Focus: 'Ball' }
                : { Focus: 'Ball', Perspective: perspective },
        );
    }

    watchPlayer(shortcut: number, perspective?: Perspective): this {
        if (!Number.isInteger(shortcut) || shortcut < 0) {
            throw new RangeError(`shortcut must be a non negative integer, received ${shortcut}`);
        }

        const focus = `${shortcut}` as const;

        return this.changePov(
            perspective === undefined
                ? { Focus: focus }
                : { Focus: focus, Perspective: perspective },
        );
    }

    loadReplay(data: LoadReplayCommandData): this {
        return this.send({ Command: 'LoadReplay', Data: data });
    }

    seekReplay(data: SeekReplayCommandData): this {
        return this.send({ Command: 'SeekReplay', Data: data });
    }

    setGameSpeed(speed: number): this {
        return this.send({ Command: 'SetGameSpeed', Data: { Speed: speed } });
    }

    setHudVisibility(visible: boolean): this {
        return this.send({ Command: 'SetHUDVisibility', Data: { bVisible: visible } });
    }

    setMatchPaused(paused: boolean): this {
        return this.send({ Command: 'SetMatchPaused', Data: { bPaused: paused } });
    }
}

function isStatsApiError(value: unknown): value is StatsApiError {
    return value instanceof Error && 'code' in value;
}

function describeSocketError(error: Error, host: string, port: number): string {
    const code = 'code' in error ? String(error['code']) : undefined;

    if (code === 'ECONNREFUSED') {
        return (
            `Connection refused at ${host}:${port}. Check that Rocket League is running and that ` +
            `PacketSendRate is greater than 0 and Port matches in TAStatsAPI.ini.`
        );
    }

    if (code === 'ECONNRESET') {
        return `Connection reset by ${host}:${port}, which happens when the game closes.`;
    }

    return error.message;
}
