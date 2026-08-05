import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeFrame, parsePrimaryId, STATS_API_EVENTS } from '../src/index.ts';
import type { StatsApiMessage } from '../src/index.ts';
import {
    BALL_HIT_EXAMPLE,
    BOOST_PICKUP_EXAMPLE,
    CLOCK_UPDATED_EXAMPLE,
    CROSSBAR_HIT_EXAMPLE,
    frame,
    frameWithEncodedData,
    GOAL_SCORED_EXAMPLE,
    MATCH_ENDED_EXAMPLE,
    MATCH_GUID,
    PLAYER_JOINED_EXAMPLE,
    REPLAY_CREATED_EXAMPLE,
    STATFEED_EVENT_EXAMPLE,
    UPDATE_STATE_EXAMPLE,
} from './fixtures.ts';

function decodeOk(raw: string): StatsApiMessage {
    const result = decodeFrame(raw);

    assert.equal(
        result.kind,
        'message',
        `expected a valid message but got ${result.kind}: ${JSON.stringify(result)}`,
    );
    if (result.kind !== 'message') throw new Error('unreachable');
    assert.deepEqual(result.warnings, [], 'official examples must not produce warnings');

    return result.message;
}

describe('decodeFrame with official examples', () => {
    it('decodes the UpdateState tick', () => {
        const message = decodeOk(frame('UpdateState', UPDATE_STATE_EXAMPLE));

        assert.equal(message.event, 'UpdateState');
        if (message.event !== 'UpdateState') throw new Error('unreachable');

        const { data } = message;

        assert.equal(data.MatchGuid, MATCH_GUID);
        assert.equal(data.Players.length, 1);

        const player = data.Players[0];

        assert.ok(player);
        assert.equal(player.Name, 'PlayerA');
        assert.equal(player.Score, 125);
        assert.equal(player.TeamNum, 0);
        assert.deepEqual(
            [...player.Loadout],
            ['body_grain', 'Skin_bartees', 'Wheel_SoccerBall', 'Boost_AlphaReward', 'None', 'None'],
        );
        assert.equal(player.PickupClass, 'SpecialPickup_GrapplingHook_TA');
        assert.equal(player.bDemolished, true);
        assert.equal(player.Attacker?.Name, 'PlayerB');
        assert.equal(player.Attacker?.TeamNum, 1);

        assert.equal(data.Game.PlaylistId, 11);
        assert.equal(data.Game.TimeSeconds, 180);
        assert.equal(data.Game.Arena, 'Stadium_P');
        assert.equal(data.Game.Ball.Speed, 850.5);
        assert.equal(data.Game.Ball.TeamNum, 0);
        assert.equal(data.Game.Teams[0]?.ColorPrimary, '0000FF');
        assert.equal(data.Game.Frame, 120);
        assert.equal(data.Game.Elapsed, 50.2);
        assert.equal(data.Game.Target?.Shortcut, 1);
    });

    it('decodes BallHit', () => {
        const message = decodeOk(frame('BallHit', BALL_HIT_EXAMPLE));

        if (message.event !== 'BallHit') throw new Error('unreachable');
        assert.equal(message.data.Players[0]?.Name, 'PlayerA');
        assert.equal(message.data.Ball.PreHitSpeed, 0);
        assert.equal(message.data.Ball.PostHitSpeed, 1450.2);
        assert.deepEqual(message.data.Ball.Location, { X: -512, Y: 100, Z: 200 });
    });

    it('decodes BoostPickup', () => {
        const message = decodeOk(frame('BoostPickup', BOOST_PICKUP_EXAMPLE));

        if (message.event !== 'BoostPickup') throw new Error('unreachable');
        assert.equal(message.data.BoostType, 'BoostType_Pill');
        assert.equal(message.data.BoostAmount, 100);
        assert.equal(message.data.bReplay, false);
        assert.equal(message.data.Player.Name, 'PlayerA');
    });

    it('decodes CrossbarHit', () => {
        const message = decodeOk(frame('CrossbarHit', CROSSBAR_HIT_EXAMPLE));

        if (message.event !== 'CrossbarHit') throw new Error('unreachable');
        assert.equal(message.data.ImpactForce, 127.5);
        assert.equal(message.data.BallLastTouch.Player.Name, 'PlayerA');
        assert.equal(message.data.BallLastTouch.Speed, 120);
    });

    it('decodes GoalScored including the optional assister', () => {
        const message = decodeOk(frame('GoalScored', GOAL_SCORED_EXAMPLE));

        if (message.event !== 'GoalScored') throw new Error('unreachable');
        assert.equal(message.data.Scorer.Name, 'PlayerA');
        assert.equal(message.data.Assister?.Name, 'PlayerC');
        assert.equal(message.data.GoalTime, 127.5);
        assert.equal(message.data.BallLastTouch.Speed, 125);
    });

    it('omits the assister when no assist was recorded', () => {
        const { Assister: _ignored, ...noAssist } = GOAL_SCORED_EXAMPLE;
        const message = decodeOk(frame('GoalScored', noAssist));

        if (message.event !== 'GoalScored') throw new Error('unreachable');
        assert.equal(message.data.Assister, undefined);
        assert.equal(
            'Assister' in message.data,
            false,
            'absent fields must not be added as undefined',
        );
    });

    it('decodes MatchEnded', () => {
        const message = decodeOk(frame('MatchEnded', MATCH_ENDED_EXAMPLE));

        if (message.event !== 'MatchEnded') throw new Error('unreachable');
        assert.equal(message.data.WinnerTeamNum, 0);
    });

    it('decodes ClockUpdatedSeconds', () => {
        const message = decodeOk(frame('ClockUpdatedSeconds', CLOCK_UPDATED_EXAMPLE));

        if (message.event !== 'ClockUpdatedSeconds') throw new Error('unreachable');
        assert.equal(message.data.TimeSeconds, 180);
        assert.equal(message.data.bOvertime, false);
    });

    it('decodes PlayerJoined and PlayerLeft', () => {
        for (const event of ['PlayerJoined', 'PlayerLeft'] as const) {
            const message = decodeOk(frame(event, PLAYER_JOINED_EXAMPLE));

            if (message.event !== 'PlayerJoined' && message.event !== 'PlayerLeft') {
                throw new Error('unreachable');
            }

            assert.equal(message.data.PlayerName, 'PlayerA');
            assert.equal(message.data.PrimaryId, 'Steam|123|0');
        }
    });

    it('decodes ReplayCreated with its file details', () => {
        const message = decodeOk(frame('ReplayCreated', REPLAY_CREATED_EXAMPLE));

        if (message.event !== 'ReplayCreated') throw new Error('unreachable');
        assert.equal(message.data.FileName, 'Stadium_P_2026-06-05_18-42');
        assert.equal(message.data.Date, '2026-06-05 18:42:13');
    });

    it('decodes StatfeedEvent', () => {
        const message = decodeOk(frame('StatfeedEvent', STATFEED_EVENT_EXAMPLE));

        if (message.event !== 'StatfeedEvent') throw new Error('unreachable');
        assert.equal(message.data.EventName, 'Demolish');
        assert.equal(message.data.Type, 'Demolition');
        assert.equal(message.data.SecondaryTarget?.Name, 'PlayerB');
    });

    it('decodes every lifecycle event that carries only a MatchGuid', () => {
        const lifecycle = [
            'CountdownBegin',
            'GoalReplayEnd',
            'GoalReplayStart',
            'GoalReplayWillEnd',
            'MatchCreated',
            'MatchDestroyed',
            'MatchInitialized',
            'MatchPaused',
            'MatchUnpaused',
            'PodiumStart',
            'RoundStarted',
        ] as const;

        for (const event of lifecycle) {
            const message = decodeOk(frame(event, { MatchGuid: MATCH_GUID }));

            assert.equal(message.event, event);
            assert.equal(message.data.MatchGuid, MATCH_GUID);
        }
    });

    it('covers every documented event name', () => {
        const lifecyclePayload = { MatchGuid: MATCH_GUID };
        const payloads: Record<string, unknown> = {
            UpdateState: UPDATE_STATE_EXAMPLE,
            BallHit: BALL_HIT_EXAMPLE,
            BoostPickup: BOOST_PICKUP_EXAMPLE,
            ClockUpdatedSeconds: CLOCK_UPDATED_EXAMPLE,
            CrossbarHit: CROSSBAR_HIT_EXAMPLE,
            GoalScored: GOAL_SCORED_EXAMPLE,
            MatchEnded: MATCH_ENDED_EXAMPLE,
            PlayerJoined: PLAYER_JOINED_EXAMPLE,
            PlayerLeft: PLAYER_JOINED_EXAMPLE,
            ReplayCreated: REPLAY_CREATED_EXAMPLE,
            StatfeedEvent: STATFEED_EVENT_EXAMPLE,
        };

        for (const event of STATS_API_EVENTS) {
            const payload = payloads[event] ?? lifecyclePayload;
            const result = decodeFrame(frame(event, payload));

            assert.equal(result.kind, 'message', `${event} failed to decode`);
        }
    });
});

