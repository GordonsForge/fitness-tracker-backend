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
  origin: [
    'http://localhost:3000',
    'https://forgezone.netlify.app'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// === MONGODB CONNECT ===
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// === USER SCHEMA ===
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  workouts: [{ text: String, completed: Boolean, timestamp: String }],
  goal: { goal: String, level: String, bodyPart: String, bmi: Number, noEquipment: Boolean }
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

// === MOCK WORKOUTS (FALLBACK) ===
const workouts = {
  'Build Muscle': {
    beginner: {
      abs: ['3x10 Crunches', '3x12 Leg Raises', '2x30s Plank', '3x15 Bicycle Crunches', '3x12 Russian Twists', '3x15 Mountain Climbers', '2x20s Side Plank', '3x10 Flutter Kicks'],
      chest: ['3x10 Push-Ups', '3x12 Incline Push-Ups', '2x15 Chest Dips', '3x10 Dumbbell Bench Press', '3x12 Dumbbell Flys', '2x15 Wide Push-Ups', '3x10 Decline Push-Ups', '2x20s Isometric Chest Press'],
      back: ['3x8 Bent-Over Rows (Light)', '3x10 Reverse Flys', '2x12 Supermans', '3x10 Dumbbell Rows', '3x12 Band Pull-Aparts', '2x15 Cat-Cow Stretch', '3x10 Face Pulls', '2x20s Plank Rows'],
      legs: ['3x10 Bodyweight Squats', '3x12 Lunges', '2x15 Calf Raises', '3x10 Goblet Squats', '3x12 Step-Ups', '2x15 Wall Sits', '3x10 Side Lunges', '2x12 Box Jumps'],
      arms: ['3x10 Bicep Curls (Light)', '3x12 Tricep Dips', '2x15 Hammer Curls', '3x10 Dumbbell Kickbacks', '3x12 Concentration Curls', '2x15 Arm Circles', '3x10 Overhead Tricep Extension', '2x12 Pushdowns'],
      shoulders: ['3x10 Shoulder Press (Light)', '3x12 Lateral Raises', '2x15 Front Raises', '3x10 Dumbbell Shrugs', '3x12 Y-Raises', '2x15 Shoulder Taps', '3x10 Reverse Flys', '2x12 Pike Push-Ups'],
      glutes: ['3x10 Glute Bridges', '3x12 Donkey Kicks', '2x15 Fire Hydrants', '3x10 Clamshells', '3x12 Side-Lying Leg Lifts', '2x15 Squat Pulses', '3x10 Hip Thrusts', '2x12 Single-Leg Bridges']
    },
    intermediate: {
      abs: ['4x12 Hanging Leg Raises', '3x15 Bicycle Crunches', '3x45s Plank', '4x12 Russian Twists', '3x15 Mountain Climbers', '3x12 Cable Woodchoppers', '3x20s Side Plank', '4x10 V-Ups'],
      chest: ['4x8 Bench Press (Moderate)', '3x12 Dumbbell Flys', '3x10 Push-Ups', '4x10 Incline Bench Press', '3x12 Cable Crossovers', '3x15 Decline Push-Ups', '4x8 Dumbbell Pullover', '3x12 Chest Press Machine'],
      back: ['4x8 Pull-Ups', '3x10 Bent-Over Rows', '3x12 Deadlifts (Moderate)', '4x10 Lat Pulldowns', '3x12 T-Bar Rows', '3x10 Seated Cable Rows', '4x8 Dumbbell Shrugs', '3x12 Inverted Rows'],
      legs: ['4x8 Squats (Moderate)', '3x12 Lunges', '3x10 Step-Ups', '4x10 Leg Press', '3x12 Romanian Deadlifts', '3x10 Bulgarian Split Squats', '4x8 Goblet Squats', '3x12 Calf Raises'],
      arms: ['4x8 Bicep Curls', '3x12 Tricep Pushdowns', '3x10 Skull Crushers', '4x10 Preacher Curls', '3x12 Overhead Tricep Extension', '3x10 Zottman Curls', '4x8 Close-Grip Bench Press', '3x12 Hammer Curls'],
      shoulders: ['4x8 Overhead Press', '3x12 Lateral Raises', '3x10 Rear Delt Flys', '4x10 Arnold Press', '3x12 Front Raises', '3x10 Upright Rows', '4x8 Dumbbell Shrugs', '3x12 Cable Lateral Raises'],
      glutes: ['4x8 Hip Thrusts', '3x12 Glute Kickbacks', '3x15 Sumo Squats', '4x10 Single-Leg Glute Bridges', '3x12 Cable Pull-Throughs', '3x10 Step-Ups', '4x8 Barbell Hip Thrusts', '3x12 Side Lunges']
    },
    advanced: {
      abs: ['5x15 Weighted Crunches', '4x20 Cable Woodchoppers', '3x60s Plank', '5x12 Hanging Knee Raises', '4x15 Ab Rollouts', '3x10 Dragon Flags', '4x20 Weighted Russian Twists', '3x15 V-Ups'],
      chest: ['5x5 Bench Press (Heavy)', '4x10 Incline Dumbbell Press', '3x12 Cable Flys', '5x8 Weighted Push-Ups', '4x10 Dumbbell Pullover', '3x12 Decline Bench Press', '5x6 Chest Press Machine', '4x12 Wide Push-Ups'],
      back: ['5x5 Deadlifts (Heavy)', '4x8 Weighted Pull-Ups', '3x12 Barbell Rows', '5x6 T-Bar Rows', '4x10 Lat Pulldowns', '3x12 Dumbbell Rows', '5x8 Rack Pulls', '4x10 Seated Cable Rows'],
      legs: ['5x5 Barbell Squats (Heavy)', '4x10 Lunges (Weighted)', '3x12 Leg Press', '5x6 Romanian Deadlifts', '4x10 Bulgarian Split Squats', '3x12 Front Squats', '5x8 Hack Squats', '4x12 Calf Raises'],
      arms: ['5x5 Barbell Curls', '4x10 Weighted Dips', '3x12 Concentration Curls', '5x6 Close-Grip Bench Press', '4x10 Skull Crushers', '3x12 Preacher Curls', '5x8 Zottman Curls', '4x10 Rope Pushdowns'],
      shoulders: ['5x5 Military Press', '4x10 Arnold Press', '3x12 Upright Rows', '5x6 Barbell Shrugs', '4x10 Rear Delt Flys', '3x12 Cable Lateral Raises', '5x8 Dumbbell Press', '4x10 Face Pulls'],
      glutes: ['5x5 Hip Thrusts (Heavy)', '4x10 Single-Leg Glute Bridges', '3x12 Barbell Sumo Squats', '5x6 Weighted Step-Ups', '4x10 Cable Kickbacks', '3x12 Romanian Deadlifts', '5x8 Barbell Glute Bridges', '4x10 Side-Lying Leg Lifts']
    }
  },
  'Build Endurance': {
    beginner: {
      abs: ['3x15 Bicycle Crunches', '3x20 Mountain Climbers', '2x30s Hollow Hold', '3x15 Plank', '3x20 Russian Twists', '2x20s Side Plank', '3x15 Flutter Kicks', '3x20 Leg Raises'],
      chest: ['3x15 Push-Ups', '3x20 Chest Dips', '2x30s Isometric Chest Press', '3x20 Wide Push-Ups', '3x15 Incline Push-Ups', '2x20s Plank Push-Ups', '3x15 Decline Push-Ups', '3x20 Burpees'],
      back: ['3x15 Supermans', '3x20 Bodyweight Rows', '2x30s Plank Rows', '3x15 Band Pull-Aparts', '3x20 Cat-Cow Stretch', '2x20s Inverted Rows', '3x15 Dumbbell Rows', '3x20 Face Pulls'],
      legs: ['2km Jog', '3x15 Bodyweight Squats', '3x20 Walking Lunges', '3x15 Calf Raises', '2x20s Wall Sits', '3x15 Step-Ups', '3x20 Side Lunges', '2x15 Jump Squats'],
      arms: ['3x15 Arm Circles', '3x20 Tricep Dips', '2x30s Shadow Boxing', '3x15 Bicep Curls (Light)', '3x20 Pushdowns', '2x20s Isometric Curls', '3x15 Hammer Curls', '3x20 Shoulder Taps'],
      shoulders: ['3x15 Shoulder Taps', '3x20 Front Raises (Light)', '2x30s Lateral Hold', '3x15 Lateral Raises', '3x20 Y-Raises', '2x20s Pike Push-Ups', '3x15 Dumbbell Shrugs', '3x20 Reverse Flys'],
      glutes: ['3x15 Glute Bridges', '3x20 Donkey Kicks', '2x30s Squat Hold', '3x15 Fire Hydrants', '3x20 Clamshells', '2x20s Side-Lying Leg Lifts', '3x15 Squat Pulses', '3x20 Single-Leg Bridges']
    },
    intermediate: {
      abs: ['4x20 Mountain Climbers', '3x30 Russian Twists', '3x45s Plank', '4x15 Bicycle Crunches', '3x20 Hanging Leg Raises', '3x20 Flutter Kicks', '4x15 Side Plank', '3x20 V-Ups'],
      chest: ['4x12 Push-Ups', '3x15 Incline Push-Ups', '3x20 Burpees', '4x15 Chest Dips', '3x20 Wide Push-Ups', '3x15 Decline Push-Ups', '4x12 Plank Push-Ups', '3x20 Dumbbell Flys'],
      back: ['4x12 Bodyweight Rows', '3x15 Supermans', '3x20 Plank Rows', '4x12 Band Pull-Aparts', '3x15 Dumbbell Rows', '3x20 Inverted Rows', '4x12 Face Pulls', '3x15 Lat Pulldowns'],
      legs: ['5km Run', '3x20 Lunges', '3x15 Jump Squats', '4x15 Step-Ups', '3x20 Calf Raises', '3x15 Side Lunges', '4x12 Box Jumps', '3x20 Wall Sits'],
      arms: ['4x12 Bicep Curls (Light)', '3x15 Tricep Pushdowns', '3x20 Shadow Boxing', '4x15 Hammer Curls', '3x20 Pushdowns', '3x15 Arm Circles', '4x12 Overhead Tricep Extension', '3x20 Zottman Curls'],
      shoulders: ['4x12 Lateral Raises', '3x15 Shoulder Press (Light)', '3x20 Y-Raises', '4x15 Front Raises', '3x20 Shoulder Taps', '3x15 Reverse Flys', '4x12 Dumbbell Shrugs', '3x20 Pike Push-Ups'],
      glutes: ['4x12 Glute Kickbacks', '3x15 Sumo Squats', '3x20 Fire Hydrants', '4x15 Glute Bridges', '3x20 Single-Leg Bridges', '3x15 Squat Pulses', '4x12 Cable Pull-Throughs', '3x20 Side-Lying Leg Lifts']
    },
    advanced: {
      abs: ['5x25 Mountain Climbers', '4x30 Weighted Russian Twists', '3x60s Plank with Leg Lift', '5x20 Hanging Leg Raises', '4x20 V-Ups', '3x15 Ab Rollouts', '5x20 Flutter Kicks', '4x15 Side Plank with Hip Dips'],
      chest: ['5x15 Clapping Push-Ups', '4x20 Incline Dumbbell Press', '3x25 Burpees', '5x15 Weighted Push-Ups', '4x20 Chest Dips', '3x20 Wide Push-Ups', '5x15 Decline Push-Ups', '4x20 Cable Crossovers'],
      back: ['5x10 Pull-Ups', '4x15 Deadlifts (Moderate)', '3x20 Bent-Over Rows', '5x12 Lat Pulldowns', '4x15 T-Bar Rows', '3x20 Dumbbell Rows', '5x10 Inverted Rows', '4x15 Face Pulls'],
      legs: ['10km Run', '4x20 Jump Lunges', '3x15 Pistol Squats', '5x15 Box Jumps', '4x20 Calf Raises', '3x20 Side Lunges', '5x12 Weighted Step-Ups', '4x15 Jump Squats'],
      arms: ['5x15 Weighted Dips', '4x20 Hammer Curls', '3x25 Shadow Boxing', '5x12 Bicep Curls', '4x15 Skull Crushers', '3x20 Pushdowns', '5x12 Zottman Curls', '4x15 Overhead Tricep Extension'],
      shoulders: ['5x10 Overhead Press', '4x15 Rear Delt Flys', '3x20 Lateral Raises', '5x12 Arnold Press', '4x15 Y-Raises', '3x20 Face Pulls', '5x12 Dumbbell Shrugs', '4x15 Pike Push-Ups'],
      glutes: ['5x10 Hip Thrusts (Moderate)', '4x15 Single-Leg Glute Bridges', '3x20 Sumo Squats', '5x12 Cable Kickbacks', '4x15 Squat Pulses', '3x20 Clamshells', '5x10 Weighted Step-Ups', '4x15 Side-Lying Leg Lifts']
    }
  },
  'Build Strength': {
    beginner: {
      abs: ['3x10 Crunches', '3x12 Leg Raises', '2x30s Plank', '3x10 Bicycle Crunches', '3x12 Russian Twists', '2x20s Side Plank', '3x10 Flutter Kicks', '3x12 Mountain Climbers'],
      chest: ['3x10 Push-Ups', '3x12 Incline Push-Ups', '2x15 Chest Dips', '3x10 Dumbbell Bench Press', '3x12 Wide Push-Ups', '2x15 Decline Push-Ups', '3x10 Dumbbell Flys', '2x20s Isometric Chest Press'],
      back: ['3x8 Bodyweight Rows', '3x10 Supermans', '2x12 Reverse Flys', '3x10 Dumbbell Rows', '3x12 Band Pull-Aparts', '2x15 Cat-Cow Stretch', '3x10 Face Pulls', '2x12 Plank Rows'],
      legs: ['3x10 Bodyweight Squats', '3x12 Lunges', '2x15 Calf Raises', '3x10 Goblet Squats', '3x12 Step-Ups', '2x15 Wall Sits', '3x10 Side Lunges', '2x12 Box Jumps'],
      arms: ['3x10 Bicep Curls (Light)', '3x12 Tricep Dips', '2x15 Hammer Curls', '3x10 Dumbbell Kickbacks', '3x12 Concentration Curls', '2x15 Arm Circles', '3x10 Overhead Tricep Extension', '2x12 Pushdowns'],
      shoulders: ['3x10 Shoulder Press (Light)', '3x12 Lateral Raises', '2x15 Front Raises', '3x10 Dumbbell Shrugs', '3x12 Y-Raises', '2x15 Shoulder Taps', '3x10 Reverse Flys', '2x12 Pike Push-Ups'],
      glutes: ['3x10 Glute Bridges', '3x12 Donkey Kicks', '2x15 Fire Hydrants', '3x10 Clamshells', '3x12 Side-Lying Leg Lifts', '2x15 Squat Pulses', '3x10 Hip Thrusts', '2x12 Single-Leg Bridges']
    },
    intermediate: {
      abs: ['4x12 Hanging Leg Raises', '3x15 Bicycle Crunches', '3x45s Plank', '4x12 Russian Twists', '3x15 Mountain Climbers', '3x12 Cable Woodchoppers', '4x10 Side Plank', '3x12 V-Ups'],
      chest: ['4x8 Bench Press (Moderate)', '3x12 Dumbbell Flys', '3x10 Push-Ups', '4x10 Incline Bench Press', '3x12 Cable Crossovers', '3x15 Decline Push-Ups', '4x8 Dumbbell Pullover', '3x12 Chest Press Machine'],
      back: ['4x8 Pull-Ups', '3x10 Bent-Over Rows', '3x12 Deadlifts (Moderate)', '4x10 Lat Pulldowns', '3x12 T-Bar Rows', '3x10 Seated Cable Rows', '4x8 Dumbbell Shrugs', '3x12 Inverted Rows'],
      legs: ['4x8 Squats (Moderate)', '3x12 Lunges', '3x10 Step-Ups', '4x10 Leg Press', '3x12 Romanian Deadlifts', '3x10 Bulgarian Split Squats', '4x8 Goblet Squats', '3x12 Calf Raises'],
      arms: ['4x8 Bicep Curls', '3x12 Tricep Pushdowns', '3x10 Skull Crushers', '4x10 Preacher Curls', '3x12 Overhead Tricep Extension', '3x10 Zottman Curls', '4x8 Close-Grip Bench Press', '3x12 Hammer Curls'],
      shoulders: ['4x8 Overhead Press', '3x12 Lateral Raises', '3x10 Rear Delt Flys', '4x10 Arnold Press', '3x12 Front Raises', '3x10 Upright Rows', '4x8 Dumbbell Shrugs', '3x12 Cable Lateral Raises'],
      glutes: ['4x8 Hip Thrusts', '3x12 Glute Kickbacks', '3x15 Sumo Squats', '4x10 Single-Leg Glute Bridges', '3x12 Cable Pull-Throughs', '3x10 Step-Ups', '4x8 Barbell Hip Thrusts', '3x12 Side Lunges']
    },
    advanced: {
      abs: ['5x15 Weighted Crunches', '4x20 Cable Woodchoppers', '3x60s Plank', '5x12 Hanging Knee Raises', '4x15 Ab Rollouts', '3x10 Dragon Flags', '4x20 Weighted Russian Twists', '3x15 V-Ups'],
      chest: ['5x5 Bench Press (Heavy)', '4x10 Incline Dumbbell Press', '3x12 Cable Flys', '5x8 Weighted Push-Ups', '4x10 Dumbbell Pullover', '3x12 Decline Bench Press', '5x6 Chest Press Machine', '4x12 Wide Push-Ups'],
      back: ['5x5 Deadlifts (Heavy)', '4x8 Weighted Pull-Ups', '3x12 Barbell Rows', '5x6 T-Bar Rows', '4x10 Lat Pulldowns', '3x12 Dumbbell Rows', '5x8 Rack Pulls', '4x10 Seated Cable Rows'],
      legs: ['5x5 Barbell Squats (Heavy)', '4x10 Lunges (Weighted)', '3x12 Leg Press', '5x6 Romanian Deadlifts', '4x10 Bulgarian Split Squats', '3x12 Front Squats', '5x8 Hack Squats', '4x12 Calf Raises'],
      arms: ['5x5 Barbell Curls', '4x10 Weighted Dips', '3x12 Concentration Curls', '5x6 Close-Grip Bench Press', '4x10 Skull Crushers', '3x12 Preacher Curls', '5x8 Zottman Curls', '4x10 Rope Pushdowns'],
      shoulders: ['5x5 Military Press', '4x10 Arnold Press', '3x12 Upright Rows', '5x6 Barbell Shrugs', '4x10 Rear Delt Flys', '3x12 Cable Lateral Raises', '5x8 Dumbbell Press', '4x10 Face Pulls'],
      glutes: ['5x5 Hip Thrusts (Heavy)', '4x10 Single-Leg Glute Bridges', '3x12 Barbell Sumo Squats', '5x6 Weighted Step-Ups', '4x10 Cable Kickbacks', '3x12 Romanian Deadlifts', '5x8 Barbell Glute Bridges', '4x10 Side-Lying Leg Lifts']
    }
  }
};

// === AUTH ROUTES ===
app.post('/api/register', [
  body('email').isEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Invalid input' });

  const { email, password } = req.body;
  const hashed = crypto.createHash('sha256').update(password).digest('hex');

  try {
    const user = await User.create({ email, password: hashed, workouts: [], goal: {} });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { email: user.email } });
  } catch (err) {
    res.status(400).json({ message: 'User exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const hashed = crypto.createHash('sha256').update(password).digest('hex');
  const user = await User.findOne({ email, password: hashed });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { email: user.email, goal: user.goal } });
});

