import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bound, on, once, RocketLeagueStatsClient, StatsPlugin, throttle } from '../src/index.ts';
import type {
    ConnectedInfo,
    GoalScoredData,
    StatfeedEventData,
    UpdateStateData,
} from '../src/index.ts';
import { frame, GOAL_SCORED_EXAMPLE, MATCH_GUID, STATFEED_EVENT_EXAMPLE } from './fixtures.ts';

function noop(): void {}

const delay = async (ms: number): Promise<void> => {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
};

function tick(timeSeconds: number): unknown {
    return {
        MatchGuid: MATCH_GUID,
        Players: [],
        Game: {
            Teams: [],
            PlaylistId: 11,
            TimeSeconds: timeSeconds,
            bOvertime: false,
            Ball: { Speed: 0, TeamNum: 255 },
            bReplay: false,
            bHasWinner: false,
            Winner: '',
            Arena: 'Stadium_P',
            bHasTarget: false,
        },
    };
}

class RecordingPlugin extends StatsPlugin {
    readonly goals: string[] = [];
    readonly stats: string[] = [];
    readonly ticks: number[] = [];
    readonly connections: number[] = [];
    attachCalls = 0;
    detachCalls = 0;
    initializedCount = 0;

    @on('GoalScored')
    recordGoal(goal: GoalScoredData): void {
        this.goals.push(goal.Scorer.Name);
    }

    @on('StatfeedEvent')
    recordStat(stat: StatfeedEventData): void {
        this.stats.push(stat.EventName);
    }

    @on('UpdateState')
    recordTick(data: UpdateStateData): void {
        this.ticks.push(data.Game.TimeSeconds);
    }

    @on('connected')
    recordConnected(info: ConnectedInfo): void {
        this.connections.push(info.port);
    }

    @once('MatchInitialized')
    recordFirstInit(): void {
        this.initializedCount += 1;
    }

    @bound
    describe(): string {
        return `${this.goals.length} goals`;
    }

    protected override onAttach(): void {
        this.attachCalls += 1;
    }

    protected override onDetach(): void {
        this.detachCalls += 1;
    }
}

class ThrottledPlugin extends StatsPlugin {
    readonly ticks: number[] = [];

    @on('UpdateState')
    @throttle(80)
    recordTick(data: UpdateStateData): void {
        this.ticks.push(data.Game.TimeSeconds);
    }
}

class BasePlugin extends StatsPlugin {
    readonly seen: string[] = [];

    @on('GoalScored')
    baseHandler(goal: GoalScoredData): void {
        this.seen.push(`base:${goal.Scorer.Name}`);
    }
}

class DerivedPlugin extends BasePlugin {
    @on('StatfeedEvent')
    derivedHandler(stat: StatfeedEventData): void {
        this.seen.push(`derived:${stat.EventName}`);
    }
}

describe('StatsPlugin', () => {
    it('wires decorated handlers when used', () => {
        const plugin = new RecordingPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        assert.equal(plugin.attached, true);
        assert.equal(plugin.attachCalls, 1);
        assert.equal(plugin.client, client);

        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));
        client.ingest(frame('StatfeedEvent', STATFEED_EVENT_EXAMPLE));
        client.ingest(frame('UpdateState', tick(180)));

        assert.deepEqual(plugin.goals, ['PlayerA']);
        assert.deepEqual(plugin.stats, ['Demolish']);
        assert.deepEqual(plugin.ticks, [180]);
    });

    it('discovers one binding per decorated method', () => {
        const plugin = new RecordingPlugin();
        const events = plugin.bindings.map((binding) => binding.event).toSorted();

        assert.deepEqual(events, [
            'GoalScored',
            'MatchInitialized',
            'StatfeedEvent',
            'UpdateState',
            'connected',
        ]);
    });

    it('handles lifecycle events as well as game events', async () => {
        const plugin = new RecordingPlugin();
        const client = new RocketLeagueStatsClient({ port: 1, reconnect: false }).use(plugin);

        await assert.rejects(async () => client.connect());
        assert.deepEqual(plugin.connections, [], 'a refused connection never emits connected');
    });

    it('unsubscribes a once handler after the first call', () => {
        const plugin = new RecordingPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        client.ingest(frame('MatchInitialized', { MatchGuid: MATCH_GUID }));
        client.ingest(frame('MatchInitialized', { MatchGuid: MATCH_GUID }));
        client.ingest(frame('MatchInitialized', { MatchGuid: MATCH_GUID }));

        assert.equal(plugin.initializedCount, 1);
        assert.equal(client.listenerCount('MatchInitialized'), 0, 'the listener must be removed');
    });

    it('removes every listener on detach', () => {
        const plugin = new RecordingPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        assert.equal(client.listenerCount('GoalScored'), 1);
        client.unuse(plugin);

        assert.equal(plugin.detachCalls, 1);
        assert.equal(plugin.attached, false);
        assert.equal(client.listenerCount('GoalScored'), 0);

        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));
        assert.deepEqual(plugin.goals, [], 'a detached plugin must stop receiving events');
    });

    it('can be reattached after detaching', () => {
        const plugin = new RecordingPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        client.unuse(plugin);
        client.use(plugin);

        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));
        assert.deepEqual(plugin.goals, ['PlayerA']);
        assert.equal(client.listenerCount('GoalScored'), 1, 'no duplicate subscription');
    });

    it('refuses to attach twice', () => {
        const plugin = new RecordingPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        assert.throws(() => client.use(plugin), /already attached/u);
    });

    it('throws a clear error when the client is read too early', () => {
        const plugin = new RecordingPlugin();

        assert.throws(() => plugin.client, /not attached/u);
    });

    it('ignores detach when never attached', () => {
        const plugin = new RecordingPlugin();

        assert.doesNotThrow(() => plugin.detach());
        assert.equal(plugin.detachCalls, 0);
    });

    it('keeps two plugins on one client independent', () => {
        const first = new RecordingPlugin();
        const second = new RecordingPlugin();
        const client = new RocketLeagueStatsClient().use(first).use(second);

        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));
        assert.deepEqual(first.goals, ['PlayerA']);
        assert.deepEqual(second.goals, ['PlayerA']);

        client.unuse(first);
        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));
        assert.deepEqual(first.goals, ['PlayerA'], 'detaching one must not affect the other');
        assert.deepEqual(second.goals, ['PlayerA', 'PlayerA']);
    });

    it('inherits decorated handlers from a base class', () => {
        const plugin = new DerivedPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));
        client.ingest(frame('StatfeedEvent', STATFEED_EVENT_EXAMPLE));

        assert.deepEqual(plugin.seen, ['base:PlayerA', 'derived:Demolish']);
    });

    it('does not leak bindings between instances', () => {
        const first = new RecordingPlugin();
        const second = new RecordingPlugin();

        assert.equal(first.bindings.length, second.bindings.length);
        assert.notEqual(first.bindings, second.bindings);
    });

    it('reports the class name', () => {
        assert.equal(new RecordingPlugin().name, 'RecordingPlugin');
    });
});

