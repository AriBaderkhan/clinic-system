import express from "express";
const router = express.Router();

import authMiddleware from "../middlewares/authMiddleware.js";
import roleCheck from "../middlewares/roleMiddleware.js";
import pool from "../db_connection.js";

router.use(authMiddleware);

router.get("/", roleCheck("reception",'doctor','super_doctor'), async (req, res) => {
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