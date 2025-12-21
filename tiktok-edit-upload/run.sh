#!/bin/bash

# TikTokAI Music Video Bot - Setup and Run Script
# This script creates a virtual environment, installs dependencies, and runs the bot

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${CYAN}[+] TikTokAI Music Video Bot Setup${NC}"
echo -e "${CYAN}[+] ===============================${NC}\n"

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[-] Error: python3 is not installed${NC}"
    echo -e "${YELLOW}[!] Please install Python 3 and try again${NC}"
    exit 1
fi

# Check if bun is available (for Node.js dependencies)
if ! command -v bun &> /dev/null; then
    echo -e "${YELLOW}[!] Warning: bun is not installed${NC}"
    echo -e "${YELLOW}[!] Installing bun...${NC}"
    if command -v curl &> /dev/null; then
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
        
        # Verify bun is now available
        if ! command -v bun &> /dev/null; then
            echo -e "${RED}[-] Error: bun installation failed or not in PATH${NC}"
            echo -e "${YELLOW}[!] Please add bun to your PATH or restart your terminal${NC}"
            echo -e "${YELLOW}[!] Or install manually: https://bun.sh${NC}"
            exit 1
        fi
        echo -e "${GREEN}[+] bun installed successfully${NC}"
    else
        echo -e "${RED}[-] Error: curl is not available. Please install bun manually:${NC}"
        echo -e "${YELLOW}    Visit: https://bun.sh${NC}"
        exit 1
    fi
fi

# Check if FFmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}[!] Warning: ffmpeg is not installed${NC}"
    echo -e "${YELLOW}[!] FFmpeg is required for video processing${NC}"
    echo -e "${YELLOW}[!] Install with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)${NC}"
fi

# Step 1: Create virtual environment if it doesn't exist
echo -e "${CYAN}[1/4] Setting up Python virtual environment...${NC}"
if [ ! -d "venv" ]; then
    echo -e "${GREEN}[+] Creating virtual environment...${NC}"
    python3 -m venv venv
else
    echo -e "${GREEN}[+] Virtual environment already exists${NC}"
fi

# Step 2: Activate virtual environment and install Python requirements
echo -e "\n${CYAN}[2/4] Installing Python dependencies...${NC}"
# Activate venv for the rest of the script
source venv/bin/activate

# Upgrade pip
echo -e "${GREEN}[+] Upgrading pip...${NC}"
pip3 install --upgrade pip --quiet

# Install requirements
echo -e "${GREEN}[+] Installing requirements from requirements.txt...${NC}"
# Temporarily disable exit on error for pip3 install
set +e
pip3 install -r requirements.txt
PIP_EXIT_CODE=$?
set -e

if [ $PIP_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}[-] Error: Failed to install some required packages${NC}"
    echo -e "${YELLOW}[!] Please check the error messages above${NC}"
    exit 1
fi

# Step 3: Install Node.js dependencies
echo -e "\n${CYAN}[3/4] Installing Node.js dependencies...${NC}"
SIGNATURE_DIR="tiktok_uploader/tiktok-signature"

if [ ! -d "$SIGNATURE_DIR" ]; then
    echo -e "${RED}[-] Error: $SIGNATURE_DIR directory not found${NC}"
    exit 1
fi

cd "$SIGNATURE_DIR"

# Install dependencies with bun
echo -e "${GREEN}[+] Installing dependencies with bun...${NC}"
bun install

# Verify Playwright package is installed
if [ ! -d "node_modules/playwright-chromium" ]; then
    echo -e "${RED}[-] Error: Playwright package installation failed${NC}"
    echo -e "${YELLOW}[!] Please check the error messages above${NC}"
    exit 1
fi

# Install Playwright browser binaries
echo -e "${GREEN}[+] Installing Playwright browser binaries...${NC}"
# Try multiple methods to install browser binaries
if [ -f "node_modules/.bin/playwright" ]; then
    bun run node_modules/.bin/playwright install chromium
