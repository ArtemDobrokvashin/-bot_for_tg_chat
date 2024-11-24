import { dbOperations } from './database.js';
import { parseDateTime } from './utils.js';

export async function handleMessage(bot, msg, model) {
  const chatId = msg.chat.id;
  
  // Store message for summarization
  await dbOperations.addMessage(
    chatId,
    msg.from.id,
    msg.from.username,
    msg.text
  );

  // Check if message mentions bot
  if (msg.text.includes(`@${bot.options.username}`)) {
    const response = await generateBotResponse(msg.text, model);
    bot.sendMessage(chatId, response);
    return;
  }

  // Try to detect dates and times in message
  try {
    const { date, time, description } = await parseDateTime(msg.text);
    if (date && time) {
      const reply = await bot.sendMessage(
        chatId,
        `I detected an event:\nDate: ${date}\nTime: ${time}\nDescription: ${description}\n\nWould you like me to add it to the calendar?`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Yes', callback_data: `add_event:${date}:${time}:${description}` },
              { text: 'No', callback_data: 'ignore' }
            ]]
          }
        }
      );
    }
  } catch (error) {
    // Silently ignore parsing errors for regular messages
  }
}

async function generateBotResponse(text, model) {
  try {
    const prompt = `As a helpful calendar assistant, respond to this message: "${text}"`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return "I'm sorry, I couldn't generate a response. Please try again.";
  }
}