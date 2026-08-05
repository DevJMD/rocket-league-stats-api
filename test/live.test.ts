import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeFrame, parsePrimaryId, RocketLeagueStatsClient } from '../src/index.ts';
import type { StatsApiMessage } from '../src/index.ts';
import { LIVE_BALL_HIT, LIVE_GOAL, LIVE_STATFEED, LIVE_TICK, liveFrame } from './live-capture.ts';

function decodeOk(raw: string): StatsApiMessage {
    const result = decodeFrame(raw);

    assert.equal(result.kind, 'message', `expected a message, got ${JSON.stringify(result)}`);

    if (result.kind !== 'message') throw new Error('unreachable');

    assert.deepEqual(result.warnings, [], 'live data must not produce warnings');

    return result.message;
}

describe('live capture from a running game', () => {
    it('decodes the double encoded envelope the game actually sends', () => {
        const frame = liveFrame('UpdateState', LIVE_TICK);
        const envelope = JSON.parse(frame) as { Data: unknown };

        assert.equal(typeof envelope.Data, 'string', 'the real game sends Data as a JSON string');

        const message = decodeOk(frame);

        assert.equal(message.event, 'UpdateState');
    });

    it('decodes a six player tick', () => {
        const message = decodeOk(liveFrame('UpdateState', LIVE_TICK));

        if (message.event !== 'UpdateState') throw new Error('unreachable');

        assert.equal(message.data.Players.length, 6);
        assert.equal(message.data.Game.PlaylistId, 6);
        assert.equal(message.data.Game.Arena, 'STADIUM_10A_P');
        assert.equal(message.data.Game.Teams.length, 2);
    });

    it('accepts a loadout far longer than the documented example', () => {
        const message = decodeOk(liveFrame('UpdateState', LIVE_TICK));

        if (message.event !== 'UpdateState') throw new Error('unreachable');

        const player = message.data.Players[0];

        assert.ok(player);
        assert.equal(player.Loadout.length, 28, 'the published example shows six entries');
        assert.ok(player.Loadout.includes('None'), 'unused slots are the string None');
    });

    it('treats absent spectator flags as undefined rather than false', () => {
        const message = decodeOk(liveFrame('UpdateState', LIVE_TICK));

        if (message.event !== 'UpdateState') throw new Error('unreachable');

        const player = message.data.Players[0];

        assert.ok(player);
        assert.equal(player.bDemolished, undefined);
        assert.equal(player.Attacker, undefined);
        assert.equal('bDemolished' in player, false);
    });

    it('reads a team colour with no leading hash', () => {
        const message = decodeOk(liveFrame('UpdateState', LIVE_TICK));

        if (message.event !== 'UpdateState') throw new Error('unreachable');

        const team = message.data.Game.Teams[0];

        assert.ok(team);
        assert.match(team.ColorPrimary, /^[0-9A-Fa-f]{6}$/u);
    });

    it('parses a real account id and recognises the bot placeholder', () => {
        const message = decodeOk(liveFrame('UpdateState', LIVE_TICK));

        if (message.event !== 'UpdateState') throw new Error('unreachable');

        const ids = new Set(message.data.Players.map((player) => player.PrimaryId));

        assert.ok(ids.has('Unknown|0|0'), 'bots share a placeholder id');

        const bot = parsePrimaryId('Unknown|0|0');

        assert.equal(bot?.platform, 'Unknown');

        const real = [...ids].find((id) => id.startsWith('Steam|'));

        assert.ok(real);
        assert.equal(parsePrimaryId(real)?.platform, 'Steam');
    });

    it('decodes an unattributed goal without failing validation', () => {
        const message = decodeOk(liveFrame('GoalScored', LIVE_GOAL));

        if (message.event !== 'GoalScored') throw new Error('unreachable');

        assert.equal(message.data.Scorer.Name, '');
        assert.equal(message.data.Scorer.Shortcut, 0);
        assert.equal(message.data.Assister, undefined);
        assert.ok(message.data.BallLastTouch.Player.Name.length > 0);
    });

    it('decodes a ball hit credited to two players in one frame', () => {
        const message = decodeOk(liveFrame('BallHit', LIVE_BALL_HIT));

        if (message.event !== 'BallHit') throw new Error('unreachable');

        assert.equal(message.data.Players.length, 2, 'Players is an array for a reason');
        assert.ok(message.data.Ball.PostHitSpeed > 0);
    });

    it('keeps the localized statfeed label separate from the stable name', () => {
        const message = decodeOk(liveFrame('StatfeedEvent', LIVE_STATFEED));

        if (message.event !== 'StatfeedEvent') throw new Error('unreachable');

        assert.equal(message.data.EventName, 'Shot');
        assert.equal(message.data.Type, 'Shot on Goal');
        assert.notEqual(message.data.EventName, message.data.Type);
        assert.equal(message.data.SecondaryTarget, undefined);
    });

    it('drives the whole client from real frames', () => {
        const client = new RocketLeagueStatsClient();
        const seen: string[] = [];

        client.onMessage((message) => seen.push(message.event));

        client.ingest(
            liveFrame('UpdateState', LIVE_TICK) +
                liveFrame('BallHit', LIVE_BALL_HIT) +
                liveFrame('StatfeedEvent', LIVE_STATFEED) +
                liveFrame('GoalScored', LIVE_GOAL),
        );

        assert.deepEqual(seen, ['UpdateState', 'BallHit', 'StatfeedEvent', 'GoalScored']);
        assert.equal(client.snapshot?.Players.length, 6);
    });
});
