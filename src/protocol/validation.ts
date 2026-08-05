/**
 * Validates untrusted socket JSON into the payloads declared in `types/events.ts`.
 *
 * Accessors never throw. A missing or wrongly typed required field records an error
 * and yields a placeholder, so one pass collects every problem. Gate delivery on
 * {@link FieldReader.ok}.
 *
 * @example
 * ```ts
 * const reader = createReader(payload);
 * const speed = reader.number('GoalSpeed');
 * const scorer = reader.child('Scorer').string('Name');
 *
 * if (!reader.ok) {
 *     console.warn(reader.recorded);
 * }
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
    readonly path: string;
    readonly message: string;
    readonly severity: IssueSeverity;
}

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const NO_ISSUES: readonly ValidationIssue[] = Object.freeze([]);

const PLACEHOLDER_STRING = '';
const PLACEHOLDER_NUMBER = 0;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';

    return typeof value;
}

class IssueSink {
    #issues: ValidationIssue[] | undefined;
    #errors = 0;
    #warnings = 0;

    add(path: string, message: string, severity: IssueSeverity): void {
        this.#issues ??= [];
        this.#issues.push({ path, message, severity });

        if (severity === 'error') this.#errors += 1;
        else this.#warnings += 1;
    }

    get hasError(): boolean {
        return this.#errors > 0;
    }

    get all(): readonly ValidationIssue[] {
        return this.#issues ?? NO_ISSUES;
    }

    get warnings(): readonly ValidationIssue[] {
        if (this.#warnings === 0) return NO_ISSUES;

        const issues = this.#issues;

        if (issues === undefined) return NO_ISSUES;

        return issues.filter((issue) => issue.severity === 'warning');
    }
}

export class FieldReader {
    readonly #source: Readonly<Record<string, unknown>>;
    readonly #path: string;
    readonly #sink: IssueSink;

    constructor(source: Readonly<Record<string, unknown>>, path: string, sink: IssueSink) {
        this.#source = source;
        this.#path = path;
        this.#sink = sink;
    }

    get ok(): boolean {
        return !this.#sink.hasError;
    }

    get recorded(): readonly ValidationIssue[] {
        return this.#sink.all;
    }

    get warnings(): readonly ValidationIssue[] {
        return this.#sink.warnings;
    }

    #at(key: string): string {
        return this.#path.length === 0 ? key : `${this.#path}.${key}`;
    }

    #fail(path: string, message: string): void {
        this.#sink.add(path, message, 'error');
    }

    #warn(path: string, message: string): void {
        this.#sink.add(path, message, 'warning');
    }

    #missing(key: string, expected: string): void {
        const value = this.#source[key];

        this.#fail(
            this.#at(key),
            value === undefined
                ? `missing required ${expected}`
                : `expected ${expected} but received ${describe(value)}`,
        );
    }

    has(key: string): boolean {
        return this.#source[key] !== undefined;
    }

    string(key: string): string {
        const value = this.#source[key];

        if (typeof value === 'string') return value;
        this.#missing(key, 'string');

        return PLACEHOLDER_STRING;
    }

    optionalString(key: string): string | undefined {
        if (!this.has(key)) return undefined;

        return this.string(key);
    }

    number(key: string): number {
        const value = this.#source[key];

        if (typeof value === 'number' && Number.isFinite(value)) return value;
        this.#missing(key, 'finite number');

        return PLACEHOLDER_NUMBER;
    }

    optionalNumber(key: string): number | undefined {
        if (!this.has(key)) return undefined;

        return this.number(key);
    }

    boolean(key: string): boolean {
        const value = this.#source[key];

        if (typeof value === 'boolean') return value;
        this.#missing(key, 'boolean');

        return false;
    }

    optionalBoolean(key: string): boolean | undefined {
        if (!this.has(key)) return undefined;

        return this.boolean(key);
    }

    teamNum(key: string): 0 | 1 {
        const value = this.#source[key];

        if (value === 0 || value === 1) return value;

        if (typeof value === 'number' && Number.isInteger(value)) {
            this.#warn(
                this.#at(key),
                `team index ${value} is outside the documented range of 0 and 1`,
            );

            return value as 0 | 1;
        }

        this.#missing(key, 'team index');

        return 0;
    }

    ballTeamNum(key: string): 0 | 1 | 255 {
        const value = this.#source[key];

        if (value === 255) return value;

        return this.teamNum(key);
    }

    child(key: string): FieldReader {
        const value = this.#source[key];

        if (isRecord(value)) return new FieldReader(value, this.#at(key), this.#sink);
        this.#missing(key, 'object');

        return new FieldReader({}, this.#at(key), this.#sink);
    }

    optionalChild(key: string): FieldReader | undefined {
        if (!this.has(key)) return undefined;

        return this.child(key);
    }

    stringArray(key: string): string[] {
        const value = this.#source[key];

        if (!Array.isArray(value)) {
            this.#missing(key, 'array of strings');

            return [];
        }

        const out: string[] = [];

        for (let index = 0; index < value.length; index += 1) {
            const entry: unknown = value[index];

            if (typeof entry === 'string') {
                out.push(entry);
            } else {
                this.#fail(
                    `${this.#at(key)}[${index}]`,
                    `expected string but received ${describe(entry)}`,
                );

                return out;
            }
        }

        return out;
    }

    objectArray<T>(key: string, decode: (reader: FieldReader) => T): T[] {
        const value = this.#source[key];

        if (!Array.isArray(value)) {
            this.#missing(key, 'array of objects');

            return [];
        }

        const out: T[] = [];

        for (let index = 0; index < value.length; index += 1) {
            const entry: unknown = value[index];
            const path = `${this.#at(key)}[${index}]`;

            if (isRecord(entry)) {
                out.push(decode(new FieldReader(entry, path, this.#sink)));
            } else {
                this.#fail(path, `expected object but received ${describe(entry)}`);
            }
        }

        return out;
    }
}

export function createReader(payload: Readonly<Record<string, unknown>>): FieldReader {
    return new FieldReader(payload, '', new IssueSink());
}
