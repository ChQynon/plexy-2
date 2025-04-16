// Этот файл нужен для Vercel - он служит точкой входа для вебхука

// Импортируем приложение Express из основного файла
const app = require('../dist/index.js');

// Экспортируем обработчик для serverless функций Vercel
module.exports = app; 