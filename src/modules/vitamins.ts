import { Composer, Markup } from 'telegraf';

export const vitaminsModule = new Composer();

// Handle /vitamins command
vitaminsModule.command('vitamins', async (ctx) => {
  await ctx.reply(
    'Выберите раздел о витаминах и минералах:',
    Markup.keyboard([
      ['Водорастворимые витамины', 'Жирорастворимые витамины'],
      ['Минералы', 'Признаки дефицита'],
      ['Правила приема', 'Назад в главное меню']
    ]).resize()
  );
});

// Handle vitamins keyboard options
vitaminsModule.hears('Водорастворимые витамины', async (ctx) => {
  const message = `
*Водорастворимые витамины*

Группа B:
- B1 (тиамин): участвует в обмене углеводов, нервной регуляции
- B2 (рибофлавин): важен для роста, энергетического обмена
- B3 (ниацин): участвует в окислительно-восстановительных реакциях
- B5 (пантотеновая кислота): участвует в энергетическом обмене
- B6 (пиридоксин): участвует в обмене аминокислот
- B7 (биотин): участвует в метаболизме жиров и углеводов
- B9 (фолиевая кислота): необходима для кроветворения, важна при беременности
- B12 (кобаламин): участвует в кроветворении, функционировании нервной системы

Витамин C (аскорбиновая кислота):
- Антиоксидант
- Укрепляет иммунитет
- Способствует усвоению железа
- Участвует в синтезе коллагена
`;
  
  await ctx.replyWithMarkdownV2(message.replace(/\-/g, '\\-'));
});

vitaminsModule.hears('Жирорастворимые витамины', async (ctx) => {
  const message = `
*Жирорастворимые витамины*

Витамин A (ретинол):
- Поддерживает зрение
- Участвует в росте и развитии клеток
- Поддерживает иммунитет

Витамин D:
- Регулирует обмен кальция и фосфора
- Поддерживает здоровье костей и зубов
- Участвует в работе иммунной системы

Витамин E:
- Мощный антиоксидант
- Защищает клеточные мембраны
- Поддерживает иммунитет

Витамин K:
- Необходим для свертывания крови
- Участвует в формировании костей
- Регулирует обмен кальция
`;
  
  await ctx.replyWithMarkdownV2(message.replace(/\-/g, '\\-'));
});

vitaminsModule.hears('Минералы', async (ctx) => {
  const message = `
*Основные минералы и их функции*

Макроэлементы:
- Кальций: формирование костей, свертывание крови, нервная проводимость
- Магний: более 300 биохимических реакций, мышечная релаксация
- Калий: электролитный баланс, нервная проводимость
- Натрий: электролитный баланс, нервно-мышечная функция
- Фосфор: формирование костей, энергетический обмен
- Хлор: электролитный баланс, пищеварение

Микроэлементы:
- Железо: транспорт кислорода, энергетический обмен
- Цинк: иммунитет, синтез ДНК, заживление ран
- Йод: функция щитовидной железы
- Селен: антиоксидантная защита
- Медь: кроветворение, иммунитет
- Марганец: формирование костей, метаболизм
`;
  
  await ctx.replyWithMarkdownV2(message.replace(/\-/g, '\\-'));
});

vitaminsModule.hears('Признаки дефицита', async (ctx) => {
  const message = `
*Признаки дефицита витаминов и минералов*

Витамин A: 
- Сухость кожи и слизистых
- Куриная слепота
- Замедление роста

Витамины группы B:
- Усталость, слабость
- Трещины в уголках рта
- Дерматит
- Нарушения нервной системы

Витамин C:
- Кровоточивость десен
- Медленное заживление ран
- Ослабленный иммунитет

Витамин D:
- Размягчение костей
- Мышечная слабость
- Повышенный риск переломов

Кальций:
- Судороги мышц
- Остеопороз
- Нарушение свертываемости крови

Железо:
- Бледность
- Слабость, утомляемость
- Снижение иммунитета
`;
  
  await ctx.replyWithMarkdownV2(message.replace(/\-/g, '\\-'));
});

vitaminsModule.hears('Правила приема', async (ctx) => {
  const message = `
*Правила приема витаминов*

Общие рекомендации:
- Принимайте витамины после еды для лучшего усвоения
- Соблюдайте рекомендованные дозировки
- Водорастворимые витамины лучше принимать утром
- Жирорастворимые витамины лучше принимать с пищей, содержащей жиры

Комбинации:
- Кальций и магний лучше усваиваются с витамином D
- Витамин C улучшает усвоение железа
- Цинк и медь конкурируют за усвоение, принимайте в разное время

Противопоказания:
- Не превышайте рекомендуемые дозы
- При заболеваниях печени, почек и некоторых других состояниях необходима консультация врача
- Некоторые витамины могут взаимодействовать с лекарствами
`;
  
  await ctx.replyWithMarkdownV2(message.replace(/\-/g, '\\-'));
});

vitaminsModule.hears('Назад в главное меню', async (ctx) => {
  await ctx.reply(
    'Вы вернулись в главное меню. Выберите интересующий вас раздел или задайте вопрос:',
    Markup.keyboard([
      ['/vitamins', '/plants'],
      ['/help']
    ]).resize()
  );
}); 