else
    # Use bunx (bun's equivalent of npx)
    bunx --bun playwright install chromium || \
    bunx playwright install chromium || \
    bun run node_modules/playwright-chromium/cli.js install chromium
fi

cd "$SCRIPT_DIR"

# Step 4: Check for .env file
echo -e "\n${CYAN}[4/4] Checking configuration...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[!] Warning: .env file not found${NC}"
    echo -e "${YELLOW}[!] Creating .env file template...${NC}"
    cat > .env << EOF
# TikTok Username
TIKTOK_USERNAME=your_username_here

# Optional: OpenAI API Key (for GPT metadata generation)
# OPENAI_API_KEY=your_openai_key_here

# Optional: Google API Key (for Gemini metadata generation)
# GOOGLE_API_KEY=your_google_key_here

# Testing: Set to 'true' to bypass schedule and post immediately
# IMMEDIATE_POST_FOR_TESTING=false
EOF
    echo -e "${YELLOW}[!] Please edit .env file and add your TikTok username${NC}"
    echo -e "${YELLOW}[!] Then run this script again${NC}"
    exit 1
fi

# Check if TIKTOK_USERNAME is set
if ! grep -q "TIKTOK_USERNAME=" .env || grep -q "TIKTOK_USERNAME=your_username_here" .env; then
    echo -e "${YELLOW}[!] Warning: TIKTOK_USERNAME not set in .env file${NC}"
    echo -e "${YELLOW}[!] Please edit .env file and add your TikTok username${NC}"
    exit 1
fi

# Create necessary directories
echo -e "${GREEN}[+] Creating necessary directories...${NC}"
mkdir -p clips music output temp CookiesDir

# Clean temp folder on startup
echo -e "${GREEN}[+] Cleaning temp folder...${NC}"
if [ -d "temp" ]; then
    # Remove all files in temp folder
    find temp -type f -delete 2>/dev/null || rm -f temp/* 2>/dev/null
    echo -e "${GREEN}[+] Temp folder cleaned${NC}"
else
    echo -e "${GREEN}[+] Temp folder does not exist, will be created${NC}"
fi

# Step 5: Check for TikTok login
echo -e "\n${CYAN}[5/5] Checking TikTok login status...${NC}"

# Get TikTok username from .env
TIKTOK_USERNAME=$(grep "TIKTOK_USERNAME=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)

if [ -z "$TIKTOK_USERNAME" ] || [ "$TIKTOK_USERNAME" = "your_username_here" ]; then
    echo -e "${RED}[-] Error: TIKTOK_USERNAME not properly set in .env file${NC}"
    exit 1
fi

# Check if cookie file exists
COOKIE_FILE="CookiesDir/tiktok_session-${TIKTOK_USERNAME}.cookie"

if [ ! -f "$COOKIE_FILE" ]; then
    echo -e "${YELLOW}[!] No login session found for user: ${TIKTOK_USERNAME}${NC}"
    echo -e "${YELLOW}[!] Running login script...${NC}"
    echo -e "${CYAN}[!] Please complete the login in the browser window that opens${NC}\n"
    
    # Run login script (venv should already be activated)
    python3 login.py -n "$TIKTOK_USERNAME"
    
    # Check if login was successful
    if [ ! -f "$COOKIE_FILE" ]; then
        echo -e "${RED}[-] Login failed or was cancelled${NC}"
        echo -e "${YELLOW}[!] Please run: python3 login.py -n ${TIKTOK_USERNAME}${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}[+] Login successful!${NC}\n"
else
    echo -e "${GREEN}[+] Login session found for user: ${TIKTOK_USERNAME}${NC}"
fi

# Step 6: Run the bot
echo -e "\n${CYAN}[+] Setup complete!${NC}"
echo -e "${CYAN}[+] Starting Music Video Bot...${NC}\n"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  TikTokAI Music Video Bot${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Run the bot (venv should already be activated)
python3 music_video_bot.py

