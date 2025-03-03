const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Authentication middleware
const authenticateRequest = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  next();
};

// Health check for the monitoring server itself
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Endpoint to manually trigger a check of the main service
app.post('/check-service', authenticateRequest, async (req, res) => {
  try {
    const response = await pingMainService();
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check main service',
      details: error.message
    });
  }
});

// Get status history
app.get('/status-history', authenticateRequest, (req, res) => {
  res.status(200).json(statusHistory);
});

// Function to ping the main service
async function pingMainService() {
  try {
    const startTime = Date.now();
    const response = await axios.get(`${process.env.MAIN_SERVICE_URL}${process.env.PING_ENDPOINT}`, {
      timeout: 5000,
      headers: {
        'x-api-key': process.env.API_KEY
      }
    });
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    const result = {
      timestamp: new Date().toISOString(),
      status: response.status === 200 ? 'healthy' : 'unhealthy',
      responseTime: responseTime,
      statusCode: response.status,
      data: response.data
    };

    // Add to status history
    addToStatusHistory(result);
    return result;
  } catch (error) {
    const result = {
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: error.message
    };

    // Add to status history
    addToStatusHistory(result);

    throw error;
  }
}

// Status history storage (in a real app, you might use a database)
const statusHistory = [];
const MAX_HISTORY_ITEMS = 100;

function addToStatusHistory(status) {
  statusHistory.unshift(status);

  // Keep the history at a reasonable size
  if (statusHistory.length > MAX_HISTORY_ITEMS) {
    statusHistory.pop();
  }
}

// Set up periodic checking
const checkInterval = parseInt(process.env.CHECK_INTERVAL, 10) || 60000; // Default to 1 minute
setInterval(async () => {
  try {
    console.log('Checking main service health...');
    await pingMainService();
    console.log('Health check completed');
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}, checkInterval);

// Start the server
app.listen(port, () => {
  console.log(`Monitoring server running on port ${port}`);
});

module.exports = app; // For Vercel serverless deployment