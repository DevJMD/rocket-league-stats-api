/**
 * Decorators for declaring event handlers on a plugin.
 *
 * TC39 standard decorators, so no `experimentalDecorators` and no `reflect-metadata`.
 * A handler's signature is checked against the event it declares.
 *
 * `@on` subscribes for the life of the attachment, `@once` for the next occurrence
 * only, `@throttle(ms)` rate limits per instance, and `@bound` binds to the instance.
 *
 * @example
 * ```ts
 * class ScoreboardPlugin extends StatsPlugin {
 *     @on('UpdateState')
 *     @throttle(100)
 *     render(tick: UpdateStateData): void {
 *         draw(tick.Game);
 *     }
 *
 *     @once('MatchInitialized')
 *     reset(): void {
 *         this.clear();
 *     }
 *
 *     @on('connected')
 *     announce(info: ConnectedInfo): void {
 *         console.log(`connected to ${info.host}:${info.port}`);
 *     }
 *
 *     @bound
 *     shutdown(): void {
 *         this.flush();
 *     }
 * }
 *
 * process.on('SIGINT', plugin.shutdown);
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import type { StatsApiEventMap, StatsApiEventName, StatsApiMessage } from './types/events.ts';
import type { ClientLifecycleMap } from './types/lifecycle.ts';

export type HandlerMode = 'on' | 'once';

export interface HandlerBinding {
    readonly event: string;
    readonly mode: HandlerMode;
    readonly methodName: string | symbol;
}

type AnyMethod = (...args: never[]) => void;

type ErasedMethod = (this: unknown, ...args: unknown[]) => void;

const NO_BINDINGS: readonly HandlerBinding[] = Object.freeze([]);

const BINDINGS = new WeakMap<object, HandlerBinding[]>();

export function handlerBindings(instance: object): readonly HandlerBinding[] {
    return BINDINGS.get(instance) ?? NO_BINDINGS;
}

function addBinding(instance: object, binding: HandlerBinding): void {
    const existing = BINDINGS.get(instance);

    if (existing === undefined) BINDINGS.set(instance, [binding]);
    else existing.push(binding);
}

function register(event: string, mode: HandlerMode, context: ClassMethodDecoratorContext): void {
    if (context.static) {
        throw new TypeError(`@${mode}("${event}") cannot decorate a static method`);
    }

    if (context.private) {
        throw new TypeError(
            `@${mode}("${event}") cannot decorate a private method, because the plugin has to look it up by name`,
        );
    }

    const { name } = context;

    context.addInitializer(function initializeHandler(this: unknown): void {
        addBinding(this as object, { event, mode, methodName: name });
    });
}

type GameEventDecorator<K extends StatsApiEventName> = <
    T extends (data: StatsApiEventMap[K], message: Extract<StatsApiMessage, { event: K }>) => void,
>(
    value: T,
    context: ClassMethodDecoratorContext,
) => void;

type LifecycleEventDecorator<K extends keyof ClientLifecycleMap> = <
    T extends (payload: ClientLifecycleMap[K]) => void,
>(
    value: T,
    context: ClassMethodDecoratorContext,
) => void;

export function on<K extends StatsApiEventName>(event: K): GameEventDecorator<K>;

export function on<K extends keyof ClientLifecycleMap>(event: K): LifecycleEventDecorator<K>;

export function on(event: string) {
    return function onDecorator(_value: AnyMethod, context: ClassMethodDecoratorContext): void {
        register(event, 'on', context);
    };
}

export function once<K extends StatsApiEventName>(event: K): GameEventDecorator<K>;

export function once<K extends keyof ClientLifecycleMap>(event: K): LifecycleEventDecorator<K>;

export function once(event: string) {
    return function onceDecorator(_value: AnyMethod, context: ClassMethodDecoratorContext): void {
        register(event, 'once', context);
    };
}

const THROTTLE_STATE = new WeakMap<object, Map<string | symbol, number>>();

export function throttle(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new RangeError(`@throttle requires a non negative number, received ${milliseconds}`);
    }

    return function throttleDecorator<T extends AnyMethod>(
        value: T,
        context: ClassMethodDecoratorContext,
    ): T {
        const { name } = context;
        const inner = value as unknown as ErasedMethod;

        function throttled(this: unknown, ...args: unknown[]): void {
            if (milliseconds === 0) {
                inner.apply(this, args);

                return;
            }

            const owner = this as object;
            let seen = THROTTLE_STATE.get(owner);

            if (seen === undefined) {
                seen = new Map();
                THROTTLE_STATE.set(owner, seen);
            }

            const now = Date.now();
            const last = seen.get(name);

            if (last !== undefined && now - last < milliseconds) return;

            seen.set(name, now);
            inner.apply(this, args);
        }

        return throttled as unknown as T;
    };
}

export function bound<T extends AnyMethod>(value: T, context: ClassMethodDecoratorContext): void {
    if (context.private) {
        throw new TypeError('@bound cannot decorate a private method');
    }

    const { name } = context;
    const inner = value as unknown as ErasedMethod;

    context.addInitializer(function initializeBound(this: unknown): void {
        Object.defineProperty(this as object, name, {
            value: inner.bind(this),
            configurable: true,
            writable: true,
            enumerable: false,
        });
    });
}
