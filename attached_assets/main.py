import os
import sys
import subprocess
import logging
import signal
import time
import threading
from server import app

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Make the Flask app available to Gunicorn
application = app

# Create a global variable for the Django process
django_process = None

def monitor_django_output(process):
    """Monitor and log the output from the Django process"""
    for line in iter(process.stdout.readline, ""):
        logger.info(f"Django: {line.strip()}")
    logger.info("Django process output stream closed")

def start_django_server():
    """Start the Django backend server as a subprocess"""
    global django_process
    try:
        logger.info("Starting Django backend server...")
        
        # Set Django environment variables
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
        
        # Add the current directory to sys.path if needed
        current_dir = os.path.dirname(os.path.abspath(__file__))
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)
        
        # Start Django as a separate process with full output capture
        django_process = subprocess.Popen(
            [sys.executable, 'manage.py', 'runserver', '0.0.0.0:8000', '--noreload'],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1  # Line buffered
        )
        
        # Start a thread to monitor Django output
        monitor_thread = threading.Thread(target=monitor_django_output, args=(django_process,))
        monitor_thread.daemon = True
        monitor_thread.start()
        
        # Give Django a moment to start up
        time.sleep(3)
        
        # Log process information
        logger.info(f"Django server started with PID: {django_process.pid}")
        
        # Check if the process is still running
        if django_process.poll() is not None:
            logger.error(f"Django process terminated prematurely with code {django_process.returncode}")
            return None
        
        # Set up a signal handler to stop Django when the Flask app stops
        def cleanup_django(signum, frame):
            if django_process:
                logger.info("Stopping Django server...")
                django_process.terminate()
                try:
                    django_process.wait(timeout=5)
                    logger.info("Django server stopped")
                except subprocess.TimeoutExpired:
                    logger.warning("Django server did not terminate gracefully, killing...")
                    django_process.kill()
            sys.exit(0)
            
        # Register signal handlers
        for sig in [signal.SIGTERM, signal.SIGINT]:
            signal.signal(sig, cleanup_django)
            
        return django_process
    
    except Exception as e:
        logger.error(f"Error starting Django server: {str(e)}")
        return None

def run_flask_server():
    """Run the Flask frontend server"""
    try:
        logger.info("Starting Flask frontend server...")
        app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
    except Exception as e:
        logger.error(f"Error starting Flask server: {str(e)}")

# Start Django server when this module is loaded (for Gunicorn)
django_proc = start_django_server()
if not django_proc or django_proc.poll() is not None:
    logger.error("Failed to start Django server properly, frontend will run with limited functionality")

if __name__ == "__main__":
    # Start Django server (this would be redundant with Gunicorn but necessary for direct execution)
    if not django_proc:
        django_proc = start_django_server()
    
    # Start Flask server
    run_flask_server()
    
    # Clean up Django when Flask exits
    if django_proc and django_proc.poll() is None:
        django_proc.terminate()
        try:
            django_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            django_proc.kill()