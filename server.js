require('./bot');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Video Schema
const videoSchema = new mongoose.Schema({
  title: String,
  iframe: String,
  thumbnail: String,
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const Video = mongoose.model('Video', videoSchema);

// Routes
app.get('/api/videos', async (req, res) => {
  const videos = await Video.find().sort({ createdAt: -1 });
  res.json(videos);
});

app.get('/api/videos/:id', async (req, res) => {
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ message: 'Not found' });
  video.views += 1;
  await video.save();
  res.json(video);
});

app.post('/api/videos', async (req, res) => {
  const { title, iframe, thumbnail } = req.body;
  const video = new Video({ title, iframe, thumbnail });
  await video.save();
  res.json(video);
});

app.delete('/api/videos/:id', async (req, res) => {
  await Video.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

app.get('/api/stats', async (req, res) => {
  const total = await Video.countDocuments();
  const views = await Video.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
  res.json({ totalVideos: total, totalViews: views[0]?.total || 0 });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
