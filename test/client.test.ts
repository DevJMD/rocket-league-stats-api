import assert from 'node:assert/strict';
import * as net from 'node:net';
import { afterEach, describe, it } from 'node:test';

import { NotConnectedError, RocketLeagueStatsClient } from '../src/index.ts';
import type { StatsApiMessage, UpdateStateData } from '../src/index.ts';
import { frame, GOAL_SCORED_EXAMPLE, MATCH_GUID, UPDATE_STATE_EXAMPLE } from './fixtures.ts';

const delay = async (ms: number): Promise<void> => {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
};

class FakeGame {
    private readonly server: net.Server;
    private connection: net.Socket | undefined;

    readonly received: string[] = [];

    private constructor(server: net.Server) {
        this.server = server;
        server.on('connection', (socket) => {
            this.connection = socket;
            socket.setEncoding('utf8');
            socket.on('data', (chunk: string) => {
                this.received.push(chunk);
            });
            socket.on('error', () => {});
        });
    }

    static async start(): Promise<FakeGame> {
        const server = net.createServer();
        const game = new FakeGame(server);

        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });

        return game;
    }

    get port(): number {
        const address = this.server.address();

        if (address === null || typeof address === 'string') {
            throw new Error('server is not listening on a TCP port');
        }

        return address.port;
    }

    write(text: string): void {
        this.connection?.write(text);
    }

    writeBytes(bytes: Buffer): void {
        this.connection?.write(bytes);
    }

    send(event: string, data: unknown): void {
        this.write(frame(event, data));
    }

    async waitForConnection(): Promise<void> {
        for (let i = 0; i < 100 && this.connection === undefined; i += 1) {
            await delay(5);
        }
    }

    dropConnection(): void {
        this.connection?.destroy();
        this.connection = undefined;
    }

    async stop(): Promise<void> {
        this.connection?.destroy();
        await new Promise<void>((resolve) => {
            this.server.close(() => {
                resolve();
            });
        });
    }
}

function parseCommands(chunks: string[]): unknown[] {
    return chunks
        .join('')
        .split('}{')
        .map((part, index, all) => {
            const prefix = index === 0 ? '' : '{';
            const suffix = index === all.length - 1 ? '' : '}';

            return JSON.parse(prefix + part + suffix) as unknown;
        });
}

function tick(timeSeconds: number): unknown {
    return {
        ...UPDATE_STATE_EXAMPLE,
        Game: { ...UPDATE_STATE_EXAMPLE.Game, TimeSeconds: timeSeconds },
    };
}

const openClients: RocketLeagueStatsClient[] = [];
const openGames: FakeGame[] = [];

async function connectedPair(
    configure: (client: RocketLeagueStatsClient) => RocketLeagueStatsClient = (c) => c,
): Promise<{ client: RocketLeagueStatsClient; game: FakeGame }> {
    const game = await FakeGame.start();

    openGames.push(game);

    const client = configure(
        new RocketLeagueStatsClient({ port: game.port, reconnect: { enabled: false } }),
    );

    openClients.push(client);

    await client.connect();
    await game.waitForConnection();

    return { client, game };
}

afterEach(async () => {
    await Promise.all(openClients.splice(0).map(async (client) => client.disconnect()));
    await Promise.all(openGames.splice(0).map(async (game) => game.stop()));
});

describe('RocketLeagueStatsClient connection', () => {
    it('connects and reports status', async () => {
        const { client } = await connectedPair();

        assert.equal(client.status, 'connected');
        assert.equal(client.connected, true);
    });

    it('emits connected with the address', async () => {
        const game = await FakeGame.start();

        openGames.push(game);

        const client = new RocketLeagueStatsClient({ port: game.port, reconnect: false });

        openClients.push(client);

        const seen: { host: string; port: number; attempt: number }[] = [];

        client.onConnected((info) => seen.push(info));
        await client.connect();

        assert.deepEqual(seen, [{ host: '127.0.0.1', port: game.port, attempt: 0 }]);
    });

    it('rejects with a helpful message when nothing is listening', async () => {
        const client = new RocketLeagueStatsClient({ port: 1, reconnect: false });

        openClients.push(client);

        await assert.rejects(
            async () => client.connect(),
            (error: unknown) =>
                error instanceof Error &&
                'code' in error &&
                error.code === 'connection_failed' &&
                /TAStatsAPI\.ini|refused/u.test(error.message),
        );
        assert.equal(client.status, 'idle');
    });

    it('emits disconnected when the game closes the socket', async () => {
        const { client, game } = await connectedPair();

        const reasons: string[] = [];

        client.onDisconnected((info) => reasons.push(info.reason));

        game.dropConnection();
        await delay(60);

        assert.deepEqual(reasons, ['remote']);
    });

    it('reports a manual disconnect distinctly', async () => {
        const { client } = await connectedPair();
        const reasons: string[] = [];

        client.onDisconnected((info) => reasons.push(info.reason));

        await client.disconnect();

        assert.deepEqual(reasons, ['manual']);
        assert.equal(client.status, 'closed');
    });

    it('refuses to change address while connected', async () => {
        const { client } = await connectedPair();

        assert.throws(() => client.port(49_999), /Disconnect first/u);
        assert.throws(() => client.host('0.0.0.0'), /Disconnect first/u);
    });

    it('validates the port up front', () => {
        const client = new RocketLeagueStatsClient();

        assert.throws(() => client.port(0), /between 1 and 65535/u);
        assert.throws(() => client.port(70_000), /between 1 and 65535/u);
        assert.throws(() => client.port(1.5), /between 1 and 65535/u);
    });
});

