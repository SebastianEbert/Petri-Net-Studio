import argparse
from flask import Flask, render_template

app = Flask(__name__)

# Global variable to track the active mode
EDITOR_MODE = "default"

@app.route('/')
def index():
    # Serve a different HTML file based on the launch flag
    if EDITOR_MODE == "dineros":
        return render_template('dineros.html')
    else:
        return render_template('index.html')

if __name__ == '__main__':
    # Set up the argument parser
    parser = argparse.ArgumentParser(description="Petri Net Editor Server")
    parser.add_argument(
        '--dineros', 
        action='store_true', 
        help='Launch the Dineros configuration of the editor'
    )
    
    args = parser.parse_args()

    # Determine mode based on arguments
    if args.dineros:
        EDITOR_MODE = "dineros"
        print("Starting Petri Net Editor in DINEROS mode...")
    else:
        print("Starting Petri Net Editor in DEFAULT mode...")

    print("Open your browser to: http://localhost:5000")
    app.run(debug=True, port=5000)
