// === FORGEZONE $10M COACH: FULL server.js ===
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'forgezone-secret-2025';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// === CORS ===
app.use(cors({
  origin: ['http://localhost:3000', 'https://forgezone.netlify.app'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// === MONGODB ===
const DB_NAME = MONGO_URI.split('/').pop().split('?')[0];
mongoose.connect(MONGO_URI, { dbName: DB_NAME })
  .then(() => console.log(`MongoDB Connected: ${DB_NAME}`))
  .catch(err => console.error('MongoDB Error:', err));

// === USER SCHEMA ===
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  workouts: [{ text: String, completed: Boolean, timestamp: String }],
  goal: { goal: String, level: String, bodyPart: String, bmi: Number, noEquipment: Boolean },
  streak: { type: Number, default: 0 },
  rank: { type: String, default: 'Bronze' },
  totalWorkouts: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// === AUTH MIDDLEWARE ===
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.userId = decoded.id;
    next();
  });
};

// === MOCK WORKOUTS — CARDIO IN ALL GOALS & LEVELS ===
const workouts = {
  'Build Muscle': {
    beginner: {
      abs: ['3x10 Crunches', '3x12 Leg Raises', '2x30s Plank', '3x15 Bicycle Crunches', '3x12 Russian Twists'],
      chest: ['3x10 Push-Ups', '3x12 Incline Push-Ups', '2x15 Chest Dips', '3x10 Dumbbell Bench Press', '3x12 Dumbbell Flys'],
      back: ['3x8 Bent-Over Rows', '3x10 Supermans', '2x12 Reverse Flys', '3x10 Dumbbell Rows', '3x12 Band Pull-Aparts'],
      legs: ['3x10 Bodyweight Squats', '3x12 Lunges', '2x15 Calf Raises', '3x10 Goblet Squats', '3x12 Step-Ups'],
      arms: ['3x10 Bicep Curls', '3x12 Tricep Dips', '2x15 Hammer Curls', '3x10 Dumbbell Kickbacks', '3x12 Concentration Curls'],
      shoulders: ['3x10 Shoulder Press', '3x12 Lateral Raises', '2x15 Front Raises', '3x10 Dumbbell Shrugs', '3x12 Y-Raises'],
      glutes: ['3x10 Glute Bridges', '3x12 Donkey Kicks', '2x15 Fire Hydrants', '3x10 Clamshells', '3x12 Side-Lying Leg Lifts'],
      cardio: ['20 min Jog', '15 min Jump Rope', '10 min Burpees', '20 min Brisk Walk', '15 min High Knees', '12 min Stair Climbing']
    },
    intermediate: {
      abs: ['4x12 Hanging Leg Raises', '3x45s Plank', '4x15 Russian Twists', '3x15 Mountain Climbers', '4x12 Cable Woodchoppers'],
      chest: ['4x8 Bench Press', '3x12 Dumbbell Flys', '4x10 Incline Press', '3x12 Cable Crossovers', '4x8 Dumbbell Pullover'],
      back: ['4x8 Pull-Ups', '3x10 Bent-Over Rows', '4x10 Lat Pulldowns', '3x12 T-Bar Rows', '4x8 Dumbbell Shrugs'],
      legs: ['4x8 Squats', '3x12 Lunges', '4x10 Leg Press', '3x12 Romanian Deadlifts', '4x8 Goblet Squats'],
      arms: ['4x8 Bicep Curls', '3x12 Tricep Pushdowns', '4x10 Skull Crushers', '3x12 Overhead Extension', '4x8 Close-Grip Bench'],
      shoulders: ['4x8 Overhead Press', '3x12 Lateral Raises', '4x10 Arnold Press', '3x12 Front Raises', '4x8 Dumbbell Shrugs'],
      glutes: ['4x8 Hip Thrusts', '3x12 Glute Kickbacks', '4x10 Single-Leg Bridges', '3x15 Sumo Squats', '4x8 Barbell Hip Thrusts'],
      cardio: ['30 min Run', '20 min Jump Rope', '15 min Sprint Intervals', '25 min Rowing', '20 min Cycling', '18 min Battle Ropes']
    },
    advanced: {
      abs: ['5x15 Weighted Crunches', '4x20 Cable Woodchoppers', '3x60s Plank', '5x12 Hanging Knee Raises', '4x15 Ab Rollouts'],
      chest: ['5x5 Bench Press', '4x10 Incline Dumbbell Press', '5x8 Weighted Push-Ups', '4x10 Dumbbell Pullover', '5x6 Chest Press Machine'],
      back: ['5x5 Deadlifts', '4x8 Weighted Pull-Ups', '5x6 T-Bar Rows', '4x10 Lat Pulldowns', '5x8 Rack Pulls'],
      legs: ['5x5 Barbell Squats', '4x10 Lunges', '5x6 Romanian Deadlifts', '4x10 Bulgarian Split Squats', '5x8 Hack Squats'],
      arms: ['5x5 Barbell Curls', '4x10 Weighted Dips', '5x6 Close-Grip Bench', '4x10 Skull Crushers', '5x8 Zottman Curls'],
      shoulders: ['5x5 Military Press', '4x10 Arnold Press', '5x8 Dumbbell Press', '4x10 Rear Delt Flys', '5x6 Barbell Shrugs'],
      glutes: ['5x5 Hip Thrusts', '4x10 Single-Leg Glute Bridges', '5x6 Sumo Squats', '4x10 Cable Kickbacks', '5x8 Barbell Glute Bridges'],
      cardio: ['45 min Run', '30 min HIIT', '20 min Assault Bike', '40 min Rowing', '25 min Stairmaster', '30 min Sled Push']
    }
  },
  'Build Endurance': {
    beginner: {
      abs: ['3x15 Bicycle Crunches', '3x20 Mountain Climbers', '2x30s Hollow Hold', '3x15 Plank', '3x20 Russian Twists'],
      chest: ['3x15 Push-Ups', '3x20 Chest Dips', '2x30s Isometric Press', '3x20 Wide Push-Ups', '3x15 Incline Push-Ups'],
      back: ['3x15 Supermans', '3x20 Bodyweight Rows', '2x30s Plank Rows', '3x15 Band Pull-Aparts', '3x20 Cat-Cow'],
      legs: ['2km Jog', '3x15 Bodyweight Squats', '3x20 Walking Lunges', '3x15 Calf Raises', '2x20s Wall Sits'],
      arms: ['3x15 Arm Circles', '3x20 Tricep Dips', '2x30s Shadow Boxing', '3x15 Bicep Curls', '3x20 Pushdowns'],
      shoulders: ['3x15 Shoulder Taps', '3x20 Front Raises', '2x30s Lateral Hold', '3x15 Lateral Raises', '3x20 Y-Raises'],
      glutes: ['3x15 Glute Bridges', '3x20 Donkey Kicks', '2x30s Squat Hold', '3x15 Fire Hydrants', '3x20 Clamshells'],
      cardio: ['25 min Jog', '20 min Jump Rope', '15 min Burpees', '25 min Brisk Walk', '20 min High Knees', '18 min Stair Climb']
    },
    intermediate: {
      abs: ['4x20 Mountain Climbers', '3x30 Russian Twists', '3x45s Plank', '4x15 Bicycle Crunches', '3x20 Hanging Leg Raises'],
      chest: ['4x12 Push-Ups', '3x15 Incline Push-Ups', '3x20 Burpees', '4x15 Chest Dips', '3x20 Wide Push-Ups'],
      back: ['4x12 Bodyweight Rows', '3x15 Supermans', '3x20 Plank Rows', '4x12 Band Pull-Aparts', '3x15 Dumbbell Rows'],
      legs: ['5km Run', '3x20 Lunges', '3x15 Jump Squats', '4x15 Step-Ups', '3x20 Calf Raises'],
      arms: ['4x12 Bicep Curls', '3x15 Tricep Pushdowns', '3x20 Shadow Boxing', '4x15 Hammer Curls', '3x20 Pushdowns'],
      shoulders: ['4x12 Lateral Raises', '3x15 Shoulder Press', '3x20 Y-Raises', '4x15 Front Raises', '3x20 Shoulder Taps'],
      glutes: ['4x12 Glute Kickbacks', '3x15 Sumo Squats', '3x20 Fire Hydrants', '4x15 Glute Bridges', '3x20 Single-Leg Bridges'],
      cardio: ['35 min Run', '25 min Jump Rope', '18 min Sprint Intervals', '30 min Rowing', '25 min Cycling', '20 min Battle Ropes']
    },
    advanced: {
      abs: ['5x25 Mountain Climbers', '4x30 Weighted Russian Twists', '3x60s Plank', '5x20 Hanging Leg Raises', '4x20 V-Ups'],
      chest: ['5x15 Clapping Push-Ups', '4x20 Incline Dumbbell Press', '3x25 Burpees', '5x15 Weighted Push-Ups', '4x20 Chest Dips'],
      back: ['5x10 Pull-Ups', '4x15 Deadlifts', '3x20 Bent-Over Rows', '5x12 Lat Pulldowns', '4x15 T-Bar Rows'],
      legs: ['10km Run', '4x20 Jump Lunges', '3x15 Pistol Squats', '5x15 Box Jumps', '4x20 Calf Raises'],
      arms: ['5x15 Weighted Dips', '4x20 Hammer Curls', '3x25 Shadow Boxing', '5x12 Bicep Curls', '4x15 Skull Crushers'],
      shoulders: ['5x10 Overhead Press', '4x15 Rear Delt Flys', '3x20 Lateral Raises', '5x12 Arnold Press', '4x15 Y-Raises'],
      glutes: ['5x10 Hip Thrusts', '4x15 Single-Leg Glute Bridges', '3x20 Sumo Squats', '5x12 Cable Kickbacks', '4x15 Squat Pulses'],
      cardio: ['50 min Run', '35 min HIIT', '25 min Assault Bike', '45 min Rowing', '30 min Stairmaster', '35 min Sled Push']
    }
  },
  'Build Strength': {
    beginner: {
      abs: ['3x10 Crunches', '3x12 Leg Raises', '2x30s Plank', '3x10 Bicycle Crunches', '3x12 Russian Twists'],
      chest: ['3x10 Push-Ups', '3x12 Incline Push-Ups', '2x15 Chest Dips', '3x10 Dumbbell Bench Press', '3x12 Wide Push-Ups'],
      back: ['3x8 Bodyweight Rows', '3x10 Supermans', '2x12 Reverse Flys', '3x10 Dumbbell Rows', '3x12 Band Pull-Aparts'],
      legs: ['3x10 Bodyweight Squats', '3x12 Lunges', '2x15 Calf Raises', '3x10 Goblet Squats', '3x12 Step-Ups'],
      arms: ['3x10 Bicep Curls', '3x12 Tricep Dips', '2x15 Hammer Curls', '3x10 Dumbbell Kickbacks', '3x12 Concentration Curls'],
      shoulders: ['3x10 Shoulder Press', '3x12 Lateral Raises', '2x15 Front Raises', '3x10 Dumbbell Shrugs', '3x12 Y-Raises'],
      glutes: ['3x10 Glute Bridges', '3x12 Donkey Kicks', '2x15 Fire Hydrants', '3x10 Clamshells', '3x12 Side-Lying Leg Lifts'],
      cardio: ['20 min Jog', '15 min Jump Rope', '10 min Burpees', '20 min Brisk Walk', '15 min High Knees', '12 min Stair Climbing']
    },
    intermediate: {
      abs: ['4x12 Hanging Leg Raises', '3x45s Plank', '4x12 Russian Twists', '3x15 Mountain Climbers', '4x10 Side Plank'],
      chest: ['4x8 Bench Press', '3x12 Dumbbell Flys', '3x10 Push-Ups', '4x10 Incline Bench Press', '3x12 Cable Crossovers'],
      back: ['4x8 Pull-Ups', '3x10 Bent-Over Rows', '3x12 Deadlifts', '4x10 Lat Pulldowns', '3x12 T-Bar Rows'],
      legs: ['4x8 Squats', '3x12 Lunges', '3x10 Step-Ups', '4x10 Leg Press', '3x12 Romanian Deadlifts'],
      arms: ['4x8 Bicep Curls', '3x12 Tricep Pushdowns', '3x10 Skull Crushers', '4x10 Preacher Curls', '3x12 Overhead Extension'],
      shoulders: ['4x8 Overhead Press', '3x12 Lateral Raises', '3x10 Rear Delt Flys', '4x10 Arnold Press', '3x12 Front Raises'],
      glutes: ['4x8 Hip Thrusts', '3x12 Glute Kickbacks', '3x15 Sumo Squats', '4x10 Single-Leg Glute Bridges', '3x12 Cable Pull-Throughs'],
      cardio: ['30 min Run', '20 min Jump Rope', '15 min Sprint Intervals', '25 min Rowing', '20 min Cycling', '18 min Battle Ropes']
    },
    advanced: {
      abs: ['5x15 Weighted Crunches', '4x20 Cable Woodchoppers', '3x60s Plank', '5x12 Hanging Knee Raises', '4x15 Ab Rollouts'],
      chest: ['5x5 Bench Press', '4x10 Incline Dumbbell Press', '3x12 Cable Flys', '5x8 Weighted Push-Ups', '4x10 Dumbbell Pullover'],
      back: ['5x5 Deadlifts', '4x8 Weighted Pull-Ups', '3x12 Barbell Rows', '5x6 T-Bar Rows', '4x10 Lat Pulldowns'],
      legs: ['5x5 Barbell Squats', '4x10 Lunges', '3x12 Leg Press', '5x6 Romanian Deadlifts', '4x10 Bulgarian Split Squats'],
      arms: ['5x5 Barbell Curls', '4x10 Weighted Dips', '3x12 Concentration Curls', '5x6 Close-Grip Bench', '4x10 Skull Crushers'],
      shoulders: ['5x5 Military Press', '4x10 Arnold Press', '3x12 Upright Rows', '5x6 Barbell Shrugs', '4x10 Rear Delt Flys'],
      glutes: ['5x5 Hip Thrusts', '4x10 Single-Leg Glute Bridges', '3x12 Barbell Sumo Squats', '5x6 Weighted Step-Ups', '4x10 Cable Kickbacks'],
      cardio: ['45 min Run', '30 min HIIT', '20 min Assault Bike', '40 min Rowing', '25 min Stairmaster', '30 min Sled Push']
    }
  }
};

// === AUTH ROUTES ===
app.post('/api/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

  const { email, password } = req.body;
  const hashed = crypto.createHash('sha256').update(password).digest('hex');

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User exists' });

    const user = await User.create({ email, password: hashed });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, email } });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const hashed = crypto.createHash('sha256').update(password).digest('hex');
  const user = await User.findOne({ email, password: hashed });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { _id: user._id, email: user.email, goal: user.goal } });
});

