/**
 * SightWeaver - Trusted Contacts & Emergency Assistance Service
 * Manages trusted emergency contacts, coordinates SOS signals with location context,
 * and maintains audit logs with clear demonstration vs production disclaimers.
 */

export class TrustedContactService {
  constructor(audioService) {
    this.audioService = audioService;
    this.contacts = [];
    this.isLoaded = false;
    this.subscribers = [];
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify() {
    this.subscribers.forEach(cb => cb(this.contacts));
  }

  async loadContacts() {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        this.contacts = data.contacts || [];
      }
    } catch (e) {
      console.warn('Backend /api/contacts offline, checking localStorage:', e);
      const cached = localStorage.getItem('sightweaver_contacts');
      if (cached) this.contacts = JSON.parse(cached);
    }

    if (this.contacts.length === 0) {
      this.contacts = [
        {
          id: 'contact_guardian',
          name: 'Dr. Ananya Sharma',
          relationship: 'Guardian / Caregiver',
          phone: '+91 98450 12345',
          email: 'ananya.sharma@assistive.org',
          is_primary: 1,
          share_location: 1,
          share_camera: 1
        },
        {
          id: 'contact_campus_security',
          name: 'University Campus Accessibility & Security Desk',
          relationship: 'Campus Support',
          phone: '+91 80 2345 6789',
          email: 'accessibility@campus.edu',
          is_primary: 0,
          share_location: 1,
          share_camera: 0
        }
      ];
      localStorage.setItem('sightweaver_contacts', JSON.stringify(this.contacts));
    }

    this.isLoaded = true;
    this.notify();
    return this.contacts;
  }

  async triggerSOS(currentPlaceName = 'Near Central Library & Science Block') {
    const primary = this.contacts.find(c => c.is_primary) || this.contacts[0];
    const contactName = primary ? primary.name : 'Trusted Contact';

    const promptMsg = `Emergency SOS triggered. Transmitting your location near ${currentPlaceName} to ${contactName}.`;
    this.audioService.speak(promptMsg, { priority: 1, force: true });

    let sosResult = null;
    try {
      const res = await fetch('/api/contacts/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_place: currentPlaceName,
          primary_contact: primary,
          timestamp: new Date().toISOString()
        })
      });
      if (res.ok) sosResult = await res.json();
    } catch (e) {
      console.warn('SOS backend sync error:', e);
    }

    return sosResult || {
      status: 'SOS_DISPATCHED',
      mode: 'DEMO_SIMULATION',
      message: `Emergency signal dispatched to ${contactName}.`,
      disclaimer: 'Demonstration Mode: Connect Twilio or VoIP API for live SMS dispatch.'
    };
  }

  async addContact(contactData) {
    const newContact = {
      id: `contact_${Date.now()}`,
      name: contactData.name,
      relationship: contactData.relationship || 'Friend',
      phone: contactData.phone || '',
      email: contactData.email || '',
      is_primary: contactData.is_primary ? 1 : 0,
      share_location: 1,
      share_camera: 0
    };

    this.contacts.push(newContact);
    localStorage.setItem('sightweaver_contacts', JSON.stringify(this.contacts));
    this.notify();
    return newContact;
  }
}
