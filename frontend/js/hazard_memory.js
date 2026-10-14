/**
 * SightWeaver - Predictive Hazard Memory Engine
 * Maintains short-term memory of detected hazards, tracks observation persistence,
 * enforces alert cooldowns to prevent repetitive speech fatigue, and renders a live timeline.
 */

export class HazardMemoryService {
  constructor(options = {}) {
    this.memoryDurationMs = (options.memoryDurationSec || 20.0) * 1000;
    this.timeline = []; // Array of hazard events
    this.activeHazards = new Map(); // trackId -> hazard object
    this.subscribers = [];
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify() {
    this.subscribers.forEach(cb => cb({
      timeline: this.timeline,
      activeCount: this.activeHazards.size
    }));
  }

  recordObservation(obj) {
    const now = Date.now();
    const trackId = obj.trackId;

    const record = {
      trackId,
      class: obj.class,
      riskLevel: obj.risk_level,
      distanceM: obj.distance_m,
      direction: obj.direction,
      movementLabel: obj.movement_label,
      lastSeen: now,
      phrase: obj.spoken_alert
    };

    this.activeHazards.set(trackId, record);

    if (obj.spoken_alert) {
      // Add to timeline
      this.timeline.unshift({
        id: `event_${now}_${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        class: obj.class,
        riskLevel: obj.risk_level,
        distanceM: obj.distance_m,
        direction: obj.direction,
        phrase: obj.spoken_alert
      });
      // Cap timeline to 20 entries
      if (this.timeline.length > 20) {
        this.timeline.pop();
      }
    }

    this._cleanStaleHazards(now);
    this.notify();
  }

  _cleanStaleHazards(currentTime) {
    for (const [tid, item] of this.activeHazards.entries()) {
      if (currentTime - item.lastSeen > this.memoryDurationMs) {
        this.activeHazards.delete(tid);
      }
    }
  }

  clearMemory() {
    this.activeHazards.clear();
    this.timeline = [];
    this.notify();
  }

  renderTimeline(containerElement) {
    if (!containerElement) return;

    if (this.timeline.length === 0) {
      containerElement.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0.5rem; font-size: 0.85rem;">
          No critical hazards recorded. Path has remained clear.
        </div>
      `;
      return;
    }

    containerElement.innerHTML = this.timeline.map(item => {
      const badgeClass = item.riskLevel === 'critical' ? 'badge-coral' : (item.riskLevel === 'high' ? 'badge-amber' : 'badge-cyan');
      return `
        <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.65rem 0; border-bottom: 1px solid var(--border-subtle);">
          <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
            ${item.timestamp}
          </span>
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.2rem;">
              <span class="badge ${badgeClass}" style="text-transform: uppercase;">${item.riskLevel}</span>
              <strong style="font-size: 0.85rem; color: #fff;">${item.class}</strong>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">${item.distanceM}m • ${item.direction}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              "${item.phrase}"
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
}
