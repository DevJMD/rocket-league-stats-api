import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    LifecycleEvent,
    on,
    RocketLeagueStatsClient,
    STATS_API_COMMANDS,
    STATS_API_EVENTS,
    StatsCommand,
    StatsEvent,
    StatsPlugin,
    validateCommand,
} from '../src/index.ts';
import type { GoalScoredData, UpdateStateData } from '../src/index.ts';
import { frame, GOAL_SCORED_EXAMPLE, MATCH_GUID } from './fixtures.ts';

describe('StatsEvent', () => {
    it('names every event and matches the runtime list', () => {
        assert.equal(Object.keys(StatsEvent).length, 22);
        assert.deepEqual([...STATS_API_EVENTS].toSorted(), Object.values(StatsEvent).toSorted());
    });

    it('maps each key to its own wire string', () => {
        for (const [key, value] of Object.entries(StatsEvent)) {
            assert.equal(key, value, 'event keys mirror the wire name exactly');
        }
    });

    it('subscribes and narrows the payload from the constant', () => {
        const client = new RocketLeagueStatsClient();
        const scorers: string[] = [];

        client.on(StatsEvent.GoalScored, (goal) => {
            const typed: GoalScoredData = goal;

            scorers.push(typed.Scorer.Name);
        });

        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));

        assert.deepEqual(scorers, ['PlayerA']);
    });

    it('is interchangeable with a plain string literal', () => {
        const client = new RocketLeagueStatsClient();
        let calls = 0;

        const listener = (): void => {
            calls += 1;
        };

        client.on(StatsEvent.RoundStarted, listener);
        client.ingest(frame('RoundStarted', { MatchGuid: MATCH_GUID }));
        assert.equal(calls, 1);

        client.off('RoundStarted', listener);
        client.ingest(frame('RoundStarted', { MatchGuid: MATCH_GUID }));
        assert.equal(calls, 1);
    });

    it('works as a decorator argument', () => {
        class EnumPlugin extends StatsPlugin {
            readonly ticks: number[] = [];

            @on(StatsEvent.UpdateState)
            record(tick: UpdateStateData): void {
                this.ticks.push(tick.Game.TimeSeconds);
            }
        }

        const plugin = new EnumPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        client.ingest(
            frame('UpdateState', {
                MatchGuid: MATCH_GUID,
                Players: [],
                Game: {
                    Teams: [],
                    PlaylistId: 11,
                    TimeSeconds: 240,
                    bOvertime: false,
                    Ball: { Speed: 0, TeamNum: 255 },
                    bReplay: false,
                    bHasWinner: false,
                    Winner: '',
                    Arena: 'Stadium_P',
                    bHasTarget: false,
                },
            }),
        );

        assert.deepEqual(plugin.ticks, [240]);
    });
});

describe('LifecycleEvent', () => {
    it('covers every lifecycle key', () => {
        assert.deepEqual(Object.values(LifecycleEvent).toSorted(), [
            'connected',
            'disconnected',
            'error',
            'message',
            'unknownEvent',
            'warning',
        ]);
    });

    it('subscribes to a lifecycle event from the constant', () => {
        const client = new RocketLeagueStatsClient();
        const seen: string[] = [];

        client.on(LifecycleEvent.Message, (message) => seen.push(message.event));
        client.ingest(frame('RoundStarted', { MatchGuid: MATCH_GUID }));

        assert.deepEqual(seen, ['RoundStarted']);
    });
});

describe('StatsCommand', () => {
    it('matches the runtime list', () => {
        assert.deepEqual(
            [...STATS_API_COMMANDS].toSorted(),
            Object.values(StatsCommand).toSorted(),
        );
    });

    it('keeps the game spelling of the awkward names', () => {
        assert.equal(StatsCommand.ChangePov, 'ChangePOV');
        assert.equal(StatsCommand.SetHudVisibility, 'SetHUDVisibility');
    });

    it('builds a command from the constant', () => {
        validateCommand({ Command: StatsCommand.SetGameSpeed, Data: { Speed: 0.5 } });
        validateCommand({ Command: StatsCommand.SetMatchPaused, Data: { bPaused: true } });
    });
});
