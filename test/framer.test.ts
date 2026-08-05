import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JsonFrameBuffer } from '../src/index.ts';
import { frame, UPDATE_STATE_EXAMPLE } from './fixtures.ts';

describe('JsonFrameBuffer', () => {
    it('splits several objects delivered in one chunk', () => {
        const buffer = new JsonFrameBuffer();

        buffer.push(
            frame('MatchCreated', {}) + frame('RoundStarted', {}) + frame('PodiumStart', {}),
        );

        const frames = buffer.drain();

        assert.equal(frames.length, 3);
        assert.deepEqual(
            frames.map((raw) => (JSON.parse(raw) as { Event: string }).Event),
            ['MatchCreated', 'RoundStarted', 'PodiumStart'],
        );
        assert.equal(buffer.pending, 0);
    });

    it('reassembles an object split across chunks', () => {
        const buffer = new JsonFrameBuffer();
        const whole = frame('UpdateState', UPDATE_STATE_EXAMPLE);
        const cut = Math.floor(whole.length / 2);

        buffer.push(whole.slice(0, cut));
        assert.deepEqual(buffer.drain(), [], 'half an object must not produce a frame');
        assert.ok(buffer.pending > 0);

        buffer.push(whole.slice(cut));
        assert.deepEqual(buffer.drain(), [whole]);
        assert.equal(buffer.pending, 0);
    });

    it('ignores braces and quotes inside string values', () => {
        const buffer = new JsonFrameBuffer();

        const hostile = frame('PlayerJoined', {
            PlayerName: '{"}}{{ "quoted" \\" name }',
            PrimaryId: 'Steam|1|0',
        });

        buffer.push(hostile);

        const frames = buffer.drain();

        assert.equal(frames.length, 1);

        const parsed = JSON.parse(frames[0] ?? '') as { Data: { PlayerName: string } };

        assert.equal(parsed.Data.PlayerName, '{"}}{{ "quoted" \\" name }');
    });

    it('splits correctly when a chunk boundary lands inside a string literal', () => {
        const buffer = new JsonFrameBuffer();
        const whole = frame('PlayerJoined', { PlayerName: 'a{b}c', PrimaryId: 'Steam|1|0' });
        const boundary = whole.indexOf('a{b}c') + 2;

        buffer.push(whole.slice(0, boundary));
        assert.deepEqual(buffer.drain(), []);
        buffer.push(whole.slice(boundary));

        assert.deepEqual(buffer.drain(), [whole]);
    });

    it('resynchronises after stray text between objects', () => {
        const buffer = new JsonFrameBuffer();

        buffer.push(`}}garbage${frame('RoundStarted', {})}`);

        const frames = buffer.drain();

        assert.equal(frames.length, 1);
        assert.equal((JSON.parse(frames[0] ?? '') as { Event: string }).Event, 'RoundStarted');
    });

    it('handles one byte at a time', () => {
        const buffer = new JsonFrameBuffer();
        const whole = frame('GoalScored', { GoalSpeed: 1 });

        const collected: string[] = [];

        for (const char of whole) {
            buffer.push(char);
            collected.push(...buffer.drain());
        }

        assert.deepEqual(collected, [whole]);
    });

    it('stays correct across the compaction threshold', () => {
        const buffer = new JsonFrameBuffer();
        const unit = frame('RoundStarted', { MatchGuid: 'x'.repeat(256) });
        const count = Math.ceil((80 * 1024) / unit.length);

        buffer.push(unit.repeat(count));
        assert.equal(buffer.drain().length, count);

        const partial = frame('GoalScored', { GoalSpeed: 1234, Note: 'tail{}' });
        const cut = Math.floor(partial.length / 2);

        buffer.push(partial.slice(0, cut));
        assert.deepEqual(buffer.drain(), []);
        buffer.push(partial.slice(cut));

        assert.deepEqual(buffer.drain(), [partial]);
        assert.equal(buffer.pending, 0);
    });

    it('interleaves pushes and drains without losing a frame', () => {
        const buffer = new JsonFrameBuffer();
        const collected: string[] = [];

        for (let round = 0; round < 50; round += 1) {
            const first = frame('RoundStarted', { Round: round });
            const second = frame('CountdownBegin', { Round: round });

            const boundary = Math.floor(second.length / 2);

            buffer.push(first + second.slice(0, boundary));
            collected.push(...buffer.drain());
            buffer.push(second.slice(boundary));
            collected.push(...buffer.drain());
        }

        assert.equal(collected.length, 100);
        assert.equal(buffer.pending, 0);

        const rounds = collected.map(
            (raw) => (JSON.parse(raw) as { Data: { Round: number } }).Data.Round,
        );

        assert.equal(rounds[0], 0);
        assert.equal(rounds[99], 49);
    });

    it('discards a runaway buffer that never closes an object', () => {
        const buffer = new JsonFrameBuffer({ maxBufferChars: 64 });

        buffer.push(`{${'a'.repeat(200)}`);

        assert.deepEqual(buffer.drain(), []);
        assert.equal(buffer.pending, 0, 'buffer must reset rather than grow without bound');
    });

    it('clears state on reset', () => {
        const buffer = new JsonFrameBuffer();

        buffer.push('{"Event":"Partial"');
        buffer.drain();
        assert.ok(buffer.pending > 0);

        buffer.reset();
        assert.equal(buffer.pending, 0);

        buffer.push(frame('RoundStarted', {}));
        assert.equal(buffer.drain().length, 1);
    });
});
