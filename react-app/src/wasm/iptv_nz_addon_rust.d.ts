/* tslint:disable */
/* eslint-disable */

export function clean_show_title(title: string): string;

export function greet(name: string): string;

export function init_panic_hook(): void;

export function is_safe_proxy_url(url: string): boolean;

export function parse_nz_channels(m3u8_text: string, epg_text: string): any;

export function process_icon_url(url: string): string | undefined;

export function rewrite_playlist(
  text: string,
  proxy_base_url: string,
  original_url: string,
  headers_json?: string | null,
): string;

export type InitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly clean_show_title: (a: number, b: number) => [number, number];
  readonly greet: (a: number, b: number) => [number, number];
  readonly is_safe_proxy_url: (a: number, b: number) => number;
  readonly parse_nz_channels: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number, number];
  readonly process_icon_url: (a: number, b: number) => [number, number];
  readonly rewrite_playlist: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => [number, number];
  readonly init_panic_hook: () => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(
  module: { module: SyncInitInput } | SyncInitInput,
): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>,
): Promise<InitOutput>;
