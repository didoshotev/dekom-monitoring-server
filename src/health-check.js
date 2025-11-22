const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration from environment variables
const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:5001';
const API_KEY = process.env.API_KEY || 'your-local-api-key';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Alert intervals in milliseconds: 2m, 10m, 30m, 1h, then every 1h
const ALERT_INTERVALS = [
  2 * 60 * 1000,      // 2 minutes
  10 * 60 * 1000,     // 10 minutes
  30 * 60 * 1000,     // 30 minutes
  60 * 60 * 1000,     // 1 hour
  60 * 60 * 1000      // 1 hour (repeating)
];

const STATE_FILE = path.join(__dirname, '.alert-state.json');

function readAlertState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to read alert state:', error.message);
  }
  return { lastAlertTime: null, alertCount: 0, isServiceDown: false };
}

function writeAlertState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Failed to write alert state:', error.message);
  }
}

function shouldSendAlert(state) {
  if (!state.lastAlertTime) {
    return true; // First alert
  }

  const timeSinceLastAlert = Date.now() - state.lastAlertTime;
  const intervalIndex = Math.min(state.alertCount, ALERT_INTERVALS.length - 1);
  const requiredInterval = ALERT_INTERVALS[intervalIndex];

  return timeSinceLastAlert >= requiredInterval;
}

async function sendTelegramNotification(message, maxRetries = 3, baseDelay = 1000) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(url, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      }, {
        timeout: 5000
      });
      return true;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        console.error('Failed to send Telegram notification:', error.message);
        return false;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

async function checkServiceHealth() {
  const state = readAlertState();

  try {
    const startTime = Date.now();

    const response = await axios.get(`${SERVICE_URL}/ping`, {
      headers: {
        'x-api-key': API_KEY
      },
      timeout: 10000
    });

    const responseTime = Date.now() - startTime;

    if (response.status !== 200 || (response.data && response.data.status !== 'success')) {
      throw new Error('Service returned unhealthy status');
    }

    console.log(`✅ Service healthy (${responseTime}ms)`);

    // Reset alert state if service is back up
    if (state.isServiceDown) {
      const recoveryMessage = `✅ <b>Dekom Node Backend РАБОТИ ОТНОВО!</b>\n\n<b>Услуга:</b> API Сървър\n<b>URL:</b> ${SERVICE_URL}\n<b>Време на възстановяване:</b> ${new Intl.DateTimeFormat('bg-BG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(new Date())}`;

      await sendTelegramNotification(recoveryMessage);
      writeAlertState({ lastAlertTime: null, alertCount: 0, isServiceDown: false });
    }

    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);

    // Check if we should send an alert based on intervals
    if (shouldSendAlert(state)) {
      const currentDate = new Date();
      const formattedDate = new Intl.DateTimeFormat('bg-BG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(currentDate);

      const alertNumber = state.alertCount + 1;
      const errorMessage = `⚠️ <b>Dekom Node Backend НЕ РАБОТИ!</b> ⚠️\n\n<b>Услуга:</b> API Сървър\n<b>URL:</b> ${SERVICE_URL}\n\n<b>Проблем:</b> Услугата не отговаря правилно\n<b>Грешка:</b> ${error.message}\n<b>Време:</b> ${formattedDate}\n<b>Известие:</b> #${alertNumber}`;

      const sent = await sendTelegramNotification(errorMessage);

      if (sent) {
        writeAlertState({
          lastAlertTime: Date.now(),
          alertCount: alertNumber,
          isServiceDown: true
        });
      }
    } else {
      console.log('⏱️  Alert suppressed (too soon)');
    }

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