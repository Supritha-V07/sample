"""
SightWeaver - Database Module
SQLite persistence for Saved Places, Familiar Routes, Trusted Contacts, and Audit Logs.
"""
import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "sightweaver.db")

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Saved Places table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS places (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        address TEXT,
        floor_info TEXT,
        landmarks TEXT,
        accessibility_notes TEXT,
        preferred_approach TEXT,
        is_favorite INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    # Familiar Routes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        origin_id TEXT,
        origin_name TEXT,
        destination_id TEXT,
        destination_name TEXT,
        estimated_time_mins INTEGER,
        distance_meters REAL,
        waypoints_json TEXT,
        turns_json TEXT,
        accessibility_notes TEXT,
        is_favorite INTEGER DEFAULT 0,
        last_used TEXT,
        created_at TEXT
    )
    """)

    # Trusted Contacts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        is_primary INTEGER DEFAULT 0,
        share_location INTEGER DEFAULT 1,
        share_camera INTEGER DEFAULT 0,
        created_at TEXT
    )
    """)

    # System Settings & Audit Log
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        details_json TEXT
    )
    """)

    conn.commit()

    # Seed initial realistic places if empty
    cursor.execute("SELECT COUNT(*) as count FROM places")
    if cursor.fetchone()["count"] == 0:
        seed_places(cursor)
        seed_routes(cursor)
        seed_contacts(cursor)
        conn.commit()

    conn.close()

def seed_places(cursor):
    now = datetime.utcnow().isoformat()
    initial_places = [
        {
            "id": "place_classroom_304",
            "name": "Room 304 - AI & CS Classroom",
            "category": "Education",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "address": "Turing Science Block, 3rd Floor",
            "floor_info": "3rd Floor, West Wing, Room 304",
            "landmarks": "Near the central elevator, turn right past the water dispenser.",
            "accessibility_notes": "Tactile floor guiding available; door opens outward; braille room plate on right.",
            "preferred_approach": "Take main west elevator, exit right, walk 15 meters.",
            "is_favorite": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "place_library",
            "name": "Central Library Entrance",
            "category": "Study",
            "latitude": 12.9720,
            "longitude": 77.5950,
            "address": "Academic Quadrangle, Ground Floor",
            "floor_info": "Ground Floor, Main Entrance",
            "landmarks": "Double glass automatic doors, chime sounder active at entry.",
            "accessibility_notes": "Ramp on the left side of front stairs; audio beacon enabled.",
            "preferred_approach": "Via north courtyard ramp, audio beacon guide active.",
            "is_favorite": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "place_cafeteria",
            "name": "Student Cafeteria & Dining Hall",
            "category": "Dining",
            "latitude": 12.9712,
            "longitude": 77.5940,
            "address": "Student Union Center, Level 1",
            "floor_info": "Level 1, South Hallway",
            "landmarks": "Scent of bakery, wide double doorway with tactile warning mat.",
            "accessibility_notes": "Order counter has lowered accessibility section on far left.",
            "preferred_approach": "South corridor, passing ATM kiosk.",
            "is_favorite": 0,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "place_home",
            "name": "Home Residence",
            "category": "Home",
            "latitude": 12.9780,
            "longitude": 77.6010,
            "address": "Flat 202, Green Meadows Apt, 2nd Floor",
            "floor_info": "2nd Floor, Unit 202",
            "landmarks": "RFID access reader at right of gate, 3 low steps with contrast edging.",
            "accessibility_notes": "Tactile warning strips before stairs; elevator equipped with audible voice.",
            "preferred_approach": "Main walkway past security booth.",
            "is_favorite": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "place_bus_stop",
            "name": "Campus Gate Bus Stop",
            "category": "Transit",
            "latitude": 12.9705,
            "longitude": 77.5930,
            "address": "University Main Road",
            "floor_info": "Outdoor Street Level",
            "landmarks": "Covered shelter with tactile paving leading to boarding kerb.",
            "accessibility_notes": "Raised curb for level bus entry; audible announcement system on route 335E.",
            "preferred_approach": "Main campus pedestrian gate, turn left along pavement.",
            "is_favorite": 1,
            "created_at": now,
            "updated_at": now
        }
    ]

    for p in initial_places:
        cursor.execute("""
        INSERT INTO places (id, name, category, latitude, longitude, address, floor_info, 
                            landmarks, accessibility_notes, preferred_approach, is_favorite, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (p["id"], p["name"], p["category"], p["latitude"], p["longitude"], p["address"],
              p["floor_info"], p["landmarks"], p["accessibility_notes"], p["preferred_approach"],
              p["is_favorite"], p["created_at"], p["updated_at"]))