// === GOAL + BMI ===
app.post('/api/goal', authenticate, async (req, res) => {
  const { goal, level, bodyPart, bmi, noEquipment } = req.body;
  await User.updateOne({ _id: req.userId }, { $set: { goal: { goal, level, bodyPart, bmi, noEquipment } } });
  res.json({ message: 'Goal saved' });
});

app.get('/api/goal', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json(user.goal || {});
});

// === WORKOUTS ===
app.post('/api/workout', authenticate, async (req, res) => {
  const { text } = req.body;
  const timestamp = new Date().toISOString();
  await User.updateOne(
    { _id: req.userId },
    { $push: { workouts: { text, completed: false, timestamp } } }
  );
  res.json({ message: 'Logged' });
});

app.get('/api/workouts', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json(user.workouts || []);
});

// === WEEKLY INSIGHTS (SMART) ===
app.get('/api/insights', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = user.workouts.filter(w => w.completed && new Date(w.timestamp) > weekAgo);

  if (recent.length < 3) return res.json({ insights: null });

  const parts = recent.map(w => w.text.toLowerCase());
  const chest = parts.filter(t => t.includes('push') || t.includes('bench')).length;
  const back = parts.filter(t => t.includes('pull') || t.includes('row')).length;
  const legs = parts.filter(t => t.includes('squat') || t.includes('lunge')).length;
  const cardio = parts.filter(t => t.includes('run') || t.includes('jog') || t.includes('rope')).length;

  let insight = `Great job on ${recent.length} workouts this week! `;
  if (chest > back + 1) insight += 'Balance: Add back rows. ';
  if (legs < 2) insight += 'Leg day missing — squat tomorrow! ';
  if (cardio < 1 && user.goal?.bmi > 25) insight += 'Add 10 min cardio daily. ';

  res.json({ insights: insight });
});

