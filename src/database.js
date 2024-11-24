import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

let db;

export async function initDB() {
  try {
    if (db) return db;

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const dbPath = `${__dirname}/../bot.db`;

    // If database is corrupted, try to delete it and recreate
    if (existsSync(dbPath)) {
      try {
        // Try to open the database to test if it's corrupted
        const testDb = await open({
          filename: dbPath,
          driver: sqlite3.Database
        });
        await testDb.get('SELECT 1');
        await testDb.close();
      } catch (error) {
        console.log('Detected corrupted database, recreating...');
        await unlink(dbPath);
      }
    }
    
    // Open or create new database
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Enable foreign keys and WAL mode for better reliability
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA synchronous = NORMAL;');

    // Create tables with proper error handling
    await db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        description TEXT NOT NULL,
        participants TEXT,
        message_link TEXT,
        status TEXT DEFAULT 'confirmed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        remind_at DATETIME NOT NULL,
        FOREIGN KEY(event_id) REFERENCES events(id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT,
        message_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better performance
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
    `);

    return db;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Ensure proper database cleanup
export async function closeDB() {
  if (db) {
    try {
      await db.close();
      db = null;
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
}

export const dbOperations = {
  async addEvent(date, time, description, participants = null, messageLink = null) {
    try {
      const result = await db.run(
        'INSERT INTO events (date, time, description, participants, message_link) VALUES (?, ?, ?, ?, ?)',
        [date, time, description, participants, messageLink]
      );
      return result.lastID;
    } catch (error) {
      console.error('Error adding event:', error);
      throw error;
    }
  },

  async getEvents(date) {
    try {
      return await db.all(
        'SELECT * FROM events WHERE date = ? ORDER BY time',
        [date]
      );
    } catch (error) {
      console.error('Error getting events:', error);
      throw error;
    }
  },

  async deleteEvent(id) {
    try {
      await db.run('DELETE FROM events WHERE id = ?', [id]);
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  },

  async addMessage(chatId, userId, username, messageText) {
    try {
      const result = await db.run(
        'INSERT INTO messages (chat_id, user_id, username, message_text) VALUES (?, ?, ?, ?)',
        [chatId, userId, username, messageText]
      );
      return result.lastID;
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  },

  async getMessages(chatId, hours) {
    try {
      const timeAgo = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      return await db.all(
        'SELECT * FROM messages WHERE chat_id = ? AND timestamp > ? ORDER BY timestamp',
        [chatId, timeAgo]
      );
    } catch (error) {
      console.error('Error getting messages:', error);
      throw error;
    }
  },

  async addReminder(eventId, remindAt) {
    try {
      const result = await db.run(
        'INSERT INTO reminders (event_id, remind_at) VALUES (?, ?)',
        [eventId, remindAt]
      );
      return result.lastID;
    } catch (error) {
      console.error('Error adding reminder:', error);
      throw error;
    }
  },

  async getUpcomingReminders() {
    try {
      const now = new Date().toISOString();
      return await db.all(`
        SELECT r.*, e.* 
        FROM reminders r 
        JOIN events e ON r.event_id = e.id 
        WHERE r.remind_at <= ? 
        ORDER BY r.remind_at
      `, [now]);
    } catch (error) {
      console.error('Error getting upcoming reminders:', error);
      throw error;
    }
  }
};