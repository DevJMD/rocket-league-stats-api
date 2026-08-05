import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { encodeCommand, InvalidCommandError, validateCommand } from '../src/index.ts';

describe('encodeCommand', () => {
    it('renders the documented command envelope', () => {
        const json = encodeCommand({ Command: 'SetGameSpeed', Data: { Speed: 0.5 } });

        assert.deepEqual(JSON.parse(json), { Command: 'SetGameSpeed', Data: { Speed: 0.5 } });
    });

    it('renders ChangePOV', () => {
        const json = encodeCommand({
            Command: 'ChangePOV',
            Data: { Focus: '1', Perspective: 'PlayerView' },
        });

        assert.deepEqual(JSON.parse(json), {
            Command: 'ChangePOV',
            Data: { Focus: '1', Perspective: 'PlayerView' },
        });
    });
});

describe('validateCommand', () => {
    it('accepts a ball focus and every documented perspective', () => {
        validateCommand({ Command: 'ChangePOV', Data: { Focus: 'Ball' } });

        for (const perspective of [
            'Fly',
            'SoftAttach',
            'HardAttach',
            'PlayerView',
            'AutoCam',
            'Camera_Director',
        ] as const) {
            validateCommand({ Command: 'ChangePOV', Data: { Perspective: perspective } });
        }
    });

    it('rejects a focus that is neither Ball nor digits', () => {
        assert.throws(
            () => {
                validateCommand({ Command: 'ChangePOV', Data: { Focus: 'PlayerA' as '1' } });
            },
            (error: unknown) =>
                error instanceof InvalidCommandError &&
                error.code === 'invalid_command' &&
                error.command === 'ChangePOV',
        );
    });

    it('rejects an unknown perspective', () => {
        assert.throws(() => {
            validateCommand({
                Command: 'ChangePOV',
                Data: { Perspective: 'Cinematic' as 'Fly' },
            });
        }, InvalidCommandError);
    });

    it('requires at least one of Focus or Perspective', () => {
        assert.throws(() => {
            validateCommand({ Command: 'ChangePOV', Data: {} as { Focus: 'Ball' } });
        }, InvalidCommandError);
    });

    it('requires one of FileName or Path for LoadReplay', () => {
        validateCommand({ Command: 'LoadReplay', Data: { FileName: 'a_replay' } });
        validateCommand({ Command: 'LoadReplay', Data: { Path: 'C:/replays/a.replay' } });
        assert.throws(() => {
            validateCommand({ Command: 'LoadReplay', Data: { FileName: '' } });
        }, InvalidCommandError);
    });

    it('requires one of Frame or TimeSeconds for SeekReplay', () => {
        validateCommand({ Command: 'SeekReplay', Data: { Frame: 120 } });
        validateCommand({ Command: 'SeekReplay', Data: { TimeSeconds: 120.5 } });
        assert.throws(() => {
            validateCommand({ Command: 'SeekReplay', Data: { Frame: -1 } });
        }, InvalidCommandError);
        assert.throws(() => {
            validateCommand({ Command: 'SeekReplay', Data: { Frame: 1.5 } });
        }, InvalidCommandError);
        assert.throws(() => {
            validateCommand({ Command: 'SeekReplay', Data: { TimeSeconds: -0.5 } });
        }, InvalidCommandError);
    });

    it('rejects a negative or non finite game speed', () => {
        validateCommand({ Command: 'SetGameSpeed', Data: { Speed: 0 } });
        assert.throws(() => {
            validateCommand({ Command: 'SetGameSpeed', Data: { Speed: -1 } });
        }, InvalidCommandError);
        assert.throws(() => {
            validateCommand({ Command: 'SetGameSpeed', Data: { Speed: Number.NaN } });
        }, InvalidCommandError);
    });

    it('accepts the boolean only commands', () => {
        validateCommand({ Command: 'SetHUDVisibility', Data: { bVisible: false } });
        validateCommand({ Command: 'SetMatchPaused', Data: { bPaused: true } });
    });
});
