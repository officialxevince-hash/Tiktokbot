"""
Viral Optimization Module for TikTok Videos
Implements strategies to maximize video performance and trending potential
"""

import os
import random
import re
from typing import List, Tuple, Dict, Optional
from datetime import datetime, time, timedelta
import requests
from termcolor import colored
from dotenv import load_dotenv

load_dotenv()

# TikTok optimal posting times (UTC) - based on research
# Peak engagement: 6-10 AM, 7-9 PM (user's local time)
OPTIMAL_POSTING_HOURS = {
    'monday': [6, 7, 8, 9, 19, 20, 21],
    'tuesday': [6, 7, 8, 9, 19, 20, 21],
    'wednesday': [6, 7, 8, 9, 19, 20, 21],
    'thursday': [6, 7, 8, 9, 19, 20, 21],
    'friday': [6, 7, 8, 9, 19, 20, 21, 22],
    'saturday': [7, 8, 9, 10, 19, 20, 21, 22],
    'sunday': [7, 8, 9, 10, 19, 20, 21]
}

# Viral hashtag categories
VIRAL_HASHTAG_CATEGORIES = {
    'engagement': ['#fyp', '#foryou', '#foryoupage', '#viral', '#trending', '#fypシ', '#xyzbca'],
    'music': ['#music', '#musicvideo', '#beatsync', '#edit', '#musicedit', '#song'],
    'quality': ['#quality', '#4k', '#hd', '#cinematic', '#professional'],
    'emotion': ['#satisfying', '#aesthetic', '#vibes', '#mood', '#vibecheck'],
    'niche': ['#edits', '#transition', '#visual', '#art', '#creative']
}

# Hook patterns that work well on TikTok
HOOK_PATTERNS = [
    "POV: {context}",
    "Wait for it...",
    "This hits different",
    "No one: ... Me:",
    "Tell me you're {context} without telling me",
    "When {context}",
    "That moment when",
    "If you know, you know",
    "This is so satisfying",
    "The way this syncs",
    "This beat drop though",
    "When the beat hits just right"
]


