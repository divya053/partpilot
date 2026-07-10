import { Router, type IRouter } from "express";
import healthRouter from "./health";
import partNumbersRouter from "./partNumbers";
import segmentsRouter from "./segments";
import statsRouter from "./stats";
import importRouter from "./importRoute";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/part-numbers", partNumbersRouter);
router.use("/segments", segmentsRouter);
router.use("/stats", statsRouter);
router.use("/import", importRouter);

export default router;
