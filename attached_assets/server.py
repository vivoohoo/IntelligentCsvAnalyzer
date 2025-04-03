import os
import requests
import socket
import json
from flask import Flask, render_template, send_from_directory, request, jsonify, Response
import logging
import time

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev_secret_key")

# Configuration
DJANGO_API_URL = "http://localhost:8000"

# API endpoint mock responses (for when the Django API isn't available)
MOCK_RESPONSES = {
    "chat": {"response": "I'm sorry, the backend server is not available. Please try again later."},
    "upload": {"response": "Unable to process your file. The backend server is not available."},
    "history": {"history": []}
}

def is_port_open(host, port, timeout=1):
    """Check if a port is open on the given host"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    result = sock.connect_ex((host, port))
    sock.close()
    return result == 0

def check_backend_service():
    """Check if the Django backend service is available"""
    return is_port_open("localhost", 8000)

@app.route('/api_status')
def api_status():
    """Return the status of the backend API"""
    backend_available = check_backend_service()
    return jsonify({
        "backend_available": backend_available,
        "timestamp": time.time()
    })

@app.route('/')
def index():
    logger.debug("Serving index page")
    return render_template('index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# Proxy routes for API endpoints
@app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def proxy_api(path):
    """
    Proxy requests to the Django backend API
    """
    url = f"{DJANGO_API_URL}/api/{path}"
    logger.debug(f"Proxying request to: {url}")
    
    # Check if backend is available
    if not check_backend_service():
        logger.error("Django backend is not available")
        
        # If it's an API we can mock, return the mock response
        endpoint = path.split('/')[0]
        if endpoint in MOCK_RESPONSES:
            return jsonify(MOCK_RESPONSES[endpoint]), 200
        
        # Otherwise return a general error
        return jsonify({"error": "Backend service is unavailable. Please try again later."}), 503
    
    try:
        # Log request details for debugging
        logger.debug(f"Request method: {request.method}")
        logger.debug(f"Request headers: {request.headers}")
        if request.is_json:
            logger.debug(f"Request JSON data: {json.dumps(request.get_json())}")
        if request.form:
            logger.debug(f"Request form data: {request.form}")
        if request.files:
            logger.debug(f"Request files: {list(request.files.keys())}")
        
        # Make the request to the Django backend
        if request.method == 'GET':
            resp = requests.get(url, params=request.args, timeout=30)
        elif request.method == 'POST':
            if request.files:
                # Handle file uploads
                files = {name: (file.filename, file.read(), file.content_type) 
                        for name, file in request.files.items()}
                data = request.form.to_dict()
                resp = requests.post(url, data=data, files=files, timeout=60)
            else:
                # Handle JSON requests
                if request.is_json:
                    resp = requests.post(url, json=request.get_json(), timeout=30)
                else:
                    resp = requests.post(url, data=request.form, timeout=30)
        elif request.method == 'PUT':
            resp = requests.put(url, json=request.get_json(), timeout=30)
        elif request.method == 'DELETE':
            resp = requests.delete(url, timeout=30)
        else:
            return jsonify({"error": f"Method {request.method} not supported"}), 405
        
        # Log response for debugging
        logger.debug(f"Backend response status: {resp.status_code}")
        logger.debug(f"Backend response headers: {resp.headers}")
        try:
            json_resp = resp.json()
            logger.debug(f"Backend response data: {json.dumps(json_resp)}")
        except:
            logger.debug("Backend response is not JSON")
        
        # Return the response from the backend
        return Response(
            resp.content, 
            status=resp.status_code,
            headers=dict(resp.headers)
        )
    except requests.exceptions.Timeout:
        logger.error(f"Timeout while connecting to the Django backend: {url}")
        return jsonify({"error": "Request to backend timed out. Please try again later."}), 504
    except requests.exceptions.ConnectionError:
        logger.error(f"Connection error while connecting to Django backend: {url}")
        return jsonify({"error": "Could not connect to backend service. Please try again later."}), 503
    except Exception as e:
        logger.error(f"Error proxying request: {str(e)}")
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting server on port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)