class ViralOptimizer:
    """
    Optimizes TikTok videos for maximum viral potential
    """
    
    def __init__(self):
        self.trending_hashtags_cache = []
        self.cache_timestamp = None
        self.cache_duration = 3600  # 1 hour cache
    
    def generate_viral_title(self, music_name: str, video_type: str = "music video") -> str:
        """
        Generate a viral-optimized title with hooks and engagement triggers.
        
        Args:
            music_name: Name of the music track
            video_type: Type of video content
            
        Returns:
            Optimized title string
        """
        hooks = [
            f"POV: You're listening to {music_name}",
            f"This {music_name} edit hits different",
            f"When {music_name} hits just right",
            f"The way this syncs to {music_name}",
            f"{music_name} but it's perfectly synced",
            f"Wait for the beat drop in {music_name}",
            f"This {music_name} edit is so satisfying",
            f"{music_name} edit that hits different",
            f"When the beat drops in {music_name}",
            f"This {music_name} sync is insane"
        ]
        
        # Add emojis for visual appeal
        emojis = ['🎵', '✨', '🔥', '💯', '🎬', '⚡', '🎯', '👀']
        
        title = random.choice(hooks)
        # Add 1-2 random emojis
        emoji_count = random.randint(1, 2)
        selected_emojis = random.sample(emojis, emoji_count)
        title = f"{title} {''.join(selected_emojis)}"
        
        return title
    
    def generate_viral_description(self, title: str, music_name: str) -> str:
        """
        Generate an engaging description that encourages engagement.
        
        Args:
            title: Video title
            music_name: Name of the music track
            
        Returns:
            Optimized description string
        """
        call_to_actions = [
            "Drop a 🔥 if this hits!",
            "Comment your favorite part!",
            "Save this for later!",
            "Tag someone who needs to see this!",
            "Double tap if you agree!",
            "Share if this made your day!",
            "Follow for more edits like this!",
            "What do you think? 👇"
        ]
        
        description_parts = [
            title,
            "",
            random.choice(call_to_actions),
            "",
            f"Beat-synced edit of {music_name} 🎵"
        ]
        
        return "\n".join(description_parts)
    
    def generate_viral_hashtags(
        self, 
        music_name: str, 
        num_hashtags: int = 15,
        include_trending: bool = True
    ) -> str:
        """
        Generate optimized hashtag mix for maximum reach.
        
        Strategy:
        - 30% engagement hashtags (fyp, viral, trending)
        - 30% niche hashtags (music, edit specific)
        - 20% trending hashtags (if available)
        - 20% quality/emotion hashtags
        
        Args:
            music_name: Name of the music track
            num_hashtags: Total number of hashtags (TikTok allows up to 100 chars)
            include_trending: Whether to include trending hashtags
            
        Returns:
            Space-separated hashtag string
        """
        hashtags = []
        
        # Engagement hashtags (always include core ones)
        engagement_count = max(3, int(num_hashtags * 0.3))
        hashtags.extend(random.sample(
            VIRAL_HASHTAG_CATEGORIES['engagement'], 
            min(engagement_count, len(VIRAL_HASHTAG_CATEGORIES['engagement']))
        ))
        
        # Music/niche hashtags
        niche_count = max(3, int(num_hashtags * 0.3))
        music_hashtags = VIRAL_HASHTAG_CATEGORIES['music'].copy()
        # Add music-specific hashtag
        music_hashtag = f"#{music_name.replace(' ', '').lower()}"
        if len(music_hashtag) <= 20:  # Reasonable length
            music_hashtags.append(music_hashtag)
        hashtags.extend(random.sample(
            music_hashtags,
            min(niche_count, len(music_hashtags))
        ))
        
        # Quality/emotion hashtags
        quality_count = max(2, int(num_hashtags * 0.2))
        quality_hashtags = VIRAL_HASHTAG_CATEGORIES['quality'] + VIRAL_HASHTAG_CATEGORIES['emotion']
        hashtags.extend(random.sample(
            quality_hashtags,
            min(quality_count, len(quality_hashtags))
        ))
        
        # Trending hashtags (if available and enabled)
        if include_trending:
            trending_count = max(2, int(num_hashtags * 0.2))
            trending = self.get_trending_hashtags(trending_count)
            hashtags.extend(trending)
        
        # Remove duplicates and limit total
        hashtags = list(dict.fromkeys(hashtags))[:num_hashtags]
        
        # Format as space-separated string
        return ' '.join(hashtags)
    
    def get_trending_hashtags(self, count: int = 5) -> List[str]:
        """
        Get currently trending hashtags (placeholder - would need TikTok API or scraping).
        
        Args:
            count: Number of trending hashtags to return
            
        Returns:
            List of trending hashtag strings
        """
        # TODO: Implement actual trending hashtag fetching
        # For now, return popular generic ones
        trending = [
            '#trendingnow',
            '#viralvideo',
            '#explorepage',
            '#fypage',
            '#trendingaudio'
        ]
        
        return trending[:count]
    
    def get_next_optimal_datetime(self, current_time: Optional[datetime] = None) -> datetime:
        """
        Calculate the next optimal posting datetime.
        
        Args:
            current_time: Current datetime (defaults to now)
            
        Returns:
            Next optimal datetime for posting
        """
        if current_time is None:
            current_time = datetime.now()
        
        day_name = current_time.strftime('%A').lower()
        optimal_hours = OPTIMAL_POSTING_HOURS.get(day_name, OPTIMAL_POSTING_HOURS['monday'])
        
        current_hour = current_time.hour
        current_minute = current_time.minute
        
        # Find next optimal hour today
        next_optimal_hour = None
        for hour in sorted(optimal_hours):
            if hour > current_hour or (hour == current_hour and current_minute < 30):
                next_optimal_hour = hour
                break
        
        # Calculate next optimal datetime
        if next_optimal_hour is not None:
            # Use optimal hour today
            next_datetime = current_time.replace(
                hour=next_optimal_hour,
                minute=random.randint(0, 30),  # Random minutes for pattern avoidance
                second=0,
                microsecond=0
            )
            # If the time has already passed today, move to tomorrow
            if next_datetime <= current_time:
                next_datetime += timedelta(days=1)
        else:
            # No optimal hour today, use first optimal hour tomorrow
            next_day = current_time + timedelta(days=1)
            next_day_name = next_day.strftime('%A').lower()
            tomorrow_optimal_hours = OPTIMAL_POSTING_HOURS.get(next_day_name, OPTIMAL_POSTING_HOURS['monday'])
            next_optimal_hour = sorted(tomorrow_optimal_hours)[0]
            
            next_datetime = next_day.replace(
                hour=next_optimal_hour,
                minute=random.randint(0, 30),
                second=0,
                microsecond=0
            )
        
        return next_datetime
    
    def optimize_posting_time(self, current_time: Optional[datetime] = None) -> int:
        """
        Calculate optimal posting time (schedule_time in seconds from now).
        
        Args:
            current_time: Current datetime (defaults to now)
            
        Returns:
            Schedule time in seconds (0 = post immediately, >0 = schedule)
        """
        if current_time is None:
            current_time = datetime.now()
        
        day_name = current_time.strftime('%A').lower()
        optimal_hours = OPTIMAL_POSTING_HOURS.get(day_name, OPTIMAL_POSTING_HOURS['monday'])
        
        current_hour = current_time.hour
        
        # If current hour is optimal, post immediately
        if current_hour in optimal_hours:
            return 0
        
        # Find next optimal hour
        next_optimal_hour = None
        for hour in sorted(optimal_hours):
            if hour > current_hour:
                next_optimal_hour = hour
                break
        
        # If no optimal hour today, use first optimal hour tomorrow
        if next_optimal_hour is None:
            next_optimal_hour = optimal_hours[0]
            hours_until = (24 - current_hour) + next_optimal_hour
        else:
            hours_until = next_optimal_hour - current_hour
        
        # Convert to seconds (add some randomness to avoid pattern detection)
        seconds_until = hours_until * 3600
        # Add random 0-30 minutes to avoid exact timing patterns
        seconds_until += random.randint(0, 1800)
        
        return int(seconds_until)
    
    def optimize_engagement_settings(
        self,
        allow_comment: int = 1,
        allow_duet: int = 1,
        allow_stitch: int = 1
    ) -> Dict[str, int]:
        """
        Optimize engagement settings for maximum interaction.
        
        Args:
            allow_comment: Allow comments (1 = yes, 0 = no)
            allow_duet: Allow duets (1 = yes, 0 = no)
            allow_stitch: Allow stitches (1 = yes, 0 = no)
            
        Returns:
            Dictionary with optimized settings
        """
        # For viral content, enable all engagement features
        return {
            'allow_comment': allow_comment,
            'allow_duet': allow_duet,
            'allow_stitch': allow_stitch
        }
    
    def create_hook_segment_strategy(self) -> Dict:
        """
        Create strategy for optimizing the first 3 seconds (hook).
        
        Returns:
            Dictionary with hook optimization strategy
        """
        return {
            'use_flash_effect': True,  # Flash grabs attention
            'use_zoom_effect': True,   # Zoom creates visual interest
            'fast_pace': True,          # Fast cuts maintain attention
            'bright_colors': True,       # Bright colors stand out
            'beat_drop_sync': True      # Sync to first beat drop
        }
    
    def optimize_video_pacing(self, duration: float) -> Dict:
        """
        Optimize video pacing based on duration.
        
        Research shows:
        - First 3 seconds: Fast pace, high energy
        - Middle: Vary pace, build tension
        - Last 3 seconds: Strong finish, call to action visual
        
        Args:
            duration: Video duration in seconds
            
        Returns:
            Dictionary with pacing strategy
        """
        return {
            'hook_phase': {
                'start': 0,
                'end': min(3, duration * 0.1),
                'effect_intensity': 0.9,
                'cut_frequency': 'high'
            },
            'build_phase': {
                'start': min(3, duration * 0.1),
                'end': duration * 0.9,
                'effect_intensity': 0.6,
                'cut_frequency': 'medium'
            },
            'finish_phase': {
                'start': duration * 0.9,
                'end': duration,
                'effect_intensity': 0.8,
                'cut_frequency': 'high'
            }
        }
    
    def generate_ai_optimized_metadata(
        self,
        music_name: str,
        ai_model: str,
        use_viral_strategies: bool = True
    ) -> Tuple[str, str, str]:
        """
        Generate AI-optimized metadata using viral strategies.
        
        Args:
            music_name: Name of the music track
            ai_model: AI model to use ('g4f', 'gpt3.5-turbo', 'gpt4', 'gemmini')
            use_viral_strategies: Whether to apply viral optimization
            
        Returns:
            Tuple of (title, description, hashtags)
        """
        from videogen.gpt import generate_response
        
        if use_viral_strategies:
            # Use viral-optimized prompts
            title_prompt = f"""Generate a viral TikTok title for a beat-synced music video featuring "{music_name}".

Requirements:
- Must be catchy and attention-grabbing
- Include a hook pattern (POV, "Wait for it", "This hits different", etc.)
- 5-10 words maximum
- Include 1-2 relevant emojis
- No quotes in response, just the title

Examples of viral titles:
- "POV: This {music_name} edit hits different 🔥"
- "Wait for the beat drop in {music_name} 🎵"
- "This sync is so satisfying ✨"

Generate the title:"""

            description_prompt = f"""Write a viral TikTok description for a beat-synced music video of "{music_name}".

Requirements:
- Start with an engaging hook
- Include a call-to-action (like "Drop a 🔥 if this hits!" or "Comment your favorite part!")
- Keep it under 150 characters
- Include 1-2 emojis
- Encourage engagement (comments, shares, saves)

Format:
[Engaging hook]
[Blank line]
[Call to action]
[Blank line]
[Brief context about the video]

Generate the description:"""

            hashtag_prompt = f"""Generate 15-20 viral TikTok hashtags for a beat-synced music video of "{music_name}".

Requirements:
- Mix of engagement hashtags (#fyp, #viral, #trending)
- Music-specific hashtags (#music, #edit, #beatsync)
- Quality hashtags (#satisfying, #aesthetic, #hd)
- Trending hashtags if relevant
- Return ONLY the hashtags, space-separated, no explanation
- Format: #hashtag1 #hashtag2 #hashtag3

Generate the hashtags:"""
        else:
            # Use standard prompts (fallback)
            title_prompt = f"Generate a catchy title for a TikTok music video of {music_name}"
            description_prompt = f"Write a brief description for a TikTok music video of {music_name}"
            hashtag_prompt = f"Generate hashtags for a TikTok music video of {music_name}"
        
        try:
            title = generate_response(title_prompt, ai_model).strip().strip('"\'')
            description = generate_response(description_prompt, ai_model).strip()
            hashtags = generate_response(hashtag_prompt, ai_model).strip()
            
            # Clean up hashtags
            hashtags = re.sub(r'[^#\w\s]', '', hashtags)  # Remove special chars except #
            hashtags = ' '.join(hashtags.split())  # Normalize whitespace
            
            return title, description, hashtags
        except Exception as e:
            print(colored(f"[!] AI metadata generation failed: {e}", "yellow"))
            # Fallback to non-AI viral optimization
            return (
                self.generate_viral_title(music_name),
                self.generate_viral_description(music_name, music_name),
                self.generate_viral_hashtags(music_name)
            )


def get_viral_optimizer() -> ViralOptimizer:
    """Get singleton instance of ViralOptimizer"""
    if not hasattr(get_viral_optimizer, '_instance'):
        get_viral_optimizer._instance = ViralOptimizer()
    return get_viral_optimizer._instance

