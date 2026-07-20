import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 doesn't forward rejected promises from async handlers to the
// error middleware on its own — wrap every async route with this instead of
// repeating try/catch { next(err) } in each one.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
