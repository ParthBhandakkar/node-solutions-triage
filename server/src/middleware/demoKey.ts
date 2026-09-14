import type { RequestHandler } from "express";

export const demoKey: RequestHandler = (req, res, next) => {
  const expected = process.env.DEMO_KEY;
  if (expected && req.header("x-demo-key") !== expected) {
    res.status(401).json({ error: { code: "DEMO_KEY_REQUIRED", message: "This demo requires the X-Demo-Key header." } });
    return;
  }
  next();
};