describe('RocketLeagueStatsClient events', () => {
    it('delivers typed payloads to listeners', async () => {
        const { client, game } = await connectedPair();

        const scorers: string[] = [];

        client.on('GoalScored', (goal) => {
            scorers.push(goal.Scorer.Name);
        });

        game.send('GoalScored', GOAL_SCORED_EXAMPLE);
        await delay(30);

        assert.deepEqual(scorers, ['PlayerA']);
    });

    it('passes the full message alongside the payload', async () => {
        const { client, game } = await connectedPair();

        const messages: StatsApiMessage[] = [];

        client.on('RoundStarted', (_data, message) => {
            messages.push(message);
        });

        game.send('RoundStarted', { MatchGuid: MATCH_GUID, Undocumented: 1 });
        await delay(30);

        assert.equal(messages.length, 1);
        assert.equal(messages[0]?.event, 'RoundStarted');
        assert.equal(messages[0]?.raw['Undocumented'], 1);
    });

    it('splits frames that arrive glued together in one packet', async () => {
        const { client, game } = await connectedPair();

        const order: string[] = [];

        client.onMessage((message) => order.push(message.event));

        game.write(
            frame('MatchCreated', { MatchGuid: MATCH_GUID }) +
                frame('CountdownBegin', { MatchGuid: MATCH_GUID }) +
                frame('RoundStarted', { MatchGuid: MATCH_GUID }),
        );
        await delay(30);

        assert.deepEqual(order, ['MatchCreated', 'CountdownBegin', 'RoundStarted']);
    });

    it('reassembles a frame split across packets', async () => {
        const { client, game } = await connectedPair();

        const seen: string[] = [];

        client.on('GoalScored', (goal) => seen.push(goal.Scorer.Name));

        const whole = frame('GoalScored', GOAL_SCORED_EXAMPLE);
        const cut = Math.floor(whole.length / 2);

        game.write(whole.slice(0, cut));
        await delay(20);
        assert.deepEqual(seen, [], 'half a frame must not dispatch');

        game.write(whole.slice(cut));
        await delay(30);
        assert.deepEqual(seen, ['PlayerA']);
    });

    it('keeps multi byte characters intact across a packet boundary', async () => {
        const { client, game } = await connectedPair();

        const names: string[] = [];

        client.on('PlayerJoined', (joined) => names.push(joined.PlayerName));

        const name = 'Ünïcödé 🚀 Player';
        const whole = frame('PlayerJoined', { PlayerName: name, PrimaryId: 'Steam|1|0' });
        const bytes = Buffer.from(whole, 'utf8');
        const emojiAt = bytes.indexOf(Buffer.from('🚀', 'utf8'));

        game.writeBytes(bytes.subarray(0, emojiAt + 2));
        await delay(10);
        game.writeBytes(bytes.subarray(emojiAt + 2));
        await delay(30);

        assert.deepEqual(names, [name]);
    });

    it('emits an error for an invalid payload and drops the message', async () => {
        const { client, game } = await connectedPair();

        const errors: string[] = [];
        const delivered: string[] = [];

        client.onError((error) => errors.push(error.code));
        client.on('GoalScored', (goal) => delivered.push(goal.Scorer.Name));

        game.send('GoalScored', { ...GOAL_SCORED_EXAMPLE, GoalSpeed: 'fast' });
        await delay(30);

        assert.deepEqual(errors, ['invalid_payload']);
        assert.deepEqual(delivered, [], 'a payload that failed validation must not be delivered');
    });

    it('forwards an unknown event instead of dropping it', async () => {
        const { client, game } = await connectedPair();

        const unknown: string[] = [];

        client.on('unknownEvent', (info) => unknown.push(info.event));

        game.send('SomeFutureEvent', { MatchGuid: MATCH_GUID });
        await delay(30);

        assert.deepEqual(unknown, ['SomeFutureEvent']);
    });

    it('emits a warning without dropping the message', async () => {
        const { client, game } = await connectedPair();

        const warnings: string[] = [];
        const delivered: number[] = [];

        client.on('warning', (info) => warnings.push(info.event));
        client.on('MatchEnded', (data) => delivered.push(data.WinnerTeamNum));

        game.send('MatchEnded', { MatchGuid: MATCH_GUID, WinnerTeamNum: 7 });
        await delay(30);

        assert.deepEqual(warnings, ['MatchEnded']);
        assert.equal(delivered.length, 1);
    });

    it('survives a malformed frame and keeps processing the next one', async () => {
        const { client, game } = await connectedPair();

        const errors: string[] = [];
        const seen: string[] = [];

        client.onError((error) => errors.push(error.code));
        client.onMessage((message) => seen.push(message.event));

        game.write('{"Event":"GoalScored","Data":{oops}}');
        game.send('RoundStarted', { MatchGuid: MATCH_GUID });
        await delay(40);

        assert.deepEqual(errors, ['malformed_frame']);
        assert.deepEqual(seen, ['RoundStarted'], 'a bad frame must not desynchronise the stream');
    });

    it('removes listeners with off', async () => {
        const { client, game } = await connectedPair();

        const seen: string[] = [];
        const listener = (data: { Scorer: { Name: string } }): void => {
            seen.push(data.Scorer.Name);
        };

        client.on('GoalScored', listener);
        client.off('GoalScored', listener);

        game.send('GoalScored', GOAL_SCORED_EXAMPLE);
        await delay(30);

        assert.deepEqual(seen, []);
    });

    it('resolves once with the next occurrence', async () => {
        const { client, game } = await connectedPair();

        const pending = client.once('GoalScored');

        game.send('GoalScored', GOAL_SCORED_EXAMPLE);

        const goal = await pending;

        assert.equal(goal.Scorer.Name, 'PlayerA');
    });
});

