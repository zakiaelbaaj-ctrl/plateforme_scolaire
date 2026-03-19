// =======================================================
// WHITEBOARD MODEL — PostgreSQL
// =======================================================

import { pool } from "../config/db.js";

export const WhiteboardModel = {

  // -----------------------------------------------------
  // Sauvegarder un snapshot
  // -----------------------------------------------------
  async saveSnapshot(roomId, snapshotBase64) {
    const query = `
      INSERT INTO whiteboard_snapshots (room_id, snapshot)
      VALUES ($1, $2)
      RETURNING id, created_at
    `;
    const values = [roomId, snapshotBase64];

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // -----------------------------------------------------
  // Récupérer tous les snapshots d'une room
  // -----------------------------------------------------
  async getSnapshots(roomId) {
    const query = `
      SELECT id, snapshot, created_at
      FROM whiteboard_snapshots
      WHERE room_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [roomId]);
    return result.rows;
  },

  // -----------------------------------------------------
  // Récupérer le dernier snapshot d'une room
  // -----------------------------------------------------
  async getLatestSnapshot(roomId) {
    const query = `
      SELECT id, snapshot, created_at
      FROM whiteboard_snapshots
      WHERE room_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [roomId]);
    return result.rows[0] || null;
  }
};
