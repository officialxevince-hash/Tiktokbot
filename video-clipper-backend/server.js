import express from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, 'uploads');
const OUTPUT_DIR = process.env.OUTPUT_DIR || join(__dirname, 'clips');

// Ensure directories exist
await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(OUTPUT_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/clips', express.static(OUTPUT_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'), false);
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

// Store video metadata
const videos = new Map();

// POST /upload - Upload video
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const videoId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const filePath = req.file.path;

    // Get video duration
    const duration = await getVideoDuration(filePath);
    
    videos.set(videoId, {
      id: videoId,
      filePath,
      duration,
      originalName: req.file.originalname
    });

    res.json({ videoId });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /clip - Generate clips from video
app.post('/clip', async (req, res) => {
  const startTime = Date.now();
  try {
    const { videoId, maxLength = 15 } = req.body;

    if (!videoId || !videos.has(videoId)) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = videos.get(videoId);
    console.log(`[POST /clip] Starting clip generation for video ${videoId} (${video.duration}s)`);
    
    const clips = await generateClips(video.filePath, videoId, maxLength);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[POST /clip] Generated ${clips.length} clips in ${elapsed}s`);

    res.json({ clips });
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[POST /clip] Clipping error after ${elapsed}s:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Get video duration
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

// Helper: Generate clips using FAST time-based splitting (skip slow detection for MVP)
async function generateClips(inputPath, videoId, maxLength) {
  try {
    const duration = await getVideoDuration(inputPath);
    console.log(`[generateClips] Video duration: ${duration}s, using fast time-based splitting`);
    
    // For MVP: Skip slow scene/silence detection, use fast time-based splitting
    // This is much faster and good enough for MVP
    return await generateTimeBasedClips(inputPath, videoId, duration, maxLength);
  } catch (error) {
    console.error('Error in generateClips:', error);
    // Fallback to time-based splitting
    const duration = await getVideoDuration(inputPath);
    return generateTimeBasedClips(inputPath, videoId, duration, maxLength);
  }
}

// Helper: Detect scene changes
function detectSceneChanges(inputPath, threshold) {
  return new Promise((resolve, reject) => {
    const sceneChanges = [];
    
    ffmpeg(inputPath)
      .outputOptions([
        '-vf', `select='gt(scene,${threshold})',showinfo`,
        '-vsync', '0',
        '-f', 'null'
      ])
      .on('stderr', (stderrLine) => {
        const match = stderrLine.match(/pts_time:(\d+\.?\d*)/);
        if (match) {
          const time = parseFloat(match[1]);
          sceneChanges.push(time);
        }
      })
      .on('end', () => resolve(sceneChanges))
      .on('error', (err) => {
        console.warn('Scene detection failed, continuing without it:', err.message);
        resolve([]); // Don't fail, just return empty array
      })
      .run();
  });
}

// Helper: Detect silence in video
function detectSilence(inputPath, threshold) {
  return new Promise((resolve, reject) => {
    const silencePoints = [];
    let lastSilenceEnd = 0;

    ffmpeg(inputPath)
      .outputOptions([
        '-af', `silencedetect=noise=${threshold}dB:d=0.5`,
        '-f', 'null'
      ])
      .on('stderr', (stderrLine) => {
        // silencedetect outputs: silence_start and silence_end
        const startMatch = stderrLine.match(/silence_start: ([\d.]+)/);
        const endMatch = stderrLine.match(/silence_end: ([\d.]+)/);
        
        if (startMatch) {
          const time = parseFloat(startMatch[1]);
          if (time - lastSilenceEnd > 3) { // Min 3 seconds between clips
            silencePoints.push(time);
          }
        }
        if (endMatch) {
          lastSilenceEnd = parseFloat(endMatch[1]);
        }
      })
      .on('end', () => {
        resolve(silencePoints);
      })
      .on('error', (err) => {
        console.warn('Silence detection failed, continuing without it:', err.message);
        resolve([]); // Don't fail, just return empty array
      })
      .run();
  });
}

// Helper: Generate clips from detected points
async function generateClipsFromPoints(inputPath, videoId, points, maxLength, duration) {
  const clips = [];
  const outputBase = join(OUTPUT_DIR, videoId);
  await mkdir(outputBase, { recursive: true });

  // Ensure we have end point
  const allPoints = [...points];
  if (allPoints.length === 0 || allPoints[allPoints.length - 1] < duration - 1) {
    allPoints.push(duration);
  }

  // Generate clips
  for (let i = 0; i < allPoints.length - 1; i++) {
    let start = allPoints[i];
    const end = allPoints[i + 1];
    
    // Split into multiple clips if segment is too long
    while (end - start > maxLength) {
      const clipDuration = maxLength;

      const clipId = `clip-${clips.length + 1}`;
      const outputPath = join(outputBase, `${clipId}.mp4`);

      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .setStartTime(start)
          .setDuration(clipDuration)
          .output(outputPath)
          .on('end', () => {
            clips.push({
              id: clipId,
              url: `/clips/${videoId}/${clipId}.mp4`,
              duration: clipDuration
            });
            resolve();
          })
          .on('error', reject)
          .run();
      });

      start += maxLength;
    }

    // Regular clip for remaining segment
    const clipDuration = end - start;
    if (clipDuration >= 3) {
      const clipId = `clip-${clips.length + 1}`;
      const outputPath = join(outputBase, `${clipId}.mp4`);

      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .setStartTime(start)
          .setDuration(clipDuration)
          .output(outputPath)
          .on('end', () => {
            clips.push({
              id: clipId,
              url: `/clips/${videoId}/${clipId}.mp4`,
              duration: clipDuration
            });
            resolve();
          })
          .on('error', reject)
          .run();
      });
    }
  }

  // If no clips generated, create one default clip
  if (clips.length === 0) {
    return generateTimeBasedClips(inputPath, videoId, duration, maxLength);
  }

  return clips;
}

// Helper: Generate time-based clips - OPTIMIZED FOR SPEED
async function generateTimeBasedClips(inputPath, videoId, duration, maxLength) {
  const clips = [];
  const outputBase = join(OUTPUT_DIR, videoId);
  await mkdir(outputBase, { recursive: true });

  // Calculate all clip segments first
  const segments = [];
  let start = 0;
  let clipIndex = 1;

  while (start < duration) {
    const clipDuration = Math.min(maxLength, duration - start);
    
    if (clipDuration >= 3 || start + clipDuration >= duration) {
      segments.push({ start, duration: clipDuration, index: clipIndex });
      clipIndex++;
    }
    start += clipDuration;
  }

  const totalClips = segments.length;
  console.log(`[generateClips] Generating ${totalClips} clips in parallel...`);

  // Process clips in parallel batches (3 at a time for speed)
  const maxConcurrent = 3;
  for (let i = 0; i < segments.length; i += maxConcurrent) {
    const batch = segments.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(({ start: clipStart, duration: clipDuration, index }) => {
      const clipId = `clip-${index}`;
      const outputPath = join(outputBase, `${clipId}.mp4`);

      return new Promise((resolve, reject) => {
        console.log(`[generateClips] Processing clip ${index}/${totalClips} (${clipStart.toFixed(1)}s - ${(clipStart + clipDuration).toFixed(1)}s)`);
        
        ffmpeg(inputPath)
          .setStartTime(clipStart)
          .setDuration(clipDuration)
          .outputOptions([
            '-c:v', 'libx264',           // H.264 codec
            '-preset', 'ultrafast',      // FASTEST encoding (lower quality but much faster)
            '-crf', '23',                // Good quality balance
            '-c:a', 'copy',              // Copy audio (no re-encoding = much faster!)
            '-movflags', '+faststart',   // Optimize for streaming
            '-threads', '0'              // Use all CPU cores
          ])
          .output(outputPath)
          .on('end', () => {
            console.log(`[generateClips] ✓ Clip ${index} completed`);
            clips.push({
              id: clipId,
              url: `/clips/${videoId}/${clipId}.mp4`,
              duration: clipDuration
            });
            resolve();
          })
          .on('error', (err) => {
            console.error(`[generateClips] ✗ Error processing clip ${index}:`, err.message);
            reject(err);
          })
          .run();
      });
    });

    await Promise.all(batchPromises);
  }

  // Sort clips by index
  clips.sort((a, b) => {
    const aNum = parseInt(a.id.split('-')[1]);
    const bNum = parseInt(b.id.split('-')[1]);
    return aNum - bNum;
  });

  console.log(`[generateClips] ✓ All ${clips.length} clips generated successfully`);
  return clips;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Server accessible at http://192.168.40.29:${PORT}`);
});