describe('RocketLeagueStatsClient tick rate', () => {
    it('delivers every tick when no interval is set', async () => {
        const { client, game } = await connectedPair();

        const times: number[] = [];

        client.on('UpdateState', (data) => times.push(data.Game.TimeSeconds));

        for (let i = 0; i < 5; i += 1) game.send('UpdateState', tick(300 - i));
        await delay(40);

        assert.deepEqual(times, [300, 299, 298, 297, 296]);
    });

    it('throttles ticks to the configured interval', async () => {
        const { client, game } = await connectedPair((c) => c.tickInterval(80));

        const times: number[] = [];

        client.on('UpdateState', (data) => times.push(data.Game.TimeSeconds));

        for (let i = 0; i < 10; i += 1) game.send('UpdateState', tick(300 - i));
        await delay(30);

        assert.equal(times.length, 1, `expected one immediate tick, got ${times.length}`);
        assert.equal(times[0], 300);
    });

    it('delivers the freshest held tick when the interval elapses', async () => {
        const { client, game } = await connectedPair((c) => c.tickInterval(60));

        const times: number[] = [];

        client.on('UpdateState', (data) => times.push(data.Game.TimeSeconds));

        for (let i = 0; i < 10; i += 1) game.send('UpdateState', tick(300 - i));
        await delay(140);

        assert.equal(times.length, 2, `expected two deliveries, got ${times.join(', ')}`);
        assert.equal(times[0], 300, 'first tick is delivered immediately');
        assert.equal(times[1], 291, 'the held tick must be the newest, not a stale queued one');
    });

    it('keeps the snapshot fresh even while throttling holds events back', async () => {
        const { client, game } = await connectedPair((c) => c.tickInterval(1000));

        const times: number[] = [];

        client.on('UpdateState', (data) => times.push(data.Game.TimeSeconds));

        for (let i = 0; i < 6; i += 1) game.send('UpdateState', tick(300 - i));
        await delay(40);

        assert.equal(times.length, 1, 'throttling holds the rest back');
        assert.equal(client.snapshot?.Game.TimeSeconds, 295, 'snapshot tracks the newest tick');
    });

    it('never throttles non tick events', async () => {
        const { client, game } = await connectedPair((c) => c.tickInterval(1000));

        const events: string[] = [];

        client.onMessage((message) => events.push(message.event));

        game.send('UpdateState', tick(300));

        for (let i = 0; i < 3; i += 1)
            game.send('BallHit', {
                MatchGuid: MATCH_GUID,
                Players: [{ Name: 'PlayerA', Shortcut: 1, TeamNum: 0 }],
                Ball: { PreHitSpeed: 0, PostHitSpeed: 100, Location: { X: 0, Y: 0, Z: 0 } },
            });

        await delay(40);

        assert.deepEqual(events, ['UpdateState', 'BallHit', 'BallHit', 'BallHit']);
    });

    it('converts a tick rate into an interval', async () => {
        const { client, game } = await connectedPair((c) => c.tickRate(20));

        const times: number[] = [];

        client.on('UpdateState', (data) => times.push(data.Game.TimeSeconds));

        for (let i = 0; i < 8; i += 1) game.send('UpdateState', tick(300 - i));
        await delay(30);

        assert.equal(times.length, 1);
    });

    it('rejects nonsensical rates', () => {
        const client = new RocketLeagueStatsClient();

        assert.throws(() => client.tickInterval(-1), RangeError);
        assert.throws(() => client.tickRate(0), RangeError);
        assert.throws(() => client.tickRate(121), /120/u);
    });
});

