"""
SightWeaver - Convenience Launcher
Starts the Flask backend server and automatically opens the browser at http://127.0.0.1:5000
"""
import os
import sys
import webbrowser
import threading
import time

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from server import app

def open_browser(port):
    time.sleep(1.2)
    url = f"http://127.0.0.1:{port}"
    print(f"Opening SightWeaver in default browser: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not automatically open browser: {e}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 70)
    print("  SightWeaver: AI-Powered Smart Glasses for Visually Impaired")
    print(f"  Starting Localhost Server at http://127.0.0.1:{port}")
    print("=" * 70)
    
    # Launch browser in a background thread
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()
    
    # Run Flask server
    app.run(host="0.0.0.0", port=port, debug=False)
