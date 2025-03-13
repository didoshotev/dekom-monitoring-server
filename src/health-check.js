const axios = require('axios');
require('dotenv').config();

// Configuration from environment variables
const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:5001';
const API_KEY = process.env.API_KEY || 'your-local-api-key';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram notification skipped: Missing bot token or chat ID');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });
    console.log('Telegram notification sent successfully');
  } catch (error) {
    console.error('Failed to send Telegram notification:', error.message);
  }
}

async function checkServiceHealth() {
  try {
    console.log(`Checking service health at ${SERVICE_URL}/ping...`);
    const startTime = Date.now();

    const response = await axios.get(`${SERVICE_URL}/ping`, {
      headers: {
        'x-api-key': API_KEY
      },
      timeout: 10000 // 10 second timeout
    });

    const responseTime = Date.now() - startTime;

    console.log(`Service responded in ${responseTime}ms`);
    console.log('Status code:', response.status);

    if (response.status !== 200 || (response.data && response.data.status !== 'success')) {
      throw new Error('Service returned unhealthy status');
    }

    console.log('✅ Service is healthy!');
    return true;
  } catch (error) {
    console.error('❌ Service health check failed:', error.message);

    // Format and send Telegram notification
    const currentDate = new Date();
    const formattedDate = new Intl.DateTimeFormat('bg-BG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(currentDate);

    const errorMessage = `⚠️ <b>Dekom Node Backend НЕ РАБОТИ!</b> ⚠️\n\n<b>Услуга:</b> API Сървър\n<b>URL:</b> ${SERVICE_URL}\n\n<b>Проблем:</b> Услугата не отговаря правилно\n<b>Грешка:</b> ${error.message}\n<b>Време:</b> ${formattedDate}`;
    await sendTelegramNotification(errorMessage);

    // Exit with error code for GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
      process.exit(1);
    }
    return false;
  }
}

// Run the health check if this file is executed directly
if (require.main === module) {
  checkServiceHealth();
}

// Export for testing or if needed elsewhere
module.exports = { checkServiceHealth };