// === GOAL ROUTES ===
app.post('/api/goal', authenticate, async (req, res) => {
  const { goal, level, bodyPart, bmi, noEquipment } = req.body;
  await User.updateOne(
    { _id: req.userId },
    { $set: { 'goal': { goal, level, bodyPart, bmi, noEquipment } } }
  );
  res.json({ message: 'Goal saved' });
});

app.get('/api/goal', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json(user.goal);
});

// === WORKOUT ROUTES ===
app.post('/api/workout', authenticate, async (req, res) => {
  const { text } = req.body;
  await User.updateOne(
    { _id: req.userId },
    { $push: { workouts: { text, completed: false, timestamp: new Date().toISOString() } } }
  );
  res.json({ message: 'Logged' });
});

app.post('/api/complete', authenticate, async (req, res) => {
  const { timestamp } = req.body;
  await User.updateOne(
    { _id: req.userId, 'workouts.timestamp': timestamp },
    { $set: { 'workouts.$.completed': true } }
  );
  res.json({ message: 'Completed' });
});

app.get('/api/workouts', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json(user.workouts);
});

// === NEW: AI INSIGHTS AFTER 3+ COMPLETED WORKOUTS ===
app.get('/api/insights', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const completedCount = user.workouts.filter(w => w.completed).length;
    if (completedCount < 3) {
      return res.json({ insights: null });
    }

    const goal = user.goal;
    const insights = [
      `Great job on ${completedCount} workouts! You're on fire!`,
      `Focus: ${goal?.bodyPart || 'Full Body'} – Keep pushing!`,
      `Tip: Increase weight by 5% next session to break plateaus.`,
      `You're ${((completedCount / 7) * 100).toFixed(0)}% to weekly mastery!`,
      `Pro move: Add 1 drop set to your last exercise.`,
      `Your BMI: ${goal?.bmi?.toFixed(1) || 'N/A'} – Stay consistent!`
    ];

    res.json({ insights: insights.join(' | ') });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// === END NEW ===

// === AI SUGGESTIONS + INSIGHTS ===
app.post('/api/suggestions',
  [
    body('goal').isIn(['Build Muscle', 'Build Endurance', 'Build Strength']),
    body('fitnessLevel').isIn(['beginner', 'intermediate', 'advanced']),
    body('bodyPart').isIn(['abs', 'chest', 'back', 'legs', 'arms', 'shoulders', 'glutes']),
    body('bmi').optional().isFloat({ min: 10, max: 50 }),
    body('noEquipment').optional().isBoolean()
  ],
  authenticate,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed' });

    const { goal, fitnessLevel, bodyPart, bmi, noEquipment } = req.body;
    const user = await User.findById(req.userId);
    const pastWorkouts = user.workouts.slice(-10).map(w => w.text).join(', ') || 'None';

    const safeNoEquipment = bmi > 25 || noEquipment;

    const prompt = `
Suggest 5 ${fitnessLevel} ${goal} exercises for ${bodyPart}.
BMI: ${bmi || 'unknown'}${safeNoEquipment ? '. NO equipment. Bodyweight only.' : ''}.
Past workouts: ${pastWorkouts}
Return ONLY JSON array: ["3x12 Push-Ups"]`;

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { headers: { 'Content-Type': 'application/json' } }
      );

      let text = response.data.candidates[0].content.parts[0].text;
      text = text.replace(/```json|```/g, '').trim();
      let suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) suggestions = [suggestions];

      res.json({ suggestions: suggestions.slice(0, 5) });
    } catch (err) {
      console.error('Gemini Error:', err.message);
      const fallback = workouts[goal][fitnessLevel][bodyPart].sort(() => 0.5 - Math.random()).slice(0, 5);
      res.json({ suggestions: fallback, note: 'AI offline' });
    }
  }
);

// Helper: Categorize workout
function categorize(text) {
  const t = text.toLowerCase();
  if (t.includes('push') || t.includes('bench') || t.includes('chest')) return 'chest';
  if (t.includes('pull') || t.includes('row') || t.includes('back')) return 'back';
  if (t.includes('squat') || t.includes('lunge') || t.includes('leg')) return 'legs';
  if (t.includes('run') || t.includes('jog') || t.includes('cardio')) return 'cardio';
  return 'other';
}

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend is live!',
    timestamp: new Date().toISOString()
  });
});

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;