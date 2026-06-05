const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

let waitingFor = {};

function getVideo() {
  return mongoose.model('Video');
}

bot.onText(/\/start/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, '❌ Not authorized');
  bot.sendMessage(msg.chat.id, `👋 Welcome Admin!\n\nCommands:\n/add - Add new video\n/delete - Delete a video\n/edit - Edit a video\n/stats - View statistics\n/list - List all videos`);
});

bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const Video = getVideo();
  const total = await Video.countDocuments();
  const views = await Video.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
  bot.sendMessage(msg.chat.id, `📊 Stats:\n🎬 Total Videos: ${total}\n👁 Total Views: ${views[0]?.total || 0}`);
});

bot.onText(/\/add/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  waitingFor[msg.chat.id] = { step: 'title' };
  bot.sendMessage(msg.chat.id, '📝 Send me the video *title*:', { parse_mode: 'Markdown' });
});

bot.onText(/\/list/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const Video = getVideo();
  const videos = await Video.find().sort({ createdAt: -1 });
  if (videos.length === 0) return bot.sendMessage(msg.chat.id, 'No videos yet.');
  const chunkSize = 20;
  for (let i = 0; i < videos.length; i += chunkSize) {
    const chunk = videos.slice(i, i + chunkSize);
    let text = `🎬 Videos ${i+1}-${i+chunk.length} of ${videos.length}:\n\n`;
    chunk.forEach((v, j) => {
      text += `${i+j+1}. ${v.title}\nID: \`${v._id}\`\n\n`;
    });
    await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/delete/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  waitingFor[msg.chat.id] = { step: 'delete_id' };
  bot.sendMessage(msg.chat.id, '🗑 Send me the video *ID* to delete:\n(Use /list to find IDs)', { parse_mode: 'Markdown' });
});

bot.onText(/\/edit/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  waitingFor[msg.chat.id] = { step: 'edit_id' };
  bot.sendMessage(msg.chat.id, '✏️ Send me the video *ID* to edit:\n(Use /list to find IDs)', { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== ADMIN_ID) return;
  if (!waitingFor[chatId]) return;
  if (msg.text && msg.text.startsWith('/')) return;

  const state = waitingFor[chatId];

  try {
    if (state.step === 'title') {
      waitingFor[chatId] = { step: 'iframe', title: msg.text };
      bot.sendMessage(chatId, '🔗 Now send the *iframe URL* or full iframe tag:', { parse_mode: 'Markdown' });

    } else if (state.step === 'iframe') {
      let iframeUrl = msg.text;
      const srcMatch = msg.text.match(/src=["']([^"']+)["']/i);
      if (srcMatch) iframeUrl = srcMatch[1];
      waitingFor[chatId] = { step: 'thumbnail', title: state.title, iframe: iframeUrl };
      bot.sendMessage(chatId, '🖼 Now send the *thumbnail image URL*:', { parse_mode: 'Markdown' });

    } else if (state.step === 'thumbnail') {
      const Video = getVideo();
      const video = new Video({
        title: state.title,
        iframe: state.iframe,
        thumbnail: msg.text
      });
      await video.save();
      delete waitingFor[chatId];
      bot.sendMessage(chatId, `✅ Video added!\n\n🎬 *${state.title}*`, { parse_mode: 'Markdown' });

    } else if (state.step === 'delete_id') {
      const Video = getVideo();
      await Video.findByIdAndDelete(msg.text.trim());
      delete waitingFor[chatId];
      bot.sendMessage(chatId, '✅ Video deleted!');

    } else if (state.step === 'edit_id') {
      const Video = getVideo();
      const video = await Video.findById(msg.text.trim());
      if (!video) {
        bot.sendMessage(chatId, '❌ Video not found! Check the ID.');
        delete waitingFor[chatId];
        return;
      }
      waitingFor[chatId] = { step: 'edit_field', id: msg.text.trim(), title: video.title };
      bot.sendMessage(chatId, `✏️ Editing: *${video.title}*\n\nWhat do you want to edit?`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Title', callback_data: 'edit_title' }],
            [{ text: '🔗 Iframe URL', callback_data: 'edit_iframe' }],
            [{ text: '🖼 Thumbnail', callback_data: 'edit_thumbnail' }]
          ]
        }
      });

    } else if (state.step === 'edit_title_input') {
      const Video = getVideo();
      await Video.findByIdAndUpdate(state.id, { title: msg.text });
      delete waitingFor[chatId];
      bot.sendMessage(chatId, `✅ Title updated to: *${msg.text}*`, { parse_mode: 'Markdown' });

    } else if (state.step === 'edit_iframe_input') {
      let iframeUrl = msg.text;
      const srcMatch = msg.text.match(/src=["']([^"']+)["']/i);
      if (srcMatch) iframeUrl = srcMatch[1];
      const Video = getVideo();
      await Video.findByIdAndUpdate(state.id, { iframe: iframeUrl });
      delete waitingFor[chatId];
      bot.sendMessage(chatId, '✅ Iframe URL updated!');

    } else if (state.step === 'edit_thumbnail_input') {
      const Video = getVideo();
      await Video.findByIdAndUpdate(state.id, { thumbnail: msg.text });
      delete waitingFor[chatId];
      bot.sendMessage(chatId, '✅ Thumbnail updated!');
    }

  } catch (e) {
    bot.sendMessage(chatId, '❌ Error: ' + e.message);
    delete waitingFor[chatId];
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  if (chatId !== ADMIN_ID) return;

  const state = waitingFor[chatId];
  if (!state) return;

  if (query.data === 'edit_title') {
    waitingFor[chatId] = { step: 'edit_title_input', id: state.id };
    bot.sendMessage(chatId, '📝 Send the *new title*:', { parse_mode: 'Markdown' });
  } else if (query.data === 'edit_iframe') {
    waitingFor[chatId] = { step: 'edit_iframe_input', id: state.id };
    bot.sendMessage(chatId, '🔗 Send the *new iframe URL* or full iframe tag:', { parse_mode: 'Markdown' });
  } else if (query.data === 'edit_thumbnail') {
    waitingFor[chatId] = { step: 'edit_thumbnail_input', id: state.id };
    bot.sendMessage(chatId, '🖼 Send the *new thumbnail URL*:', { parse_mode: 'Markdown' });
  }

  bot.answerCallbackQuery(query.id);
});

console.log('Bot is running...');
