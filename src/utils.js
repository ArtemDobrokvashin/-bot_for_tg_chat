import * as chrono from 'chrono-node';

export function parseDateTime(text) {
  const parsed = chrono.parse(text);
  
  if (parsed.length === 0) {
    throw new Error('No date/time found in text');
  }

  const date = parsed[0].start.date();
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  
  // Extract description by removing the date/time part
  const description = text.replace(parsed[0].text, '').trim();

  return {
    date: dateStr,
    time: timeStr,
    description: description || 'No description provided'
  };
}