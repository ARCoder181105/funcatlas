export function helper(value) {
  return String(value);
}

export const shout = (value) => helper(value).toUpperCase();
