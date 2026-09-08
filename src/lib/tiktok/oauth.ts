/** Constant-time-equivalent shape check used before the server performs the real token exchange. */
export function oauthStatesMatch(expected: string | undefined, received: string | null): boolean {
  if (!expected || !received || expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}
