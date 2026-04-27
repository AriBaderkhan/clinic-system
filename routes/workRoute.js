import express from "express";
const router = express.Router();

import authMiddleware from "../middlewares/authMiddleware.js";
import permissionMiddleware from "../middlewares/permissionMiddleware.js";
import pool from "../db_connection.js";
import branchAssigmentMiddleware from '../middlewares/branchAssigmentMiddleware.js';

router.use(authMiddleware);
router.use(branchAssigmentMiddleware);

router.get("/", permissionMiddleware('manage_work'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, code, name, min_price FROM work_catalog ORDER BY id ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /work-catalog error:", err);
    res.status(500).json({ message: "Failed to load work catalog" });
  }
});

export default router;