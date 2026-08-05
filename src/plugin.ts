/**
 * Base class for a plugin.
 *
 * Attaches to a client, subscribes every handler declared with `@on` or `@once`, and
 * removes them all again on `detach`. Handlers declared on a base class are inherited.
 *
 * @example
 * ```ts
 * class HighlightPlugin extends StatsPlugin {
 *     #goals: string[] = [];
 *
 *     @once('MatchInitialized')
 *     start(): void {
 *         this.#goals = [];
 *     }
 *
 *     @on('GoalScored')
 *     record(goal: GoalScoredData): void {
 *         this.#goals.push(goal.Scorer.Name);
 *     }
 *
 *     @on('MatchEnded')
 *     summarize(result: MatchEndedData): void {
 *         console.log(`team ${result.WinnerTeamNum} won`, this.#goals);
 *     }
 *
 *     protected override onAttach(): void {
 *         console.log(`${this.name} ready`);
 *     }
 * }
 *
 * const plugin = new HighlightPlugin();
 * const client = new RocketLeagueStatsClient().use(plugin);
 * await client.connect();
 * client.unuse(plugin);
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import type { HandlerBinding } from './decorators.ts';
import { handlerBindings } from './decorators.ts';
import type { RocketLeagueStatsClient } from './client.ts';
import type { ClientEventName, StoredListener } from './types/lifecycle.ts';

type ErasedMethod = (this: unknown, ...args: unknown[]) => void;

interface Wiring {
    readonly event: ClientEventName;
    readonly listener: StoredListener;
}

export abstract class StatsPlugin {
    #client: RocketLeagueStatsClient | undefined;
    #wiring: Wiring[] = [];

    get name(): string {
        return this.constructor.name;
    }

    get attached(): boolean {
        return this.#client !== undefined;
    }

    get client(): RocketLeagueStatsClient {
        if (this.#client === undefined) {
            throw new Error(`${this.name} is not attached to a client yet`);
        }

        return this.#client;
    }

    get bindings(): readonly HandlerBinding[] {
        return handlerBindings(this);
    }

    attach(client: RocketLeagueStatsClient): this {
        if (this.#client !== undefined) {
            throw new Error(
                `${this.name} is already attached to a client. Call detach() before attaching it again.`,
            );
        }

        this.#client = client;

        for (const binding of this.bindings) {
            const method = (this as unknown as Record<string | symbol, unknown>)[
                binding.methodName
            ];

            if (typeof method !== 'function') continue;

            const invoke = method as ErasedMethod;
            const event = binding.event as ClientEventName;

            const listener: StoredListener =
                binding.mode === 'once'
                    ? (((...args: unknown[]): void => {
                          this.#unsubscribe(event, listener);
                          invoke.apply(this, args);
                      }) as StoredListener)
                    : (((...args: unknown[]): void => {
                          invoke.apply(this, args);
                      }) as StoredListener);

            (client.on as (name: ClientEventName, handler: StoredListener) => unknown)(
                event,
                listener,
            );
            this.#wiring.push({ event, listener });
        }

        this.onAttach?.();

        return this;
    }

    detach(): this {
        if (this.#client === undefined) return this;

        this.onDetach?.();

        for (const { event, listener } of this.#wiring) {
            this.#unsubscribe(event, listener);
        }

        this.#wiring = [];
        this.#client = undefined;

        return this;
    }

    #unsubscribe(event: ClientEventName, listener: StoredListener): void {
        const client = this.#client;

        if (client === undefined) return;
        (client.off as (name: ClientEventName, handler: StoredListener) => unknown)(
            event,
            listener,
        );
    }

    protected onAttach?(): void;

    protected onDetach?(): void;
}
