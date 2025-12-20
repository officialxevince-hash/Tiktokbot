import express from 'express';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, 'uploads');
const OUTPUT_DIR = process.env.OUTPUT_DIR || join(__dirname, 'clips');

// Ensure directories exist
await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(OUTPUT_DIR, { recursive: true });

// System info helper
function getSystemInfo() {
  const memUsage = process.memoryUsage();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  
  let ffmpegVersion = 'unknown';
  try {
    ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8', timeout: 2000 })
      .split('\n')[0]
      .trim();
  } catch (err) {
    ffmpegVersion = 'not available';
  }
  
  return {
    node: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    memory: {
      total: `${(memTotal / 1024 / 1024 / 1024).toFixed(2)} GB`,
      free: `${(memFree / 1024 / 1024 / 1024).toFixed(2)} GB`,
      used: `${((memTotal - memFree) / 1024 / 1024 / 1024).toFixed(2)} GB`,
      process: {
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
      }
    },
    ffmpeg: ffmpegVersion,
    uptime: `${(os.uptime() / 60).toFixed(1)} minutes`,
    env: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development',
      uploadDir: UPLOAD_DIR,
      outputDir: OUTPUT_DIR,
    }
  };
}

// Log system info at startup
console.log('='.repeat(60));
console.log('🚀 Video Clipper Backend Starting...');
console.log('='.repeat(60));
const sysInfo = getSystemInfo();
console.log('📊 System Information:');
console.log(JSON.stringify(sysInfo, null, 2));
console.log('='.repeat(60));

// Increase timeout for long-running requests (Render has 30s default, we need more)
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000);
  next();
});

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
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max (Render has 30GB memory, so we can handle larger files)
});

// Store video metadata
const videos = new Map();

