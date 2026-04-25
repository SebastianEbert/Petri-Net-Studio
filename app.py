from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    # Flask will automatically look for this file inside the 'templates' folder
    return render_template('index.html')

if __name__ == '__main__':
    print("🚀 Starting Petri Net Editor...")
    print("🌐 Open your browser to: http://localhost:5000")
    app.run(debug=True, port=5000)
