import chalk, { Chalk } from "chalk";
import { SQUID_PALETTE } from "./palette.js";

const hasForceColor =
  typeof process.env.FORCE_COLOR === "string" &&
  process.env.FORCE_COLOR.trim().length > 0 &&
  process.env.FORCE_COLOR.trim() !== "0";

const baseChalk = process.env.NO_COLOR && !hasForceColor ? new Chalk({ level: 0 }) : chalk;

const hex = (value: string) => baseChalk.hex(value);

export const theme = {
  accent: hex(SQUID_PALETTE.accent),
  accentBright: hex(SQUID_PALETTE.accentBright),
  accentDim: hex(SQUID_PALETTE.accentDim),
  info: hex(SQUID_PALETTE.info),
  success: hex(SQUID_PALETTE.success),
  warn: hex(SQUID_PALETTE.warn),
  error: hex(SQUID_PALETTE.error),
  muted: hex(SQUID_PALETTE.muted),
  heading: baseChalk.bold.hex(SQUID_PALETTE.accent),
  command: hex(SQUID_PALETTE.accentBright),
  option: hex(SQUID_PALETTE.warn),
} as const;

export const isRich = () => Boolean(baseChalk.level > 0);

export const colorize = (rich: boolean, color: (value: string) => string, value: string) =>
  rich ? color(value) : value;