// POST /upload - Upload video
app.post('/upload', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  const memBefore = process.memoryUsage();
  
  try {
    // Handle multer errors (file too large, etc.)
    if (req.file === undefined) {
      if (req.headers['content-length']) {
        const fileSizeMB = (parseInt(req.headers['content-length']) / 1024 / 1024).toFixed(2);
        console.error(`[POST /upload] ❌ File too large: ${fileSizeMB}MB (max: 500MB)`);
        return res.status(413).json({ 
          error: `File too large: ${fileSizeMB}MB. Maximum file size is 500MB.` 
        });
      }
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const videoId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

    console.log(`[POST /upload] ⏱️  START - ${new Date().toISOString()}`);
    console.log(`[POST /upload] 📁 File: ${req.file.originalname}`);
    console.log(`[POST /upload] 📦 Size: ${fileSizeMB} MB (${fileSize} bytes)`);
    console.log(`[POST /upload] 💾 Memory before: RSS=${(memBefore.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memBefore.heapUsed / 1024 / 1024).toFixed(2)}MB`);

    // Get video duration
    const duration = await getVideoDuration(filePath);
    
    videos.set(videoId, {
      id: videoId,
      filePath,
      duration,
      originalName: req.file.originalname,
      fileSize,
      uploadedAt: new Date().toISOString()
    });

    const memAfter = process.memoryUsage();
    const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const memDelta = ((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(2);
    
    console.log(`[POST /upload] ✅ SUCCESS - Video ID: ${videoId}`);
    console.log(`[POST /upload] ⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log(`[POST /upload] ⏱️  Upload time: ${uploadTime}s`);
    console.log(`[POST /upload] 💾 Memory after: RSS=${(memAfter.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`[POST /upload] 💾 Memory delta: ${memDelta > 0 ? '+' : ''}${memDelta}MB`);

    res.json({ videoId });
  } catch (error) {
    const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[POST /upload] ❌ ERROR after ${uploadTime}s:`, error.message);
    console.error(`[POST /upload] Stack:`, error.stack);
    
    // Handle specific multer errors
    if (error.name === 'MulterError') {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          error: 'File too large. Maximum file size is 500MB.' 
        });
      }
      return res.status(400).json({ error: `Upload error: ${error.message}` });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// POST /clip - Generate clips from video
app.post('/clip', async (req, res) => {
  const startTime = Date.now();
  const startTimeISO = new Date().toISOString();
  const memBefore = process.memoryUsage();
  
  try {
    const { videoId, maxLength = 15 } = req.body;

    if (!videoId || !videos.has(videoId)) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = videos.get(videoId);
    const fileSizeMB = video.fileSize ? (video.fileSize / 1024 / 1024).toFixed(2) : 'unknown';
    
    console.log(`[POST /clip] ⏱️  START - ${startTimeISO}`);
    console.log(`[POST /clip] 📹 Video ID: ${videoId}`);
    console.log(`[POST /clip] 📁 File: ${video.originalName} (${fileSizeMB} MB)`);
    console.log(`[POST /clip] ⏱️  Duration: ${video.duration.toFixed(2)}s, Max clip length: ${maxLength}s`);
    console.log(`[POST /clip] 💾 Memory before: RSS=${(memBefore.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memBefore.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`[POST /clip] 🖥️  System: ${os.cpus().length} CPUs, ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)}GB free`);
    
    const clipsStart = Date.now();
    const clips = await generateClips(video.filePath, videoId, maxLength);
    const clipsTime = ((Date.now() - clipsStart) / 1000).toFixed(2);
    
    const memAfter = process.memoryUsage();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const memDelta = ((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(2);
    
    console.log(`[POST /clip] ✅ SUCCESS - Generated ${clips.length} clips in ${clipsTime}s (total: ${totalTime}s)`);
    console.log(`[POST /clip] 💾 Memory after: RSS=${(memAfter.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`[POST /clip] 💾 Memory delta: ${memDelta > 0 ? '+' : ''}${memDelta}MB`);
    console.log(`[POST /clip] 📊 Clips: ${clips.map(c => `${c.id}(${c.duration.toFixed(1)}s)`).join(', ')}`);

    res.json({ clips });
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const memAfter = process.memoryUsage();
    console.error(`[POST /clip] ❌ ERROR after ${elapsed}s:`, error.message);
    console.error(`[POST /clip] 💾 Memory at error: RSS=${(memAfter.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.error(`[POST /clip] Stack:`, error.stack);
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
  const startTime = Date.now();
  try {
    const durationStart = Date.now();
    const duration = await getVideoDuration(inputPath);
    const durationTime = ((Date.now() - durationStart) / 1000).toFixed(3);
    console.log(`[generateClips] ⏱️  Video duration: ${duration.toFixed(2)}s (retrieved in ${durationTime}s)`);
    console.log(`[generateClips] Using fast time-based splitting (no scene/silence detection)`);
    
    // For MVP: Skip slow scene/silence detection, use fast time-based splitting
    // This is much faster and good enough for MVP
    const clips = await generateTimeBasedClips(inputPath, videoId, duration, maxLength);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[generateClips] ✅ Complete in ${totalTime}s`);
    return clips;
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[generateClips] ❌ ERROR after ${totalTime}s:`, error.message);
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
  const memStart = process.memoryUsage();

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
  const clipsStartTime = Date.now();
  const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
  console.log(`[generateClips] 🎬 Generating ${totalClips} clips sequentially...`);
  console.log(`[generateClips] 💾 Memory at start: RSS=${(memStart.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memStart.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`[generateClips] 🖥️  System: ${freeMemGB}GB free memory, ${os.cpus().length} CPUs available`);

  // Process clips sequentially to stay under 512MB memory limit
  // Render free tier has 512MB limit - parallel processing causes OOM
  // Sequential is slower but reliable
  const maxConcurrent = 1;
  for (let i = 0; i < segments.length; i += maxConcurrent) {
    const batch = segments.slice(i, i + maxConcurrent);
    const batchStart = Date.now();
    const batchPromises = batch.map(({ start: clipStart, duration: clipDuration, index }) => {
      const clipId = `clip-${index}`;
      const outputPath = join(outputBase, `${clipId}.mp4`);
      const clipStartTime = Date.now();

      return new Promise((resolve, reject) => {
        const clipMemBefore = process.memoryUsage();
        const clipFreeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        console.log(`[generateClips] 🎬 Clip ${index}/${totalClips} (${clipStart.toFixed(1)}s-${(clipStart + clipDuration).toFixed(1)}s)`);
        console.log(`[generateClips] 💾 Memory before clip: RSS=${(clipMemBefore.rss / 1024 / 1024).toFixed(2)}MB, Free=${clipFreeMem}GB`);
        
        ffmpeg(inputPath)
          .inputOptions([
            '-thread_queue_size', '512'  // Input option: small queue size for memory efficiency
          ])
          .setStartTime(clipStart)
          .setDuration(clipDuration)
          .outputOptions([
            '-c:v', 'libx264',           // H.264 codec
            '-preset', 'ultrafast',      // FASTEST encoding
            '-crf', '28',                // Lower quality for speed (28 is still acceptable)
            '-c:a', 'copy',              // Copy audio (no re-encoding = much faster!)
            '-movflags', '+faststart',   // Optimize for streaming
            '-threads', '1',             // Single thread to minimize memory usage
            '-tune', 'fastdecode',       // Optimize for fast decoding
            '-pix_fmt', 'yuv420p',       // Ensure compatibility
            '-bufsize', '512k',          // Small buffer to reduce memory
            '-maxrate', '1M'             // Low bitrate to reduce memory usage
          ])
          .output(outputPath)
          .on('end', () => {
            const clipTime = ((Date.now() - clipStartTime) / 1000).toFixed(2);
            const clipMemAfter = process.memoryUsage();
            const clipMemDelta = ((clipMemAfter.rss - clipMemBefore.rss) / 1024 / 1024).toFixed(2);
            const clipFreeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
            console.log(`[generateClips] ✓ Clip ${index} done in ${clipTime}s`);
            console.log(`[generateClips] 💾 Memory after clip: RSS=${(clipMemAfter.rss / 1024 / 1024).toFixed(2)}MB (${clipMemDelta > 0 ? '+' : ''}${clipMemDelta}MB), Free=${clipFreeMem}GB`);
            clips.push({
              id: clipId,
              url: `/clips/${videoId}/${clipId}.mp4`,
              duration: clipDuration
            });
            resolve();
          })
          .on('error', (err) => {
            const clipTime = ((Date.now() - clipStartTime) / 1000).toFixed(2);
            console.error(`[generateClips] ✗ Clip ${index} failed after ${clipTime}s:`, err.message);
            reject(err);
          })
          .run();
      });
    });

    await Promise.all(batchPromises);
    const batchTime = ((Date.now() - batchStart) / 1000).toFixed(2);
    const batchMemAfter = process.memoryUsage();
    const batchFreeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    console.log(`[generateClips] ✓ Batch ${Math.floor(i / maxConcurrent) + 1} completed in ${batchTime}s`);
    console.log(`[generateClips] 💾 Memory after batch: RSS=${(batchMemAfter.rss / 1024 / 1024).toFixed(2)}MB, Free=${batchFreeMem}GB`);
    
    // Force garbage collection hint after each batch (Node.js will GC when needed)
    if (global.gc) {
      global.gc();
      const memAfterGC = process.memoryUsage();
      console.log(`[generateClips] 🗑️  After GC: RSS=${(memAfterGC.rss / 1024 / 1024).toFixed(2)}MB`);
    }
  }
  
  const clipsTime = ((Date.now() - clipsStartTime) / 1000).toFixed(2);
  const memFinal = process.memoryUsage();
  const memTotalDelta = ((memFinal.rss - memStart.rss) / 1024 / 1024).toFixed(2);
  console.log(`[generateClips] ✅ All ${clips.length} clips generated in ${clipsTime}s`);
  console.log(`[generateClips] 💾 Final memory: RSS=${(memFinal.rss / 1024 / 1024).toFixed(2)}MB (${memTotalDelta > 0 ? '+' : ''}${memTotalDelta}MB from start)`);

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
  const sysInfo = getSystemInfo();
  console.log('='.repeat(60));
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`✅ Server accessible at http://localhost:${PORT}`);
  
  // Log network interfaces
  const networkInterfaces = os.networkInterfaces();
  for (const interfaceName in networkInterfaces) {
    const networkInterface = networkInterfaces[interfaceName];
    for (const iface of networkInterface) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`✅ Server accessible at http://${iface.address}:${PORT}`);
      }
    }
  }
  
  console.log('='.repeat(60));
  console.log('📊 Runtime Environment:');
  console.log(`   Node.js: ${sysInfo.node}`);
  console.log(`   Platform: ${sysInfo.platform} (${sysInfo.arch})`);
  console.log(`   CPUs: ${sysInfo.cpus} (${sysInfo.cpuModel})`);
  console.log(`   Memory: ${sysInfo.memory.total} total, ${sysInfo.memory.free} free`);
  console.log(`   Process Memory: ${sysInfo.memory.process.rss} RSS, ${sysInfo.memory.process.heapUsed} heap`);
  console.log(`   FFmpeg: ${sysInfo.ffmpeg}`);
  console.log(`   Upload Dir: ${sysInfo.env.uploadDir}`);
  console.log(`   Output Dir: ${sysInfo.env.outputDir}`);
  console.log('='.repeat(60));
});

