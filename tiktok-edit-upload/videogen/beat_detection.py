import numpy as np
import librosa
from typing import List, Tuple
from termcolor import colored
import logging

logger = logging.getLogger(__name__)

def detect_beats(audio_path: str, fps: float = 30.0) -> List[float]:
    """
    Detect beat timestamps in an audio file.
    
    Args:
        audio_path (str): Path to the audio file
        fps (float): Frames per second for video (used for timing precision)
    
    Returns:
        List[float]: List of beat timestamps in seconds
    """
    try:
        print(colored(f"[+] Loading audio for beat detection: {audio_path}", "cyan"))
        
        # Load audio file
        y, sr = librosa.load(audio_path, sr=None)
        
        # Detect tempo and beats
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
        
        # Convert tempo to scalar if it's an array
        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0]) if len(tempo) > 0 else 120.0
        else:
            tempo = float(tempo)
        
        print(colored(f"[+] Detected {len(beats)} beats at {tempo:.1f} BPM", "green"))
        
        return beats.tolist()
    
    except Exception as e:
        logger.error(colored(f"[-] Error detecting beats: {e}", "red"))
        # Fallback: generate beats at regular intervals (120 BPM = 0.5s intervals)
        print(colored("[!] Using fallback beat detection (120 BPM)", "yellow"))
        duration = librosa.get_duration(path=audio_path)
        return [i * 0.5 for i in range(int(duration / 0.5))]


def detect_strong_beats(audio_path: str, threshold: float = 0.3) -> List[float]:
    """
    Detect only strong beats (downbeats) in an audio file.
    
    Args:
        audio_path (str): Path to the audio file
        threshold (float): Threshold for beat strength (0.0 to 1.0)
    
    Returns:
        List[float]: List of strong beat timestamps in seconds
    """
    try:
        print(colored(f"[+] Detecting strong beats in: {audio_path}", "cyan"))
        
        # Load audio
        y, sr = librosa.load(audio_path, sr=None)
        
        # Get onset strength
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units='time')
        onset_strength = librosa.onset.onset_strength(y=y, sr=sr)
        
        # Normalize onset strength
        if len(onset_strength) > 0:
            onset_strength_norm = (onset_strength - onset_strength.min()) / (onset_strength.max() - onset_strength.min() + 1e-10)
        else:
            onset_strength_norm = onset_strength
        
        # Filter by threshold
        strong_beats = []
        for i, time in enumerate(onset_frames):
            if i < len(onset_strength_norm) and onset_strength_norm[i] >= threshold:
                strong_beats.append(time)
        
        print(colored(f"[+] Detected {len(strong_beats)} strong beats", "green"))
        return strong_beats
    
    except Exception as e:
        logger.error(colored(f"[-] Error detecting strong beats: {e}", "red"))
        # Fallback to regular beat detection
        return detect_beats(audio_path)


def get_beat_intervals(beats: List[float], duration: float) -> List[Tuple[float, float]]:
    """
    Convert beat timestamps into intervals for video editing.
    
    Args:
        beats (List[float]): List of beat timestamps
        duration (float): Total duration of the audio
    
    Returns:
        List[Tuple[float, float]]: List of (start, end) intervals between beats
    """
    intervals = []
    
    for i in range(len(beats)):
        start = beats[i]
        if i + 1 < len(beats):
            end = beats[i + 1]
        else:
            end = duration
        intervals.append((start, end))
    
    return intervals