describe('@throttle', () => {
    it('drops calls inside the window and allows them after', async () => {
        const plugin = new ThrottledPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        for (let i = 0; i < 6; i += 1) client.ingest(frame('UpdateState', tick(300 - i)));
        assert.deepEqual(plugin.ticks, [300], 'only the leading call runs');

        await delay(100);
        client.ingest(frame('UpdateState', tick(200)));
        assert.deepEqual(plugin.ticks, [300, 200], 'the window has passed');
    });

    it('keeps state per instance', () => {
        const first = new ThrottledPlugin();
        const second = new ThrottledPlugin();
        const client = new RocketLeagueStatsClient().use(first).use(second);

        client.ingest(frame('UpdateState', tick(180)));

        assert.deepEqual(first.ticks, [180]);
        assert.deepEqual(second.ticks, [180], 'one instance must not throttle another');
    });

    it('rejects a negative interval at decoration time', () => {
        assert.throws(() => throttle(-1), RangeError);
        assert.throws(() => throttle(Number.NaN), RangeError);
    });
});

describe('@bound', () => {
    it('keeps the receiver when the method is detached', () => {
        const plugin = new RecordingPlugin();
        const client = new RocketLeagueStatsClient().use(plugin);

        client.ingest(frame('GoalScored', GOAL_SCORED_EXAMPLE));

        const bare = plugin.describe;

        assert.equal(bare(), '1 goals');
    });
});

describe('listener bucket immutability', () => {
    it('is unaffected by a listener that unsubscribes mid dispatch', () => {
        const client = new RocketLeagueStatsClient();
        const calls: string[] = [];

        const first = (): void => {
            calls.push('first');
            client.off('RoundStarted', second);
        };
        const second = (): void => {
            calls.push('second');
        };

        client.on('RoundStarted', first);
        client.on('RoundStarted', second);
        client.ingest(frame('RoundStarted', { MatchGuid: MATCH_GUID }));

        assert.deepEqual(calls, ['first', 'second']);

        client.ingest(frame('RoundStarted', { MatchGuid: MATCH_GUID }));
        assert.deepEqual(
            calls,
            ['first', 'second', 'first'],
            'removal applies to the next dispatch',
        );
    });

    it('does not invoke a listener added mid dispatch', () => {
        const client = new RocketLeagueStatsClient();
        const calls: string[] = [];

        const late = (): void => {
            calls.push('late');
        };

        client.on('RoundStarted', () => {
            calls.push('early');
            client.on('RoundStarted', late);
        });

        client.ingest(frame('RoundStarted', { MatchGuid: MATCH_GUID }));
        assert.deepEqual(calls, ['early']);

        client.ingest(frame('RoundStarted', { MatchGuid: MATCH_GUID }));
        assert.deepEqual(calls, ['early', 'early', 'late']);
    });

    it('counts and clears listeners', () => {
        const client = new RocketLeagueStatsClient();
        const listener = noop;

        client.on('GoalScored', listener);
        client.on('BallHit', listener);
        assert.equal(client.listenerCount('GoalScored'), 1);

        client.off('GoalScored', listener);
        assert.equal(client.listenerCount('GoalScored'), 0);

        client.on('GoalScored', listener);
        client.removeAllListeners();
        assert.equal(client.listenerCount('GoalScored'), 0);
        assert.equal(client.listenerCount('BallHit'), 0);
    });
});
