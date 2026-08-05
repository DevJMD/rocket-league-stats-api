/**
 * Splits the socket stream into whole JSON objects.
 *
 * The game writes messages back to back with no delimiter, so boundaries come from
 * counting braces. Braces inside string literals are ignored, since names and file
 * names can contain them.
 *
 * @example
 * ```ts
 * const frames = new JsonFrameBuffer();
 *
 * socket.setEncoding('utf8');
 * socket.on('data', (chunk: string) => {
 *     frames.push(chunk);
 *     for (const frame of frames.drain()) {
 *         handle(decodeFrame(frame));
 *     }
 * });
 * ```
 *
 * @see {@link https://www.rocketleague.com/developer/stats-api Rocket League Stats API}
 * @author devjmd (https://github.com/devjmd)
 * @license MIT
 */

const DEFAULT_MAX_BUFFER_CHARS = 8 * 1024 * 1024;

const COMPACT_THRESHOLD_CHARS = 64 * 1024;

export interface JsonFrameBufferOptions {
    readonly maxBufferChars?: number;
}

export class JsonFrameBuffer {
    #buffer = '';
    #consumed = 0;
    #scanned = 0;
    #depth = 0;
    #start = -1;
    #inString = false;
    #escaped = false;

    readonly #maxBufferChars: number;

    constructor(options: JsonFrameBufferOptions = {}) {
        this.#maxBufferChars = options.maxBufferChars ?? DEFAULT_MAX_BUFFER_CHARS;
    }

    get pending(): number {
        return this.#buffer.length - this.#consumed;
    }

    push(chunk: string): void {
        this.#buffer += chunk;
    }

    drain(): string[] {
        const frames: string[] = [];
        const buffer = this.#buffer;
        const length = buffer.length;

        let index = this.#scanned;

        while (index < length) {
            const char = buffer[index];

            if (this.#inString) {
                if (this.#escaped) this.#escaped = false;
                else if (char === '\\') this.#escaped = true;
                else if (char === '"') this.#inString = false;
            } else if (char === '"') {
                this.#inString = true;
            } else if (char === '{') {
                if (this.#depth === 0) this.#start = index;
                this.#depth += 1;
            } else if (char === '}' && this.#depth > 0) {
                this.#depth -= 1;

                if (this.#depth === 0 && this.#start >= 0) {
                    frames.push(buffer.slice(this.#start, index + 1));
                    this.#consumed = index + 1;
                    this.#start = -1;
                }
            }

            index += 1;
        }

        this.#scanned = length;
        this.#compact();

        return frames;
    }

    #compact(): void {
        const consumed = this.#consumed;

        if (consumed > 0) {
            if (consumed === this.#buffer.length) {
                this.#buffer = '';
            } else if (consumed >= COMPACT_THRESHOLD_CHARS) {
                this.#buffer = this.#buffer.slice(consumed);
            }

            if (this.#buffer.length === 0 || consumed >= COMPACT_THRESHOLD_CHARS) {
                if (this.#start >= 0) this.#start -= consumed;
                this.#scanned -= consumed;
                this.#consumed = 0;
            }
        }

        if (this.pending > this.#maxBufferChars) this.reset();
    }

    reset(): void {
        this.#buffer = '';
        this.#consumed = 0;
        this.#scanned = 0;
        this.#depth = 0;
        this.#start = -1;
        this.#inString = false;
        this.#escaped = false;
    }
}
