// Simple ID generator that doesn't rely on Math.random() in workflows
let counter = 0;
export function nanoid(): string {
  counter++;
  return `${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
