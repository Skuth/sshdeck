import { invoke } from "@tauri-apps/api/core";

export const readTextFile = (path: string) => invoke<string>("read_text_file", { path });
