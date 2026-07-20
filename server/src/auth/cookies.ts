import { Response } from 'express';
import ms from 'ms';
import { env } from '../env.js';

const baseOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SECURE ? ('none' as const) : ('lax' as const),
  domain: env.COOKIE_DOMAIN,
  path: '/',
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  // was hardcoded to 15 * 60 * 1000 — silently wrong if JWT_ACCESS_TTL is
  // ever set to anything else, since the cookie would then outlive (or
  // expire before) the token it carries. Derive it from the same env var
  // the token itself uses instead of duplicating the number.
  res.cookie('access_token', accessToken, { ...baseOptions, maxAge: ms(env.JWT_ACCESS_TTL as ms.StringValue) });
  res.cookie('refresh_token', refreshToken, {
    ...baseOptions,
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', baseOptions);
  res.clearCookie('refresh_token', baseOptions);
}
