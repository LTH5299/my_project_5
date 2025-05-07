from flask import Flask, render_template
import os
import psycopg2

app = Flask(__name__)

@app.route('/')
def home():
    try:
        conn = psycopg2.connect(
            host=os.environ.get('DB_HOST', 'db'),
            database=os.environ.get('DB_NAME', 'postgres'),
            user=os.environ.get('DB_USER', 'postgres'),
            password=os.environ.get('DB_PASSWORD', 'postgres')
        )
        cur = conn.cursor()
        cur.execute('SELECT version();')
        db_version = cur.fetchone()
        cur.close()
        conn.close()
        return f'Hello, Docker! <br/> Database version: {db_version[0]}'
    except Exception as e:
        return f'Hello, Docker! <br/> Database connection failed: {str(e)}'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
