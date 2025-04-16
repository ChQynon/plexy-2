// Этот файл нужен для Vercel - он служит точкой входа для вебхука
const path = require('path');
const dotenv = require('dotenv');
const { existsSync, mkdirSync } = require('fs');

// Загрузка переменных окружения
dotenv.config();

// Создание временной директории, если она не существует
const tempDir = path.join(__dirname, '../temp');
if (!existsSync(tempDir)) {
  mkdirSync(tempDir, { recursive: true });
}

// Установка переменных окружения для вебхука
process.env.NODE_ENV = 'production';
process.env.WEBHOOK_URL = 'https://plexy-2.vercel.app/api/webhook';

// Импортируем TypeScript исходный код с помощью ts-node
require('ts-node/register');

// Импортируем основной файл бота
const app = require('../src/index.ts');

// Экспортируем приложение для Vercel
module.exports = app; 