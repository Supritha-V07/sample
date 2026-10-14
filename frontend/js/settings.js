/**
 * SightWeaver - Accessibility & User Settings Controller
 * Controls theme (dark/light/high-contrast), text size, speech parameters,
 * motion preferences, and privacy/permission status.
 */

export class SettingsService {
  constructor(audioService) {
    this.audioService = audioService;
    this.settings = {
      theme: 'dark', // 'dark', 'light', 'high-contrast'
      textSize: 'normal', // 'normal', 'large', 'xlarge'
      reducedMotion: false,
      speechRate: 1.0,
      speechVolume: 1.0,
      verbosity: 'standard',
      interfaceLanguage: 'en',
      voiceCommandLanguage: 'en-US',
      spokenNavigationLanguage: 'en',
      ocrTargetLanguage: 'kn' // Defaulting to Kannada as showcased in requirements
    };
    this._loadSavedSettings();
  }

  _loadSavedSettings() {
    const saved = localStorage.getItem('sightweaver_settings');
    if (saved) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      } catch (e) {}
    }
    this.applySettings();
  }

  saveSettings() {
    localStorage.setItem('sightweaver_settings', JSON.stringify(this.settings));
    this.applySettings();
  }

  applySettings() {
    const body = document.body;
    if (!body) return;

    // 1. Theme
    body.classList.remove('light-theme', 'high-contrast');
    if (this.settings.theme === 'light') body.classList.add('light-theme');
    else if (this.settings.theme === 'high-contrast') body.classList.add('high-contrast');

    // 2. Text Scaling
    body.classList.remove('text-large', 'text-xlarge');
    if (this.settings.textSize === 'large') body.classList.add('text-large');
    else if (this.settings.textSize === 'xlarge') body.classList.add('text-xlarge');

    // 3. Reduced Motion
    if (this.settings.reducedMotion) body.classList.add('reduced-motion');
    else body.classList.remove('reduced-motion');

    // 4. Audio settings
    if (this.audioService) {
      this.audioService.setSpeechRate(this.settings.speechRate);
      this.audioService.setSpeechVolume(this.settings.speechVolume);
      this.audioService.setVerbosity(this.settings.verbosity);
      this.audioService.setLanguage(this.settings.spokenNavigationLanguage);
    }
  }

  update(key, value) {
    this.settings[key] = value;
    this.saveSettings();
  }

  clearAllData() {
    localStorage.removeItem('sightweaver_places');
    localStorage.removeItem('sightweaver_routes');
    localStorage.removeItem('sightweaver_contacts');
    localStorage.removeItem('sightweaver_settings');
    location.reload();
  }
}