describe('decodeFrame envelope handling', () => {
    it('accepts Data as a JSON encoded string', () => {
        const message = decodeOk(frameWithEncodedData('GoalScored', GOAL_SCORED_EXAMPLE));

        if (message.event !== 'GoalScored') throw new Error('unreachable');
        assert.equal(message.data.Scorer.Name, 'PlayerA');
    });

    it('treats a missing Data as an empty payload', () => {
        const result = decodeFrame(JSON.stringify({ Event: 'RoundStarted' }));

        assert.equal(result.kind, 'message');
    });

    it('exposes the raw payload so undocumented fields stay reachable', () => {
        const message = decodeOk(frame('RoundStarted', { MatchGuid: MATCH_GUID, FutureField: 42 }));

        assert.equal(message.raw['FutureField'], 42);
        assert.equal('FutureField' in message.data, false, 'typed payload stays exactly typed');
    });

    it('reports an unknown event without throwing', () => {
        const result = decodeFrame(frame('SomeFutureEvent', { MatchGuid: MATCH_GUID }));

        assert.equal(result.kind, 'unknown-event');
        if (result.kind !== 'unknown-event') throw new Error('unreachable');
        assert.equal(result.event, 'SomeFutureEvent');
        assert.equal(result.raw['MatchGuid'], MATCH_GUID);
    });

    it('reports malformed JSON without throwing', () => {
        const result = decodeFrame('{"Event":"GoalScored","Data":{oops}}');

        assert.equal(result.kind, 'malformed');
    });

    it('rejects an envelope with no Event field', () => {
        const result = decodeFrame(JSON.stringify({ Data: {} }));

        assert.equal(result.kind, 'malformed');
        if (result.kind !== 'malformed') throw new Error('unreachable');
        assert.match(result.reason, /Event/u);
    });

    it('rejects a non object envelope', () => {
        assert.equal(decodeFrame('[1,2,3]').kind, 'malformed');
        assert.equal(decodeFrame('"a string"').kind, 'malformed');
    });
});

