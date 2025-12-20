# Deployment Guide

## Cloud Platform Deployment (Render, Heroku, Railway, etc.)

### ✅ Use `npm start` or `bun run start`

Cloud platforms like Render automatically run the `start` script from `package.json`:

```json
{
  "scripts": {
    "start": "node server.js"  // ✅ Production mode (no file watching)
  }
}
```

**Why not `dev`?**
- `dev` uses `node --watch` which watches for file changes
- Wastes CPU/memory in production
- Not needed since code doesn't change in production

### Render Configuration

1. **Build Command**: (leave empty or use `npm install`)
2. **Start Command**: `npm start` (or `bun run start`)
3. **Environment Variables**:
   - `PORT` (automatically set by Render)
   - `NODE_ENV=production` (optional, but recommended)

### Other Platforms

- **Heroku**: Uses `npm start` automatically
- **Railway**: Uses `npm start` automatically  
- **Vercel**: Configure start command in `vercel.json`
- **AWS/DigitalOcean**: Use `npm start` in your process manager (PM2, systemd, etc.)

## Local Development

### Use `start.sh` for local development:

```bash
./start.sh
```

This script:
- Kills existing processes on port 3000
- Runs `bun run dev` (with file watching)

### Or manually:

```bash
# Development (with file watching)
bun run dev
# or
npm run dev

# Production mode (no file watching)
bun run start
# or
npm start
```

## Summary

| Environment | Command | File Watching | Use Case |
|------------|---------|---------------|----------|
| **Cloud/Production** | `npm start` | ❌ No | Render, Heroku, etc. |
| **Local Development** | `npm run dev` | ✅ Yes | Your machine |
| **Local (with script)** | `./start.sh` | ✅ Yes | Your machine (kills old processes) |

## Important Notes

1. **Never use `dev` in production** - it wastes resources
2. **Render automatically uses `start` script** - no configuration needed
3. **The `start.sh` script is for local dev only** - don't use it on cloud platforms
4. **Port is set by environment** - Render sets `PORT` automatically


