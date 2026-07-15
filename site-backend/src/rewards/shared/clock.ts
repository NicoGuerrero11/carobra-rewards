export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}

  now(): Date {
    return new Date(this.value.getTime());
  }
}

export function requireValidInstant(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new Error("Invalid instant");
  return value;
}