describe('decodeFrame validation', () => {
    it('rejects a payload whose required field has the wrong type', () => {
        const result = decodeFrame(
            frame('GoalScored', { ...GOAL_SCORED_EXAMPLE, GoalSpeed: 'fast' }),
        );

        assert.equal(result.kind, 'invalid');
        if (result.kind !== 'invalid') throw new Error('unreachable');
        assert.equal(result.event, 'GoalScored');
        assert.ok(
            result.issues.some((issue) => issue.path === 'GoalSpeed' && issue.severity === 'error'),
            `expected an error on GoalSpeed, got ${JSON.stringify(result.issues)}`,
        );
    });

    it('reports a full path for a nested failure', () => {
        const result = decodeFrame(
            frame('UpdateState', {
                ...UPDATE_STATE_EXAMPLE,
                Game: { ...UPDATE_STATE_EXAMPLE.Game, Ball: { Speed: 'quick', TeamNum: 0 } },
            }),
        );

        assert.equal(result.kind, 'invalid');
        if (result.kind !== 'invalid') throw new Error('unreachable');
        assert.ok(
            result.issues.some((issue) => issue.path === 'Game.Ball.Speed'),
            `expected Game.Ball.Speed, got ${JSON.stringify(result.issues)}`,
        );
    });

    it('reports an array index in the path', () => {
        const result = decodeFrame(
            frame('UpdateState', {
                ...UPDATE_STATE_EXAMPLE,
                Players: [{ ...UPDATE_STATE_EXAMPLE.Players[0], Score: null }],
            }),
        );

        assert.equal(result.kind, 'invalid');
        if (result.kind !== 'invalid') throw new Error('unreachable');
        assert.ok(
            result.issues.some((issue) => issue.path === 'Players[0].Score'),
            `expected Players[0].Score, got ${JSON.stringify(result.issues)}`,
        );
    });

    it('collects every problem in one pass rather than stopping at the first', () => {
        const result = decodeFrame(
            frame('GoalScored', { ...GOAL_SCORED_EXAMPLE, GoalSpeed: 'x', GoalTime: 'y' }),
        );

        assert.equal(result.kind, 'invalid');
        if (result.kind !== 'invalid') throw new Error('unreachable');

        const paths = new Set(result.issues.map((issue) => issue.path));

        assert.ok(paths.has('GoalSpeed'));
        assert.ok(paths.has('GoalTime'));
    });

    it('rejects a missing required field', () => {
        const { GoalSpeed: _ignored, ...missing } = GOAL_SCORED_EXAMPLE;
        const result = decodeFrame(frame('GoalScored', missing));

        assert.equal(result.kind, 'invalid');
        if (result.kind !== 'invalid') throw new Error('unreachable');
        assert.ok(result.issues.some((issue) => issue.message.includes('missing required')));
    });

    it('accepts an untouched ball reported as team 255', () => {
        const message = decodeOk(
            frame('UpdateState', {
                ...UPDATE_STATE_EXAMPLE,
                Game: { ...UPDATE_STATE_EXAMPLE.Game, Ball: { Speed: 0, TeamNum: 255 } },
            }),
        );

        if (message.event !== 'UpdateState') throw new Error('unreachable');
        assert.equal(message.data.Game.Ball.TeamNum, 255);
    });

    it('warns but still delivers when a team index is outside the documented range', () => {
        const result = decodeFrame(
            frame('MatchEnded', { MatchGuid: MATCH_GUID, WinnerTeamNum: 7 }),
        );

        assert.equal(result.kind, 'message', 'an unexpected team index must not drop the message');
        if (result.kind !== 'message') throw new Error('unreachable');
        assert.equal(result.warnings.length, 1);
        assert.equal(result.warnings[0]?.severity, 'warning');
        assert.equal(result.warnings[0]?.path, 'WinnerTeamNum');
    });

    it('does not mistake a spectator only field for a required one', () => {
        const player = {
            Name: 'PlayerA',
            PrimaryId: 'Steam|123|0',
            Shortcut: 1,
            TeamNum: 0,
            Score: 125,
            Goals: 1,
            Shots: 2,
            Assists: 0,
            Saves: 1,
            Touches: 14,
            CarTouches: 3,
            Demos: 0,
            Loadout: ['body_grain', 'None', 'None', 'None', 'None', 'None'],
        };
        const message = decodeOk(
            frame('UpdateState', { ...UPDATE_STATE_EXAMPLE, Players: [player] }),
        );

        if (message.event !== 'UpdateState') throw new Error('unreachable');

        const decoded = message.data.Players[0];

        assert.ok(decoded);
        assert.equal(decoded.Speed, undefined);
        assert.equal(decoded.Boost, undefined);
        assert.equal(decoded.Attacker, undefined);
    });

    it('stamps a receivedAt timestamp', () => {
        const before = Date.now();
        const message = decodeOk(frame('RoundStarted', {}));

        assert.ok(message.receivedAt >= before);
    });
});

describe('parsePrimaryId', () => {
    it('splits the documented format', () => {
        assert.deepEqual(parsePrimaryId('Steam|123|0'), {
            platform: 'Steam',
            uid: '123',
            splitscreen: 0,
            raw: 'Steam|123|0',
        });
        assert.deepEqual(parsePrimaryId('Epic|456|1'), {
            platform: 'Epic',
            uid: '456',
            splitscreen: 1,
            raw: 'Epic|456|1',
        });
    });

    it('returns undefined for anything else', () => {
        assert.equal(parsePrimaryId('76561198000000000'), undefined);
        assert.equal(parsePrimaryId('Steam|123'), undefined);
        assert.equal(parsePrimaryId('Steam|123|x'), undefined);
        assert.equal(parsePrimaryId('|123|0'), undefined);
        assert.equal(parsePrimaryId(''), undefined);
    });
});
