export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | Record<string, unknown>
  | ClassValue[];

/** Tiny clsx replacement - keeps the dependency list minimal. */
export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  const walk = (value: ClassValue): void => {
    if (!value && value !== 0) return;
    if (typeof value === "string" || typeof value === "number") {
      classes.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object") {
      for (const [key, active] of Object.entries(value)) {
        if (active) classes.push(key);
      }
    }
  };

  inputs.forEach(walk);
  return classes.filter(Boolean).join(" ");
}