// === AI SUGGESTIONS + FALLBACK ===
app.post('/api/suggestions', authenticate, [
  body('goal').isIn(['Build Muscle', 'Build Endurance', 'Build Strength']),
  body('fitnessLevel').isIn(['beginner', 'intermediate', 'advanced']),
  body('bodyPart').isIn(['abs', 'chest', 'back', 'legs', 'arms', 'shoulders', 'glutes', 'cardio'])
], async (req, res) => {
  const { goal, fitnessLevel, bodyPart, bmi, noEquipment } = req.body;
  const user = await User.findById(req.userId);
  const past = user.workouts.slice(-5).map(w => w.text).join(', ') || 'None';

  const prompt = `Suggest 5 ${fitnessLevel} ${goal} ${bodyPart} exercises. BMI: ${bmi || 'unknown'}${noEquipment ? '. Bodyweight only.' : ''}. Past: ${past}. Return JSON array.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ role: 'user', parts: [{ text: prompt }] }] }
    );
    let text = response.data.candidates[0].content.parts[0].text;
    text = text.replace(/```json|```/g, '').trim();
    let suggestions = JSON.parse(text);
    res.json({ suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 5) : [suggestions] });
  } catch (err) {
    const fallback = (workouts[goal]?.[fitnessLevel]?.[bodyPart] || []).sort(() => 0.5 - Math.random()).slice(0, 5);
    res.json({ suggestions: fallback, note: 'AI offline' });
  }
});

// === LEADERBOARD + STREAK + RANK ===
app.get('/api/leaderboard', async (req, res) => {
  const users = await User.find().sort({ streak: -1, totalWorkouts: -1 }).limit(10);
  res.json(users.map(u => ({ email: u.email, streak: u.streak, rank: u.rank })));
});

app.post('/api/complete', authenticate, async (req, res) => {
  const { timestamp } = req.body;
  const user = await User.findById(req.userId);

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const lastDate = user.workouts.find(w => w.timestamp.startsWith(yesterday)) ? yesterday : null;

  let streak = user.streak;
  if (lastDate) streak++;
  else if (!user.workouts.some(w => w.timestamp.startsWith(today))) streak = 1;

  const rank = streak < 7 ? 'Bronze' : streak < 30 ? 'Silver' : streak < 100 ? 'Gold' : 'Diamond';

  await User.updateOne(
    { _id: req.userId, 'workouts.timestamp': timestamp },
    { $set: { 'workouts.$.completed': true, streak, rank }, $inc: { totalWorkouts: 1 } }
  );
  res.json({ message: 'Completed', streak, rank });
});

// === HEALTH ===
app.get('/api/health', (req, res) => res.json({ status: 'OK', db: 'Connected' }));

app.listen(PORT, () => {
  console.log(`Server LIVE on PORT ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});

module.exports = app;