def seed_routes(cursor):
    now = datetime.utcnow().isoformat()
    routes = [
        {
            "id": "route_to_classroom",
            "name": "Corridor to AI Classroom 304",
            "origin_id": "place_library",
            "origin_name": "Central Library Entrance",
            "destination_id": "place_classroom_304",
            "destination_name": "Room 304 - AI & CS Classroom",
            "estimated_time_mins": 3,
            "distance_meters": 85.0,
            "waypoints_json": json.dumps([
                {"step": 1, "instruction": "Proceed straight through the corridor for 15 meters.", "distance_m": 15, "direction": "straight", "landmark": "Past administrative bulletin board"},
                {"step": 2, "instruction": "Prepare to turn right at the main elevator foyer.", "distance_m": 20, "direction": "turn_right", "landmark": "Elevator chime audible ahead"},
                {"step": 3, "instruction": "Take elevator or accessible ramp to 3rd floor.", "distance_m": 10, "direction": "ascend", "landmark": "Tactile warning mat before elevator doors"},
                {"step": 4, "instruction": "Exit elevator, turn right and continue straight for 25 meters.", "distance_m": 25, "direction": "straight", "landmark": "Water dispenser on your left"},
                {"step": 5, "instruction": "Room 304 is on your right. Door has tactile plaque.", "distance_m": 15, "direction": "arrive", "landmark": "Room 304 entrance"}
            ]),
            "turns_json": json.dumps([
                {"turn": "Straight", "at_m": 0},
                {"turn": "Right", "at_m": 15},
                {"turn": "Ascend to 3F", "at_m": 35},
                {"turn": "Right", "at_m": 45},
                {"turn": "Destination on Right", "at_m": 85}
            ]),
            "accessibility_notes": "Step-free accessible route; tactile floor paths present throughout corridor.",
            "is_favorite": 1,
            "last_used": now,
            "created_at": now
        },
        {
            "id": "route_to_library",
            "name": "Campus Entrance to Central Library",
            "origin_id": "place_bus_stop",
            "origin_name": "Campus Gate Bus Stop",
            "destination_id": "place_library",
            "destination_name": "Central Library Entrance",
            "estimated_time_mins": 4,
            "distance_meters": 120.0,
            "waypoints_json": json.dumps([
                {"step": 1, "instruction": "Walk forward along the tactile sidewalk for 40 meters.", "distance_m": 40, "direction": "straight", "landmark": "Pedestrian gate"},
                {"step": 2, "instruction": "Slight left towards the quadrangle garden path.", "distance_m": 30, "direction": "slight_left", "landmark": "Fountain sound on right"},
                {"step": 3, "instruction": "Take the accessible ramp on the left of library stairs.", "distance_m": 20, "direction": "straight", "landmark": "Ramp handrail"},
                {"step": 4, "instruction": "Arrived at Central Library entrance automatic glass doors.", "distance_m": 30, "direction": "arrive", "landmark": "Automatic sliding doors with chime"}
            ]),
            "turns_json": json.dumps([
                {"turn": "Straight", "at_m": 0},
                {"turn": "Slight Left", "at_m": 40},
                {"turn": "Straight (Ramp)", "at_m": 70},
                {"turn": "Arrive", "at_m": 120}
            ]),
            "accessibility_notes": "Complete tactile paving; ramp slope 1:12; clear of overhead obstructions.",
            "is_favorite": 1,
            "last_used": now,
            "created_at": now
        }
    ]

    for r in routes:
        cursor.execute("""
        INSERT INTO routes (id, name, origin_id, origin_name, destination_id, destination_name,
                            estimated_time_mins, distance_meters, waypoints_json, turns_json,
                            accessibility_notes, is_favorite, last_used, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (r["id"], r["name"], r["origin_id"], r["origin_name"], r["destination_id"],
              r["destination_name"], r["estimated_time_mins"], r["distance_meters"],
              r["waypoints_json"], r["turns_json"], r["accessibility_notes"],
              r["is_favorite"], r["last_used"], r["created_at"]))

def seed_contacts(cursor):
    now = datetime.utcnow().isoformat()
    contacts = [
        {
            "id": "contact_guardian",
            "name": "Dr. Ananya Sharma",
            "relationship": "Guardian / Caregiver",
            "phone": "+91 98450 12345",
            "email": "ananya.sharma@assistive.org",
            "is_primary": 1,
            "share_location": 1,
            "share_camera": 1,
            "created_at": now
        },
        {
            "id": "contact_campus_security",
            "name": "University Campus Accessibility & Security Desk",
            "relationship": "Campus Support",
            "phone": "+91 80 2345 6789",
            "email": "accessibility@campus.edu",
            "is_primary": 0,
            "share_location": 1,
            "share_camera": 0,
            "created_at": now
        }
    ]

    for c in contacts:
        cursor.execute("""
        INSERT INTO contacts (id, name, relationship, phone, email, is_primary, share_location, share_camera, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (c["id"], c["name"], c["relationship"], c["phone"], c["email"], c["is_primary"],
              c["share_location"], c["share_camera"], c["created_at"]))
