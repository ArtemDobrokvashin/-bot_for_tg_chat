import { dbOperations } from './database.js';
import { parseDateTime } from './utils.js';

export async function handleCommand(bot, msg, model) {
  const chatId = msg.chat.id;
  const command = msg.text.split(' ')[0];
  const args = msg.text.slice(command.length).trim();

  switch (command) {
    case '/add':
    case '/добавить':
      await handleAddEvent(bot, msg, args);
      break;

    case '/delete':
    case '/удалить':
      await handleDeleteEvent(bot, msg, args);
      break;

    case '/show':
    case '/показать':
      await handleShowEvents(bot, msg, args);
      break;

    case '/remind':
    case '/напомнить':
      await handleSetReminder(bot, msg, args);
      break;

    case '/summarize':
    case '/пересказать':
      await handleSummarize(bot, msg, args, model);
      break;

    default:
      bot.sendMessage(chatId, 'Unknown command. Please try again.');
  }
}

async function handleAddEvent(bot, chatId, args) {
  try {
    const { date, time, description } = await parseDateTime(args);
    const eventId = await dbOperations.addEvent(date, time, description);
    bot.sendMessage(
      chatId,
      `Event added successfully!\nID: ${eventId}\nDate: ${date}\nTime: ${time}\nDescription: ${description}`
    );
  } catch (error) {
    bot.sendMessage(chatId, 'Error adding event. Please check the format and try again.');
  }
}

async function handleDeleteEvent(bot, chatId, args) {
  try {
    const eventId = parseInt(args);
    await dbOperations.deleteEvent(eventId);
    bot.sendMessage(chatId, `Event ${eventId} has been deleted.`);
  } catch (error) {
    bot.sendMessage(chatId, 'Error deleting event. Please check the ID and try again.');
  }
}

async function handleShowEvents(bot, chatId, args) {
  try {
    const date = args || new Date().toISOString().split('T')[0];
    const events = await dbOperations.getEvents(date);
    
    if (events.length === 0) {
      bot.sendMessage(chatId, `No events found for ${date}`);
      return;
    }

    const eventsList = events
      .map(e => `🕒 ${e.time} - ${e.description}`)
      .join('\n');
    bot.sendMessage(chatId, `Events for ${date}:\n${eventsList}`);
  } catch (error) {
    bot.sendMessage(chatId, 'Error showing events. Please try again.');
  }
}

async function handleSummarize(bot, chatId, args, model) {
  try {
    const hours = parseInt(args) || 24;
    const messages = await dbOperations.getMessages(chatId, hours);
    
    if (messages.length === 0) {
      bot.sendMessage(chatId, 'No messages found for the specified period.');
      return;
    }

    const prompt = `Summarize the following conversation:\n${messages
      .map(m => `${m.username}: ${m.message_text}`)
      .join('\n')}`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    
    bot.sendMessage(chatId, `Summary of the last ${hours} hours:\n\n${summary}`);
  } catch (error) {
    bot.sendMessage(chatId, 'Error generating summary. Please try again.');
  }
}