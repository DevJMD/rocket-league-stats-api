/**
 * Serialises commands for the game to ingest.
 *
 * Commands are validated before being written, because the game rejects a malformed
 * command silently.
 *
 * @example
 * ```ts
 * const json = encodeCommand({
 *     Command: 'ChangePOV',
 *     Data: { Focus: '1', Perspective: 'PlayerView' },
 * });
 *
 * socket.write(json);
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

import { InvalidCommandError } from '../errors.ts';
import type { StatsApiCommand } from '../types/commands.ts';
import { PERSPECTIVES, FOCUS_BALL } from '../types/commands.ts';

const PERSPECTIVE_VALUES: ReadonlySet<string> = new Set<string>(PERSPECTIVES);

const DIGITS_ONLY = /^\d+$/u;

function assertFiniteNumber(command: string, field: string, value: number): void {
    if (!Number.isFinite(value)) {
        throw new InvalidCommandError(command, `${field} must be a finite number`);
    }
}

export function validateCommand(command: StatsApiCommand): void {
    switch (command.Command) {
        case 'ChangePOV': {
            const { Focus, Perspective } = command.Data;

            if (Focus === undefined && Perspective === undefined) {
                throw new InvalidCommandError(
                    command.Command,
                    'at least one of Focus or Perspective is required',
                );
            }

            if (Focus !== undefined && Focus !== FOCUS_BALL && !DIGITS_ONLY.test(Focus)) {
                throw new InvalidCommandError(
                    command.Command,
                    `Focus must be "${FOCUS_BALL}" or a spectator shortcut written as digits, received "${Focus}"`,
                );
            }

            if (Perspective !== undefined && !PERSPECTIVE_VALUES.has(Perspective)) {
                throw new InvalidCommandError(
                    command.Command,
                    `Perspective must be one of ${PERSPECTIVES.join(', ')}, received "${Perspective}"`,
                );
            }

            return;
        }

        case 'LoadReplay': {
            const { FileName, Path } = command.Data;
            const hasFileName = FileName !== undefined && FileName.length > 0;
            const hasPath = Path !== undefined && Path.length > 0;

            if (!hasFileName && !hasPath) {
                throw new InvalidCommandError(
                    command.Command,
                    'one of FileName or Path is required',
                );
            }

            return;
        }

        case 'SeekReplay': {
            const { Frame, TimeSeconds } = command.Data;

            if (Frame === undefined && TimeSeconds === undefined) {
                throw new InvalidCommandError(
                    command.Command,
                    'one of Frame or TimeSeconds is required',
                );
            }

            if (Frame !== undefined) {
                if (!Number.isInteger(Frame) || Frame < 0) {
                    throw new InvalidCommandError(
                        command.Command,
                        'Frame must be a non negative integer',
                    );
                }
            }

            if (TimeSeconds !== undefined) {
                assertFiniteNumber(command.Command, 'TimeSeconds', TimeSeconds);

                if (TimeSeconds < 0) {
                    throw new InvalidCommandError(
                        command.Command,
                        'TimeSeconds must not be negative',
                    );
                }
            }

            return;
        }

        case 'SetGameSpeed': {
            assertFiniteNumber(command.Command, 'Speed', command.Data.Speed);

            if (command.Data.Speed < 0) {
                throw new InvalidCommandError(command.Command, 'Speed must not be negative');
            }

            return;
        }

        case 'SetHUDVisibility':
        case 'SetMatchPaused':
            return;

        default:
            throw new InvalidCommandError(
                (command satisfies never as { Command: string }).Command,
                'unsupported command',
            );
    }
}

export function encodeCommand(command: StatsApiCommand): string {
    validateCommand(command);

    return JSON.stringify({ Command: command.Command, Data: command.Data });
}
