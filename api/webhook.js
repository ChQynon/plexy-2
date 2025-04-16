// Этот файл нужен для Vercel - он служит точкой входа для вебхука
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const dotenv = require('dotenv');
const axios = require('axios');
const express = require('express');

// Load environment variables
dotenv.config();

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Create Express app
const app = express();

// Настройка бота
bot.start((ctx) => ctx.reply('Привет! Отправь мне фото растения, и я скажу что это.'));
bot.help((ctx) => ctx.reply('Отправь мне фото растения, и я помогу с идентификацией'));
bot.on('photo', (ctx) => ctx.reply('Анализирую изображение...'));
bot.on('text', (ctx) => ctx.reply('Отправь мне фото растения для анализа'));

// Webhook route for Telegram
app.use(bot.webhookCallback('/api/webhook'));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// Root route
app.get('/', (req, res) => {
  res.status(200).send('Telegram Bot is running.');
});

// Set webhook
bot.telegram.setWebhook(`https://plexy-2.vercel.app/api/webhook`)
  .then(() => {
    console.log('Webhook set');
  })
  .catch(err => {
    console.error('Error setting webhook:', err);
  });

// Export express app for Vercel
module.exports = app; 