describe('RocketLeagueStatsClient streaming', () => {
    it('yields messages through an async iterator', async () => {
        const { client, game } = await connectedPair();

        const collected: string[] = [];
        const consume = (async (): Promise<void> => {
            for await (const message of client.stream()) {
                collected.push(message.event);
                if (collected.length === 3) break;
            }
        })();

        game.send('MatchCreated', { MatchGuid: MATCH_GUID });
        game.send('CountdownBegin', { MatchGuid: MATCH_GUID });
        game.send('RoundStarted', { MatchGuid: MATCH_GUID });

        await consume;
        assert.deepEqual(collected, ['MatchCreated', 'CountdownBegin', 'RoundStarted']);
    });

    it('stops when the signal aborts', async () => {
        const { client } = await connectedPair();
        const controller = new AbortController();

        const consume = (async (): Promise<number> => {
            let count = 0;

            for await (const message of client.stream({ signal: controller.signal })) {
                void message;
                count += 1;
            }

            return count;
        })();

        controller.abort();
        assert.equal(await consume, 0);
    });

    it('drops the oldest message when a slow consumer fills the buffer', async () => {
        const { client, game } = await connectedPair();

        const iterator = client.stream({ bufferSize: 2 })[Symbol.asyncIterator]();

        game.send('MatchCreated', { MatchGuid: MATCH_GUID });
        game.send('CountdownBegin', { MatchGuid: MATCH_GUID });
        game.send('RoundStarted', { MatchGuid: MATCH_GUID });
        await delay(40);

        const first = await iterator.next();
        const second = await iterator.next();

        await iterator.return();

        assert.equal(first.value?.event, 'CountdownBegin', 'oldest message is dropped');
        assert.equal(second.value?.event, 'RoundStarted');
    });
});

describe('RocketLeagueStatsClient commands', () => {
    it('writes a command envelope to the socket', async () => {
        const { client, game } = await connectedPair();

        client.setGameSpeed(0.5);
        await delay(30);

        assert.deepEqual(parseCommands(game.received), [
            { Command: 'SetGameSpeed', Data: { Speed: 0.5 } },
        ]);
    });

    it('supports the spectator helpers', async () => {
        const { client, game } = await connectedPair();

        client.watchBall('SoftAttach').watchPlayer(3, 'PlayerView').setHudVisibility(false);
        await delay(30);

        assert.deepEqual(parseCommands(game.received), [
            { Command: 'ChangePOV', Data: { Focus: 'Ball', Perspective: 'SoftAttach' } },
            { Command: 'ChangePOV', Data: { Focus: '3', Perspective: 'PlayerView' } },
            { Command: 'SetHUDVisibility', Data: { bVisible: false } },
        ]);
    });

    it('chains because commands return the client', async () => {
        const { client } = await connectedPair();

        assert.equal(client.setMatchPaused(true), client);
    });

    it('throws when sending without a connection', () => {
        const client = new RocketLeagueStatsClient();

        assert.throws(() => client.setGameSpeed(1), NotConnectedError);
    });

    it('rejects an invalid command before writing anything', async () => {
        const { client, game } = await connectedPair();

        assert.throws(() => client.watchPlayer(-1), RangeError);
        await delay(20);
        assert.deepEqual(game.received, []);
    });
});

describe('RocketLeagueStatsClient ingest', () => {
    it('accepts text directly, for bridging another transport', () => {
        const client = new RocketLeagueStatsClient();
        const seen: UpdateStateData[] = [];

        client.on('UpdateState', (data) => seen.push(data));

        client.ingest(frame('UpdateState', UPDATE_STATE_EXAMPLE));

        assert.equal(seen.length, 1);
        assert.equal(seen[0]?.Game.PlaylistId, 11);
    });
});
