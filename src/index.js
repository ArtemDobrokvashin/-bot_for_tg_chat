import TelegramBot from 'node-telegram-bot-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as chrono from 'chrono-node';
import { config } from 'dotenv';
import { initDB, closeDB, dbOperations } from './database.js';
import { handleCommand } from './commands.js';
import { handleMessage } from './messages.js';

// Load environment variables first
config();

// Validate environment variables
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.GEMINI_API_KEY) {
  console.error('Error: TELEGRAM_BOT_TOKEN and GEMINI_API_KEY must be set in .env file');
  process.exit(1);
}

let bot = null;

async function startBot() {
  try {
    // Initialize database first
    const db = await initDB();
    if (!db) {
      throw new Error('Failed to initialize database');
    }
    console.log('Database initialized successfully');

    // Stop existing bot instance if it exists
    if (bot) {
      await bot.stopPolling();
      bot = null;
    }

    // Initialize bot with proper error handling
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
      polling: {
        interval: 300,
        autoStart: true,
        params: {
          timeout: 10
        }
      }
    });

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    console.log('Bot is starting...');

    // Handle callback queries with error handling
    bot.on('callback_query', async (query) => {
      try {
        const chatId = query.message.chat.id;
        
        if (query.data === 'ignore') {
          await bot.answerCallbackQuery(query.id);
          await bot.deleteMessage(chatId, query.message.message_id);
          return;
        }

        if (query.data.startsWith('add_event:')) {
          const [_, date, time, ...descParts] = query.data.split(':');
          const description = descParts.join(':');

          const eventId = await dbOperations.addEvent(date, time, description);
          await bot.answerCallbackQuery(query.id, { text: 'Event added successfully!' });
          await bot.editMessageText(
            `Event added successfully!\nID: ${eventId}\nDate: ${date}\nTime: ${time}\nDescription: ${description}`,
            {
              chat_id: chatId,
              message_id: query.message.message_id
            }
          );
        }
      } catch (error) {
        console.error('Callback query error:', error);
        await bot.answerCallbackQuery(query.id, { text: 'An error occurred' });
      }
    });

    // Handle commands with error handling
    bot.onText(/^\//, async (msg) => {
      try {
        await handleCommand(bot, msg, model);
      } catch (error) {
        console.error('Command error:', error);
        bot.sendMessage(msg.chat.id, 'Sorry, there was an error processing your command.');
      }
    });

    // Handle regular messages with error handling
    bot.on('message', async (msg) => {
      try {
        if (!msg.text?.startsWith('/')) {
          await handleMessage(bot, msg, model);
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    // Handle polling errors
    bot.on('polling_error', (error) => {
      console.error('Polling error:', error);
      // Restart bot only for specific errors
      if (error.code === 'ETELEGRAM' && error.message.includes('terminated by other getUpdates request')) {
        console.log('Restarting bot due to polling conflict...');
        setTimeout(startBot, 1000);
      }
    });

    // Handle process termination
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    console.log('Bot started successfully!');
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

async function cleanup() {
  console.log('Stopping bot...');
  if (bot) {
    bot.stopPolling();
    bot = null;
  }
  await closeDB();
  process.exit(0);
}

// Start the bot with error handling
startBot().catch(error => {
  console.error('Fatal error starting bot:', error);
  process.exit(1);
});