const LOOKBACK_PATTERN = /^(\d+(?:\.\d+)?)\s*([hdw])?$/i;

const MULTIPLIERS: Record<string, number> = {
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export function parseLookback(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('lookback is required');
  }

  const match = LOOKBACK_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid lookback "${value}". Use formats like 48h, 7d, 2w, or a bare number of hours.`,
    );
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid lookback "${value}". Duration must be greater than zero.`);
  }

  const unit = (match[2] ?? 'h').toLowerCase();
  const multiplier = MULTIPLIERS[unit];
  return amount * multiplier;
}

export function describeLookback(value: string): string {
  const ms = parseLookback(value);
  const hours = ms / MULTIPLIERS.h;
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  const days = hours / 24;
  if (days < 7) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const weeks = days / 7;
  return `${weeks} week${weeks === 1 ? '' : 's'}`;
}
