/**
 * SightWeaver - Intelligent Audio Priority Manager & Speech Service
 * 5-tier priority queue, instant pre-emption for urgent safety warnings,
 * Web Speech Synthesis with multi-language voice mapping, and optional haptics.
 */

export class AudioPriorityService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    this.speechRate = 1.0;
    this.speechVolume = 1.0;
    this.speechPitch = 1.0;
    this.verbosity = 'standard'; // 'compact', 'standard', 'detailed'
    this.isMuted = false;
    this.isPaused = false;
    this.currentSpokenPriority = 999;
    this.lastSpokenText = 'SightWeaver assistance ready. Say or select a destination to begin.';
    this.queue = [];
    this.isSpeaking = false;
    this.subscribers = [];
    this.selectedLanguage = 'en';

    if (this.synth) {
      this._loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this._loadVoices();
      }
    }
  }

  _loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify(event, data) {
    this.subscribers.forEach(cb => cb(event, data));
  }

  setLanguage(langCode) {
    this.selectedLanguage = langCode;
  }

  setSpeechRate(rate) {
    this.speechRate = Math.max(0.5, Math.min(2.0, parseFloat(rate)));
  }

  setSpeechVolume(vol) {
    this.speechVolume = Math.max(0, Math.min(1.0, parseFloat(vol)));
  }

  setVerbosity(level) {
    this.verbosity = level;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
    this.notify('mute_changed', { isMuted: this.isMuted });
    return this.isMuted;
  }

  pause() {
    this.isPaused = true;
    if (this.synth) this.synth.pause();
    this.notify('audio_paused', {});
  }

  resume() {
    this.isPaused = false;
    if (this.synth) this.synth.resume();
    this.notify('audio_resumed', {});
  }

  repeatLast() {
    if (!this.lastSpokenText) return;
    this.speak(this.lastSpokenText, { priority: 2, force: true });
  }

  /**
   * Main Speak Method with Priority Routing:
   * Priority 1: Immediate Safety Warning (pre-empts currently playing audio)
   * Priority 2: Important Route Correction / Upcoming Turn
   * Priority 3: Navigation Progress
   * Priority 4: Environmental Description
   * Priority 5: Informational Announcement
   */
  speak(text, options = {}) {
    if (!text || this.isMuted || this.isPaused) return;

    const priority = options.priority || 3;
    const force = options.force || false;

    // Filter by verbosity mode
    if (this.verbosity === 'compact' && priority > 2 && !force) {
      // In compact mode, omit progress and environmental descriptions
      return;
    }
    if (this.verbosity === 'standard' && priority > 4 && !force) {
      return;
    }

    // Priority 1 (Urgent Safety Hazard) pre-empts lower priority audio immediately
    if (priority === 1) {
      if (this.synth) this.synth.cancel();
      this.queue = []; // Drop pending low-priority announcements
      this._dispatchHaptics([80, 50, 120]);
    } else if (this.isSpeaking && priority >= this.currentSpokenPriority && !force) {
      // Don't interrupt higher priority with lower priority
      return;
    }

    this.lastSpokenText = text;
    this._executeSpeech(text, priority);
  }

  _executeSpeech(text, priority) {
    if (!this.synth) {
      console.log(`[Audio Fallback - Voice Unavailable]: "${text}"`);
      this.notify('speech_fallback', { text, priority });
      return;
    }

    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.speechRate;
    utterance.volume = this.speechVolume;
    utterance.pitch = this.speechPitch;

    // Find best voice match for selected language
    const voice = this._matchVoice(this.selectedLanguage);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = this.selectedLanguage || 'en-US';
    }

    this.currentSpokenPriority = priority;
    this.isSpeaking = true;
    this.notify('speaking_start', { text, priority });

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentSpokenPriority = 999;
      this.notify('speaking_end', { text });
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      this.isSpeaking = false;
      this.currentSpokenPriority = 999;
      this.notify('speaking_end', { text, error: true });
    };

    try {
      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis speak failure:', err);
      this.isSpeaking = false;
      this.notify('speaking_end', { text });
    }
  }

  _matchVoice(langCode) {
    if (!this.voices || this.voices.length === 0) {
      this._loadVoices();
    }
    const code = (langCode || 'en').toLowerCase();
    // 1. Exact match
    let match = this.voices.find(v => v.lang.toLowerCase() === code || v.lang.toLowerCase().replace('_', '-') === code);
    if (match) return match;

    // 2. Prefix match (e.g. 'kn' -> 'kn-IN')
    match = this.voices.find(v => v.lang.toLowerCase().startsWith(code + '-') || v.lang.toLowerCase().startsWith(code + '_'));
    if (match) return match;

    // 3. English fallback
    return this.voices.find(v => v.lang.startsWith('en')) || this.voices[0] || null;
  }

  _dispatchHaptics(pattern) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Haptics not allowed in background
      }
    }
  }
}
