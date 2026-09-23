import { env } from '../../config/env';

export const sendTelegramAlert = async (message: string): Promise<void> => {
  if (!env.telegramBotToken || !env.telegramChatId) return; // alerts disabled

  try {
    await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.telegramChatId, text: message }),
    });
  } catch (err) {
    console.error('Telegram alert failed:', err);
  }
};
