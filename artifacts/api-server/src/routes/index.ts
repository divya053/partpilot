import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import partNumbersRouter from "./partNumbers";
import segmentsRouter from "./segments";
import statsRouter from "./stats";
import importRouter from "./importRoute";
import aiRouter from "./ai";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use("/auth", authRouter);

// Everything below requires a logged-in user (any role can read; writes are
// gated per-route with requireCap()).
router.use(requireAuth);
router.use("/part-numbers", partNumbersRouter);
router.use("/segments", segmentsRouter);
router.use("/stats", statsRouter);
router.use("/import", importRouter);
router.use("/ai", aiRouter);

export default router;
