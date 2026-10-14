/**
 * SightWeaver - Camera Service
 * Handles browser webcam stream, permission flow, device selection,
 * image frame capture, and realistic virtual simulation canvas fallback.
 */

export class CameraService {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.activeMode = 'demo'; // 'live', 'demo', 'wearable'
    this.permissionStatus = 'prompt'; // 'granted', 'denied', 'prompt'
    this.facingMode = 'environment';
    this.isPaused = false;
    this.subscribers = [];
    this.simulationAnimId = null;
    this.simCanvas = document.createElement('canvas');
    this.simCanvas.width = 640;
    this.simCanvas.height = 360;
    this.simCtx = this.simCanvas.getContext('2d');
    this.simStep = 0;
  }

  setVideoElement(videoEl) {
    this.videoElement = videoEl;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify(event, data) {
    this.subscribers.forEach(cb => cb(event, data));
  }

  async requestLiveCamera() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser does not support camera API (getUserMedia).');
      }

      if (this.stream) {
        this.stopCamera();
      }

      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.permissionStatus = 'granted';
      this.activeMode = 'live';

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }

      this.stopSimulation();
      this.notify('camera_started', { mode: 'live' });
      return { success: true, mode: 'live' };
    } catch (err) {
      console.warn('Camera request error:', err);
      this.permissionStatus = err.name === 'NotAllowedError' ? 'denied' : 'error';
      this.notify('camera_error', { error: err.message, status: this.permissionStatus });
      // Fallback to Demo Environment Mode
      this.startDemoEnvironment();
      return { success: false, error: err.message, fallback: 'demo' };
    }
  }

  toggleFacingMode() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this.activeMode === 'live' && this.stream) {
      return this.requestLiveCamera();
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.notify('camera_stopped', {});
  }

  startDemoEnvironment() {
    this.activeMode = 'demo';
    this.stopCamera();
    this.isPaused = false;
    this._runSimulationLoop();
    this.notify('camera_started', { mode: 'demo' });
  }

  setWearableMode() {
    this.activeMode = 'wearable';
    this.notify('mode_changed', { mode: 'wearable' });
  }

  stopSimulation() {
    if (this.simulationAnimId) {
      cancelAnimationFrame(this.simulationAnimId);
      this.simulationAnimId = null;
    }
  }

  _runSimulationLoop() {
    this.stopSimulation();

    const drawFrame = () => {
      if (this.activeMode === 'demo' && !this.isPaused) {
        this.simStep += 0.02;
        this._renderSimulatedHallway(this.simStep);

        // Notify subscribers with the canvas frame as image bitmap or canvas source
        this.notify('sim_frame_ready', { canvas: this.simCanvas });
      }
      this.simulationAnimId = requestAnimationFrame(drawFrame);
    };

    this.simulationAnimId = requestAnimationFrame(drawFrame);
  }

  _renderSimulatedHallway(t) {
    const ctx = this.simCtx;
    const w = this.simCanvas.width;
    const h = this.simCanvas.height;

    // Vanishing point in the corridor
    const vpX = w / 2;
    const vpY = h / 2 - 10;

    // Background gradient: Academic block corridor
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#09101d');
    bgGrad.addColorStop(0.5, '#131e33');
    bgGrad.addColorStop(1, '#0b1220');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Floor perspective
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(vpX + 40, vpY + 30);
    ctx.lineTo(vpX - 40, vpY + 30);
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Tactile guiding paving lines on floor
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(vpX, vpY + 30);
    ctx.lineTo(vpX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ceiling lights perspective
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const z = ((t * 0.8 + i * 0.25) % 1);
      const ly = vpY - 20 - z * 100;
      const lw = 20 + z * 120;
      ctx.beginPath();
      ctx.ellipse(vpX, ly, lw, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Doorway on right side (Classroom 304)
    const doorProgress = Math.sin(t * 0.5);
    const doorX = vpX + 80 + (Math.sin(t * 0.3) * 20);
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(doorX, vpY - 30, 45, 90);
    ctx.strokeRect(doorX, vpY - 30, 45, 90);

    // Room sign plate
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(doorX + 5, vpY - 25, 35, 12);
    ctx.fillStyle = '#020617';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('304 AI', doorX + 7, vpY - 16);

    // Dynamic simulated obstacle: Chair / Pedestrian moving across
    const cycle = (t * 0.6) % 12;
    if (cycle > 4 && cycle < 10) {
      // Pedestrian approaching
      const pedZ = (cycle - 4) / 6; // 0 (far) to 1 (near)
      const pedX = vpX - 60 + pedZ * 40;
      const pedY = vpY + 10 + pedZ * 80;
      const pedH = 30 + pedZ * 110;
      const pedW = pedH * 0.38;

      ctx.fillStyle = 'rgba(139, 92, 246, 0.85)';
      ctx.beginPath();
      ctx.roundRect(pedX - pedW / 2, pedY - pedH, pedW, pedH, 8);
      ctx.fill();
      ctx.strokeStyle = '#c4b5fd';
      ctx.stroke();

      // Head
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(pedX, pedY - pedH - 10, pedW * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Stationary chair hazard in corridor
      const chairX = vpX - 45;
      const chairY = vpY + 55;
      ctx.fillStyle = '#475569';
      ctx.fillRect(chairX - 16, chairY - 24, 32, 28);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(chairX - 16, chairY - 24, 32, 28);
      // Chair legs
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(chairX - 14, chairY + 4); ctx.lineTo(chairX - 14, chairY + 18);
      ctx.moveTo(chairX + 14, chairY + 4); ctx.lineTo(chairX + 14, chairY + 18);
      ctx.stroke();
    }
  }

  getCurrentCanvas() {
    if (this.activeMode === 'live' && this.videoElement) {
      const c = document.createElement('canvas');
      c.width = this.videoElement.videoWidth || 640;
      c.height = this.videoElement.videoHeight || 360;
      const ctx = c.getContext('2d');
      ctx.drawImage(this.videoElement, 0, 0, c.width, c.height);
      return c;
    }
    return this.simCanvas;
  }
}
