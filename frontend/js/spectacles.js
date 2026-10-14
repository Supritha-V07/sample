/**
 * SightWeaver - Spectacles HUD Controller
 * Controls the realistic dual-lens smart glasses visualization,
 * projects video/simulation feeds into both lenses, and paints dynamic HUD overlays.
 */

export class SpectaclesHUD {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.leftCanvas = document.getElementById('lens-left-canvas');
    this.rightCanvas = document.getElementById('lens-right-canvas');
    this.leftCtx = this.leftCanvas ? this.leftCanvas.getContext('2d') : null;
    this.rightCtx = this.rightCanvas ? this.rightCanvas.getContext('2d') : null;

    this.leftOverlay = document.getElementById('lens-left-overlay');
    this.rightOverlay = document.getElementById('lens-right-overlay');

    this.currentMode = 'demo';
    this.activeObjects = [];
    this.navigationTurn = null; // { direction: 'straight', instruction: '...' }
    this.isRecording = true;
    this.aiStatus = 'Active';
    this.isSpeaking = false;
  }

  setMode(mode) {
    this.currentMode = mode;
    const wrapper = document.querySelector('.spectacles-frame-wrapper');
    if (wrapper) {
      wrapper.classList.remove('live-mode', 'demo-mode', 'wearable-preview-mode');
      if (mode === 'wearable') {
        wrapper.classList.add('wearable-preview-mode');
      } else if (mode === 'live') {
        wrapper.classList.add('live-mode');
      } else {
        wrapper.classList.add('demo-mode');
      }
    }
  }

  renderFrame(sourceElementOrCanvas) {
    if (!sourceElementOrCanvas) return;

    const drawToLens = (ctx, canvas) => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceElementOrCanvas, 0, 0, canvas.width, canvas.height);
    };

    drawToLens(this.leftCtx, this.leftCanvas);
    drawToLens(this.rightCtx, this.rightCanvas);
  }

  updateDetections(objects) {
    this.activeObjects = objects || [];
    this._paintOverlays(this.leftOverlay);
    this._paintOverlays(this.rightOverlay);
  }

  setNavigationTurn(turnData) {
    this.navigationTurn = turnData;
    this._updateTurnGuides();
  }

  setAudioSpeaking(speaking) {
    this.isSpeaking = speaking;
    const audioPod = document.querySelector('.audio-output-indicator');
    if (audioPod) {
      if (speaking) audioPod.classList.add('speaking');
      else audioPod.classList.remove('speaking');
    }
  }

  setMicActive(active) {
    const micDot = document.querySelector('.mic-dot');
    if (micDot) {
      if (active) micDot.classList.add('active');
      else micDot.classList.remove('active');
    }
  }

  _paintOverlays(overlayContainer) {
    if (!overlayContainer) return;

    // Clear dynamic bounding boxes while keeping static tags
    const existingBoxes = overlayContainer.querySelectorAll('.hud-bounding-box');
    existingBoxes.forEach(b => b.remove());

    const rect = overlayContainer.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 260;

    this.activeObjects.forEach(obj => {
      const box = document.createElement('div');
      box.className = 'hud-bounding-box';

      // Risk level styling
      if (obj.risk_level === 'critical') {
        box.classList.add('hazard-urgent');
      } else if (obj.risk_level === 'high' || obj.risk_level === 'moderate') {
        box.classList.add('hazard-caution');
      }

      // Convert normalized bbox [x, y, w, h] to pixels
      const [bx, by, bw, bh] = obj.bbox || [0.3, 0.3, 0.3, 0.3];
      box.style.left = `${bx * 100}%`;
      box.style.top = `${by * 100}%`;
      box.style.width = `${bw * 100}%`;
      box.style.height = `${bh * 100}%`;

      // Tag element
      const tag = document.createElement('div');
      tag.className = 'hud-box-tag';
      if (obj.risk_level === 'critical') tag.classList.add('urgent');
      else if (obj.risk_level === 'high') tag.classList.add('caution');

      const distText = obj.distance_m ? `${obj.distance_m}m` : '';
      const motionText = obj.movement_label && obj.movement_label !== 'stationary' ? `• ${obj.movement_label}` : '';
      tag.innerHTML = `<strong>${obj.class}</strong> <span>${distText} ${motionText}</span>`;

      box.appendChild(tag);
      overlayContainer.appendChild(box);
    });
  }

  _updateTurnGuides() {
    const updateOverlay = (overlay) => {
      if (!overlay) return;
      let guide = overlay.querySelector('.hud-turn-guide');
      if (!this.navigationTurn) {
        if (guide) guide.remove();
        return;
      }

      if (!guide) {
        guide = document.createElement('div');
        guide.className = 'hud-turn-guide';
        overlay.appendChild(guide);
      }

      const dir = this.navigationTurn.direction || 'straight';
      let arrowSvg = `<svg class="hud-turn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
      
      if (dir === 'turn_right' || dir === 'slight_right') {
        arrowSvg = `<svg class="hud-turn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
      } else if (dir === 'turn_left' || dir === 'slight_left') {
        arrowSvg = `<svg class="hud-turn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
      } else if (dir === 'arrive') {
        arrowSvg = `<svg class="hud-turn-arrow" viewBox="0 0 24 24" fill="none" stroke="var(--green-status)" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      }

      guide.innerHTML = `
        ${arrowSvg}
        <span class="hud-turn-text">${this.navigationTurn.instruction || 'Continue Straight'}</span>
      `;
    };

    updateOverlay(this.leftOverlay);
    updateOverlay(this.rightOverlay);
  }
}
